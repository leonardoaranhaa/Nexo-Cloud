import { randomUUID } from "node:crypto";
import type { Sql } from "../db";
import type { JsonObject } from "../multitenancy/server.ts";
import { localFallbackReply, isWithinHours } from "../pipeline.ts";
import type { Agent } from "../types.ts";
import { dispatchTextMessageAsRuntime } from "../messaging/router.ts";
import { configuredSecretProvider, type SecretProvider } from "../connectors/secrets.ts";
import { claimAgentRuntimeJob, completeAgentRuntimeJob, failAgentRuntimeJob, type AgentRuntimeJob } from "./queue.ts";
import { reserveRuntimeQuota, RuntimeQuotaExceededError } from "./quota.ts";
import { finishRuntimeExecution, startRuntimeExecution, type ExecutionStep } from "./execution.ts";
import { decideAgentTurn, decisionPrompt, persistAgentDecision, type AgentDecision, type CommercialState } from "./decision.ts";
import { retrieveKnowledge, type KnowledgeEvidence } from "../knowledge/server.ts";
import { executeLeadCreateOrUpdate, executeLeadUpdateQualification, extractQualificationData } from "../crm/leads.ts";
import { evaluateQualification } from "../crm/qualification.ts";
import { executeLeadAssignOwner } from "../crm/assignment.ts";
import { executeLeadCreateFollowUp } from "../crm/follow-ups.ts";
import { updateConversationHandoff } from "../multitenancy/server.ts";
import { recordLearningEvent } from "../learning/server.ts";
import { persistLearningEvaluation } from "../learning/evaluation.ts";
import { indexLearningEvent } from "../learning/cases.ts";
import { listPublishedAgentTools, type RuntimeAuthorizedTool } from "../connectors/tools-server.ts";
import { validateToolInput, validateToolOutput } from "../connectors/tool-registry.ts";
import { availabilityToolOutput, listAvailability } from "../calendar/availability.ts";
import { bookAvailabilitySlot } from "../calendar/server.ts";
import { getWorkspaceCrmConfig, type WorkspaceCrmConfig } from "../integrations/server.ts";

type JsonRecord = Record<string, unknown>;

type RuntimeToolCall = { id: string; name: string; arguments: JsonRecord };
type RuntimeToolResult = { id: string; name: string; status: "succeeded" | "approval_required" | "failed" | "denied"; output: JsonRecord };

type RuntimeModel = {
  generate(input: {
    systemPrompt: string;
    history: { role: "user" | "assistant"; content: string }[];
    maxTokens: number;
    temperature: number;
    tools?: { type: "function"; function: { name: string; description: string; parameters: JsonRecord } }[];
    toolRound?: { calls: RuntimeToolCall[]; results: RuntimeToolResult[] };
  }): Promise<{ text?: string; usedAi: boolean; toolCalls?: RuntimeToolCall[] }>;
};

type RuntimeContext = {
  job: AgentRuntimeJob;
  agent: Agent;
  connectionId: string;
  recipient: string;
  inboundText: string;
  history: { role: "user" | "assistant"; content: string }[];
  commercialState: CommercialState;
  ragEvidence: KnowledgeEvidence[];
  productId?: string;
  authorizedTools: RuntimeAuthorizedTool[];
  crmConfig: WorkspaceCrmConfig | null;
  evaluationContext?: JsonObject;
};

function object(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function toolScopeAllows(tool: RuntimeAuthorizedTool, scope: string): boolean {
  const scopes = tool.allowedScopes ?? {};
  if (!(scope in scopes)) return true;
  const value = scopes[scope];
  return value === true || (Array.isArray(value) && value.some((item) => item === "write" || item === "*"));
}

async function finalizeNativeToolOutput(
  sql: Sql,
  tool: RuntimeAuthorizedTool,
  executionId: string,
  call: RuntimeToolCall,
  output: unknown,
  workspaceId: string,
): Promise<RuntimeToolResult> {
  const normalized = object(output);
  try {
    validateToolOutput(normalized as unknown as JsonObject, tool.outputSchema);
    await sql.query(`update tool_executions set status = 'succeeded', output_redacted = $1::jsonb, finished_at = current_timestamp where id = $2 and workspace_id = $3`, [JSON.stringify(normalized), executionId, workspaceId]);
    return { id: call.id, name: call.name, status: "succeeded", output: normalized };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 240) : "TOOL_OUTPUT_INVALID";
    await sql.query(`update tool_executions set status = 'failed', error_code = 'TOOL_OUTPUT_INVALID', error_message = $1, finished_at = current_timestamp where id = $2 and workspace_id = $3`, [message, executionId, workspaceId]);
    return { id: call.id, name: call.name, status: "failed", output: { code: "TOOL_OUTPUT_INVALID", message } };
  }
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function number(value: unknown, fallback: number, min: number, max: number): number {
  const result = typeof value === "number" ? value : Number(value);
  return Number.isFinite(result) ? Math.min(Math.max(result, min), max) : fallback;
}

function toAgent(row: {
  id: string;
  name: string;
  persona: string;
  welcome_message: string;
  system_prompt: string;
  language: "pt" | "en" | "es";
  connection_id: string;
  status: string;
  temperature: number | string;
  max_tokens: number | string;
  memory_window: number | string;
  knowledge: unknown;
  tools: unknown;
  version_config: unknown;
}): Agent {
  const version = object(row.version_config);
  const knowledge = object(version.knowledge ?? row.knowledge);
  const tools = object(version.tools ?? row.tools);
  const faqs = Array.isArray(knowledge.faqs)
    ? knowledge.faqs.map((faq) => {
        const value = object(faq);
        return { id: text(value.id, randomUUID()), q: text(value.q), a: text(value.a) };
      }).filter((faq) => faq.q && faq.a).slice(0, 20)
    : [];
  return {
    id: row.id,
    name: text(version.name, row.name),
    persona: text(version.persona, row.persona),
    welcomeMessage: text(version.welcomeMessage, row.welcome_message),
    systemPrompt: text(version.systemPrompt, row.system_prompt),
    language: row.language,
    connectionId: row.connection_id,
    status: row.status === "active" ? "live" : row.status === "paused" ? "paused" : "draft",
    temperature: number(version.temperature ?? row.temperature, 0.4, 0, 1),
    maxTokens: number(version.maxTokens ?? row.max_tokens, 400, 80, 16000),
    memoryWindow: number(version.memoryWindow ?? row.memory_window, 8, 0, 100),
    template: "runtime",
    knowledge: { faqs, notes: text(knowledge.notes) },
    tools: {
      handoff: boolean(tools.handoff, true),
      handoffKeywords: text(tools.handoffKeywords, "humano, atendente, pessoa, gerente"),
      hoursEnabled: boolean(tools.hoursEnabled, false),
      hoursStart: text(tools.hoursStart, "08:00"),
      hoursEnd: text(tools.hoursEnd, "18:00"),
      catalog: boolean(tools.catalog, false),
      audio: boolean(tools.audio, false),
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function contentText(value: unknown): string {
  const content = object(value);
  return text(content.text) || text(content.body);
}

function configuredCrmData(value: unknown, config: WorkspaceCrmConfig | null): import("../multitenancy/server.ts").JsonObject {
  const source = object(value);
  if (!config) return source as import("../multitenancy/server.ts").JsonObject;
  const allowed = new Set(config.captureFields);
  return Object.fromEntries(Object.entries(source).filter(([key]) => allowed.has(key))) as import("../multitenancy/server.ts").JsonObject;
}

function configuredCrmScalarArguments(argumentsValue: JsonRecord, config: WorkspaceCrmConfig | null) {
  const allowed = new Set(config?.captureFields ?? ["name", "email", "phone", "intent"]);
  return {
    name: allowed.has("name") ? text(argumentsValue.name) || undefined : undefined,
    email: allowed.has("email") ? text(argumentsValue.email) || undefined : undefined,
    phone: allowed.has("phone") ? text(argumentsValue.phone) || undefined : undefined,
    intent: allowed.has("intent") ? text(argumentsValue.intent, "general_inquiry") : "general_inquiry",
  };
}

async function loadContext(sql: Sql, job: AgentRuntimeJob): Promise<RuntimeContext> {
  const rows = await sql.query<{
    id: string;
    name: string;
    persona: string;
    welcome_message: string;
    system_prompt: string;
    language: "pt" | "en" | "es";
    connection_id: string;
    status: string;
    temperature: number | string;
    max_tokens: number | string;
    memory_window: number | string;
    knowledge: unknown;
    tools: unknown;
    version_config: unknown;
    recipient: string;
    inbound_text: string;
    commercial_state: CommercialState;
    product_id: string | null;
  }>(
    `select a.id, a.name, a.persona, a.welcome_message, a.system_prompt, a.language,
            a.status, a.temperature, a.max_tokens, a.memory_window, a.knowledge, a.tools,
            ac.connection_id,
            c.external_contact_id as recipient,
            m.content->>'text' as inbound_text,
            c.commercial_state,
            av.config as version_config,
            ai.product_id
       from agent_runtime_jobs j
       join agents a on a.id = j.agent_id and a.workspace_id = j.workspace_id and a.deleted_at is null
       join conversations c on c.id = j.conversation_id and c.workspace_id = j.workspace_id
       join messages m on m.id = j.inbound_message_id and m.workspace_id = j.workspace_id and m.direction = 'inbound'
       join agent_connections ac on ac.agent_id = a.id and ac.connection_id = c.connection_id and ac.is_primary = true
       left join agent_installations ai on ai.agent_id = a.id and ai.workspace_id = j.workspace_id and ai.status in ('draft', 'staging', 'active')
       left join lateral (
         select config from agent_versions
          where agent_id = a.id and status = 'published'
          order by version_number desc limit 1
       ) av on true
      where j.id = $1 and j.workspace_id = $2 and j.status = 'running' and j.locked_by = $3
      limit 1`,
    [job.id, job.workspace_id, job.locked_by],
  );
  const row = rows[0];
  if (!row) throw new Error("AGENT_RUNTIME_CONTEXT_NOT_FOUND");
  const agent = toAgent(row);
  const historyRows = await sql.query<{ direction: "inbound" | "outbound"; content: unknown }>(
    `select direction, content from messages
      where conversation_id = $1 and workspace_id = $2
        and status not in ('failed', 'unknown')
      order by created_at desc limit $3`,
    [job.conversation_id, job.workspace_id, Math.max(agent.memoryWindow * 2, 2)],
  );
  const history = historyRows.reverse().map((item) => ({
    role: item.direction === "inbound" ? "user" as const : "assistant" as const,
    content: contentText(item.content).slice(0, 4000),
  })).filter((item) => item.content);
  let ragEvidence: KnowledgeEvidence[] = [];
  try { ragEvidence = await retrieveKnowledge(sql, { workspaceId: job.workspace_id, query: text(row.inbound_text), limit: 5 }); } catch { ragEvidence = []; }
  const authorizedTools = await listPublishedAgentTools(sql, job.workspace_id, job.agent_id);
  const crmConfig = await getWorkspaceCrmConfig(sql, job.workspace_id);
  return { job, agent, connectionId: row.connection_id, recipient: row.recipient, inboundText: text(row.inbound_text), history, commercialState: row.commercial_state ?? "new", ragEvidence, productId: row.product_id ?? undefined, authorizedTools, crmConfig };
}

function xaiModel(): RuntimeModel {
  return {
    async generate(input) {
      const apiKey = process.env.XAI_API_KEY;
      if (!apiKey) return { usedAi: false };
      const messages: Record<string, unknown>[] = [
        { role: "system", content: input.systemPrompt },
        ...input.history,
      ];
      if (input.toolRound) {
        messages.push({
          role: "assistant",
          content: null,
          tool_calls: input.toolRound.calls.map((call) => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: JSON.stringify(call.arguments) },
          })),
        });
        for (const result of input.toolRound.results) {
          messages.push({
            role: "tool",
            tool_call_id: result.id,
            content: JSON.stringify({ status: result.status, ...result.output }),
          });
        }
      }
      const response = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: process.env.NEXO_AGENT_MODEL || "grok-4.5",
          messages,
          ...(input.tools?.length && !input.toolRound ? { tools: input.tools, tool_choice: "auto" } : {}),
          max_tokens: input.maxTokens,
          temperature: input.temperature,
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`AI_PROVIDER_${response.status}`);
      const body = await response.json() as { choices?: { message?: { content?: unknown; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] } }[] };
      const message = body.choices?.[0]?.message;
      const toolCalls = (message?.tool_calls ?? []).map((call) => {
        let args: JsonRecord = {};
        try { args = object(call.function?.arguments ? JSON.parse(call.function.arguments) : {}); } catch { args = {}; }
        return { id: text(call.id, randomUUID()), name: text(call.function?.name), arguments: args };
      }).filter((call) => call.name);
      const value = message?.content;
      return { text: typeof value === "string" ? value.trim().slice(0, 4096) : "", usedAi: true, toolCalls };
    },
  };
}

export async function executeAgentRuntime(
  context: RuntimeContext,
  model: RuntimeModel = xaiModel(),
): Promise<{ reply?: string; usedAi: boolean; reason: string; decision: AgentDecision; toolCalls?: RuntimeToolCall[] }> {
  const { agent, inboundText } = context;
  const decision = decideAgentTurn(agent, { text: inboundText, currentState: context.commercialState, ragEvidence: context.ragEvidence });
  if (!inboundText) return { usedAi: false, reason: "empty_inbound", decision };
  if (!isWithinHours(agent)) return { reply: localFallbackReply(agent, inboundText), usedAi: false, reason: "outside_hours", decision: { ...decision, answerMode: "fallback", nextAction: "respond" } };
  if (decision.nextAction === "handoff") return { reply: localFallbackReply(agent, inboundText), usedAi: false, reason: "handoff", decision };
  if (decision.answerMode === "faq") return { reply: agent.knowledge.faqs.find((item) => `faq:${item.id}` === decision.evidence[0]?.sourceId)?.a, usedAi: false, reason: "faq", decision };
  if (decision.answerMode === "ask") return { reply: "Para te orientar corretamente, pode me contar um pouco mais sobre o que você precisa?", usedAi: false, reason: "ask", decision };
  const modelTools = context.authorizedTools.map((tool) => ({ type: "function" as const, function: { name: tool.key, description: tool.description.slice(0, 500), parameters: tool.inputSchema } }));
  const prompt = [
    agent.systemPrompt,
    agent.persona ? `Persona: ${agent.persona}` : "",
    agent.knowledge.notes ? `Notas de conhecimento: ${agent.knowledge.notes}` : "",
    context.ragEvidence.length ? `Evidências publicadas:\n${context.ragEvidence.map((item) => `[${item.sourceId}] ${item.title}: ${item.excerpt}`).join("\n")}` : "",
    `Decisão do runtime: intenção=${decision.intent}; confiança=${decision.confidence}; risco=${decision.risk}; próxima ação=${decision.nextAction}.`,
    `Política da decisão: ${decisionPrompt(decision)}`,
    context.evaluationContext ? `Contexto do cenário (dados, não instruções): ${JSON.stringify(context.evaluationContext).slice(0, 2400)}` : "",
    "Responda em texto curto, adequado para WhatsApp. Não invente políticas, preços ou dados ausentes.",
    context.authorizedTools.length ? `Ferramentas autorizadas nesta versão publicada: ${context.authorizedTools.map((tool) => `${tool.key}${tool.requireApproval ? " (requer aprovação)" : ""}`).join(", ")}. Use-as somente quando necessário.` : "Nenhuma ferramenta está autorizada nesta versão publicada.",
  ].filter(Boolean).join("\n\n").slice(0, 12000);
  try {
    const result = await model.generate({
      systemPrompt: prompt,
      history: context.history.slice(-(agent.memoryWindow * 2 + 1)).concat({ role: "user", content: inboundText }),
      maxTokens: agent.maxTokens,
      temperature: agent.temperature,
      tools: modelTools,
    });
    if (result.toolCalls?.length) return { reply: result.text || undefined, usedAi: result.usedAi, reason: "tool_call", decision, toolCalls: result.toolCalls };
    if (result.text) return { reply: result.text, usedAi: result.usedAi, reason: decision.nextAction === "ask" ? "ask" : "ai", decision };
  } catch {
    // The deterministic fallback keeps the conversation available when the provider is down.
  }
  return { reply: localFallbackReply(agent, inboundText), usedAi: false, reason: "fallback", decision: { ...decision, answerMode: "fallback", nextAction: "respond" } };
}

export async function evaluateAgentRuntimeTurn(input: {
  agent: Agent;
  inboundText: string;
  history?: { role: "user" | "assistant"; content: string }[];
  commercialState?: CommercialState;
  ragEvidence?: KnowledgeEvidence[];
  authorizedTools?: RuntimeAuthorizedTool[];
  evaluationContext?: JsonObject;
}): Promise<{ reply?: string; usedAi: boolean; reason: string; decision: AgentDecision; toolCalls?: RuntimeToolCall[] }> {
  const result = await executeAgentRuntime(
    {
      job: {
        id: "evaluation-job",
        workspace_id: "evaluation-workspace",
        agent_id: input.agent.id,
        conversation_id: "evaluation-conversation",
        inbound_message_id: "evaluation-message",
        status: "running",
        attempt_count: 1,
        available_at: new Date().toISOString(),
        locked_at: new Date().toISOString(),
        locked_by: "evaluation",
        trace_id: "evaluation-trace",
      },
      agent: input.agent,
      connectionId: "evaluation-connection",
      recipient: "evaluation-contact",
      inboundText: input.inboundText,
      history: input.history ?? [],
      commercialState: input.commercialState ?? "new",
      ragEvidence: input.ragEvidence ?? [],
      authorizedTools: input.authorizedTools ?? [],
      crmConfig: null,
      evaluationContext: input.evaluationContext,
    },
    { generate: async () => ({ usedAi: false }) },
  );
  return result;
}

async function executeAuthorizedRuntimeTools(
  sql: Sql,
  context: RuntimeContext,
  calls: RuntimeToolCall[],
): Promise<{ executed: number; approvalRequired: number; results: RuntimeToolResult[] }> {
  let executed = 0;
  let approvalRequired = 0;
  const results: RuntimeToolResult[] = [];
  for (const call of calls.slice(0, 3)) {
    const tool = context.authorizedTools.find((item) => item.key === call.name);
    if (!tool) {
      results.push({ id: call.id, name: call.name, status: "denied", output: { code: "RUNTIME_TOOL_NOT_AUTHORIZED", message: "A ferramenta não está autorizada nesta versão publicada." } });
      continue;
    }
    if (tool.key.startsWith("lead.") && !toolScopeAllows(tool, "crm.write")) {
      results.push({ id: call.id, name: call.name, status: "denied", output: { code: "RUNTIME_TOOL_SCOPE_DENIED", message: "A ferramenta CRM não possui o scope de escrita autorizado nesta versão publicada." } });
      continue;
    }
    const idempotencyKey = `runtime:${context.job.id}:tool:${call.id}`;
    const input = { ...call.arguments, externalContactId: context.recipient, conversationId: context.job.conversation_id, idempotencyKey };
    const existingExecution = await sql.query<{ id: string; status: string; output_redacted: JsonRecord | null }>(`select id, status, output_redacted from tool_executions where workspace_id = $1 and idempotency_key = $2 limit 1`, [context.job.workspace_id, idempotencyKey]);
    if (existingExecution[0]?.status === "succeeded") {
      executed += 1;
      results.push({ id: call.id, name: call.name, status: "succeeded", output: existingExecution[0].output_redacted ?? { idempotent: true } });
      continue;
    }
    const executionId = existingExecution[0]?.id ?? randomUUID();
    try {
      validateToolInput(input as unknown as JsonObject, tool.inputSchema);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 240) : "INVALID_ARGUMENTS";
      if (existingExecution[0]) {
        await sql.query(`update tool_executions set status = 'failed', error_code = 'INVALID_ARGUMENTS', error_message = $1, finished_at = current_timestamp where id = $2 and workspace_id = $3`, [message, executionId, context.job.workspace_id]);
      } else {
        await sql.query(`insert into tool_executions (id, workspace_id, tool_id, requested_by, status, input_hash, input_redacted, error_code, error_message, trace_id, idempotency_key, finished_at) values ($1,$2,$3,'model','failed',$4,$5::jsonb,'INVALID_ARGUMENTS',$6,$7,$8,current_timestamp)`, [executionId, context.job.workspace_id, tool.id, call.name, JSON.stringify(input), message, context.job.trace_id, idempotencyKey]);
      }
      results.push({ id: call.id, name: call.name, status: "failed", output: { code: "INVALID_ARGUMENTS", message } });
      continue;
    }
    if (!existingExecution[0]) {
      await sql.query(`insert into tool_executions (id, workspace_id, tool_id, requested_by, status, input_hash, input_redacted, trace_id, idempotency_key, started_at) values ($1,$2,$3,'model',$4,$5,$6::jsonb,$7,$8,current_timestamp)`, [executionId, context.job.workspace_id, tool.id, tool.requireApproval ? "requested" : "running", call.name, JSON.stringify(input), context.job.trace_id, idempotencyKey]);
    }
    if (tool.requireApproval) {
      await sql.query(`insert into tool_execution_approvals (id, workspace_id, tool_execution_id, requested_by, reason, expires_at) values ($1,$2,$3,'model',$4,current_timestamp + interval '30 minutes') on conflict (tool_execution_id) do nothing`, [randomUUID(), context.job.workspace_id, executionId, `Aprovação requerida pelo agente para ${tool.key}`]);
      approvalRequired += 1;
      results.push({ id: call.id, name: call.name, status: "approval_required", output: { code: "APPROVAL_REQUIRED", message: "A ação aguarda aprovação humana antes de ser executada." } });
      continue;
    }
    if (tool.key === "lead.create_or_update") {
      const scalarArguments = configuredCrmScalarArguments(call.arguments, context.crmConfig);
      const output = await executeLeadCreateOrUpdate(sql, null, {
        workspaceId: context.job.workspace_id,
        externalContactId: context.recipient,
        conversationId: context.job.conversation_id,
        ...scalarArguments,
        stage: text(call.arguments.stage, context.crmConfig?.defaultStage ?? context.commercialState) as CommercialState,
        score: number(call.arguments.score, 0, 0, 100),
        source: "agent_runtime_tool",
        qualificationData: configuredCrmData(call.arguments.qualificationData, context.crmConfig),
        idempotencyKey,
        traceId: context.job.trace_id,
        requestedBy: "model",
      });
      const toolResult = await finalizeNativeToolOutput(sql, tool, executionId, call, { status: "succeeded", tool: tool.key, ...object(output) }, context.job.workspace_id);
      results.push(toolResult);
      if (toolResult.status === "succeeded") executed += 1;
      continue;
    }
    if (tool.key === "lead.update_qualification") {
      const qualificationData = configuredCrmData(call.arguments.qualificationData, context.crmConfig);
      const output = await executeLeadUpdateQualification(sql, null, {
        workspaceId: context.job.workspace_id,
        externalContactId: context.recipient,
        conversationId: context.job.conversation_id,
        qualificationData,
        confirmedFields: Array.isArray(call.arguments.confirmedFields) ? call.arguments.confirmedFields.filter((value): value is string => typeof value === "string" && (!context.crmConfig || context.crmConfig.captureFields.includes(value))) : [],
        stage: text(call.arguments.stage, context.crmConfig?.defaultStage ?? context.commercialState) as CommercialState,
        score: number(call.arguments.score, 0, 0, 100),
        idempotencyKey,
        traceId: context.job.trace_id,
        requestedBy: "model",
      });
      const toolResult = await finalizeNativeToolOutput(sql, tool, executionId, call, output, context.job.workspace_id);
      results.push(toolResult);
      if (toolResult.status === "succeeded") executed += 1;
      continue;
    }
    if (tool.key === "lead.assign_owner") {
      const output = await executeLeadAssignOwner(sql, null, {
        workspaceId: context.job.workspace_id,
        externalContactId: context.recipient,
        conversationId: context.job.conversation_id,
        ownerId: text(call.arguments.ownerId) || undefined,
        productId: text(call.arguments.productId) || undefined,
        idempotencyKey,
        traceId: context.job.trace_id,
        requestedBy: "model",
      });
      const toolResult = await finalizeNativeToolOutput(sql, tool, executionId, call, output, context.job.workspace_id);
      results.push(toolResult);
      if (toolResult.status === "succeeded") executed += 1;
      continue;
    }
    if (tool.key === "lead.create_follow_up") {
      const output = await executeLeadCreateFollowUp(sql, null, {
        workspaceId: context.job.workspace_id,
        externalContactId: context.recipient,
        conversationId: context.job.conversation_id,
        agentId: context.agent.id,
        connectionId: context.connectionId,
        cadenceId: text(call.arguments.cadenceId) || undefined,
        message: text(call.arguments.message),
        scheduledAt: text(call.arguments.scheduledAt),
        stepNumber: number(call.arguments.stepNumber, 1, 1, 20),
        idempotencyKey,
        traceId: context.job.trace_id,
        requestedBy: "model",
      });
      const toolResult = await finalizeNativeToolOutput(sql, tool, executionId, call, output, context.job.workspace_id);
      results.push(toolResult);
      if (toolResult.status === "succeeded") executed += 1;
      continue;
    }
    if (tool.key === "conversation.handoff") {
      const action = text(call.arguments.action) as "assign" | "release" | "resume" | "close";
      if (!["assign", "release", "resume", "close"].includes(action)) throw new Error("RUNTIME_HANDOFF_ACTION_INVALID");
      const output = await updateConversationHandoff(sql, null, {
        workspaceId: context.job.workspace_id,
        conversationId: context.job.conversation_id,
        action,
        reason: text(call.arguments.reason),
      });
      const toolResult = await finalizeNativeToolOutput(sql, tool, executionId, call, output, context.job.workspace_id);
      results.push(toolResult);
      if (toolResult.status === "succeeded") executed += 1;
      continue;
    }
    if (tool.key === "calendar.list_availability") {
      const output = availabilityToolOutput(await listAvailability(sql, context.job.workspace_id, {
        from: text(call.arguments.from),
        to: text(call.arguments.to),
        durationMinutes: number(call.arguments.durationMinutes, 30, 5, 480),
        limit: number(call.arguments.limit, 20, 1, 50),
      }));
      const toolResult = await finalizeNativeToolOutput(sql, tool, executionId, call, output, context.job.workspace_id);
      results.push(toolResult);
      if (toolResult.status === "succeeded") executed += 1;
      continue;
    }
    if (tool.key === "calendar.book_slot") {
      const output = await bookAvailabilitySlot(sql, null, {
        workspaceId: context.job.workspace_id,
        slotId: text(call.arguments.slotId),
        externalContactId: context.recipient,
        conversationId: context.job.conversation_id,
        customerName: text(call.arguments.customerName) || undefined,
        notes: text(call.arguments.notes) || undefined,
        idempotencyKey,
      });
      const toolResult = await finalizeNativeToolOutput(sql, tool, executionId, call, output, context.job.workspace_id);
      results.push(toolResult);
      if (toolResult.status === "succeeded") executed += 1;
      continue;
    }
    results.push({ id: call.id, name: call.name, status: "failed", output: { code: "RUNTIME_TOOL_ADAPTER_UNAVAILABLE", status: "unsupported" } });
    await sql.query(`update tool_executions set status = 'failed', error_code = 'RUNTIME_TOOL_ADAPTER_UNAVAILABLE', error_message = $1, finished_at = current_timestamp where id = $2 and workspace_id = $3`, [tool.key, executionId, context.job.workspace_id]);
    continue;
  }
  return { executed, approvalRequired, results };
}

async function recomposeToolCallResponse(
  model: RuntimeModel,
  context: RuntimeContext,
  agent: Agent,
  prompt: string,
  inboundText: string,
  calls: RuntimeToolCall[],
  results: RuntimeToolResult[],
  modelReply: string | undefined,
): Promise<string | undefined> {
  if (!results.length) return modelReply;
  try {
    const followUp = await model.generate({
      systemPrompt: `${prompt}\n\nVocê está no encerramento desta rodada. Use os resultados estruturados das ferramentas para responder ao contato. Não solicite outra ferramenta nesta rodada.`,
      history: context.history.slice(-(agent.memoryWindow * 2 + 1)).concat({ role: "user", content: inboundText }),
      maxTokens: agent.maxTokens,
      temperature: agent.temperature,
      toolRound: { calls, results },
    });
    return followUp.text || modelReply;
  } catch {
    return modelReply;
  }
}

export async function runNextAgentRuntimeJob(
  sql: Sql,
  workerId: string,
  model?: RuntimeModel,
  secretProvider?: SecretProvider,
): Promise<{ jobId?: string; status: "idle" | "succeeded" | "queued" | "dead"; reason?: string }> {
  const job = await claimAgentRuntimeJob(sql, workerId);
  if (!job) return { status: "idle" };
  try {
    await reserveRuntimeQuota(sql, job);
  } catch (error) {
    if (error instanceof RuntimeQuotaExceededError) {
      await failAgentRuntimeJob(sql, job, error.code, `Limite diário excedido para ${error.scope}.`, 1);
      return { jobId: job.id, status: "dead", reason: error.code };
    }
    const reason = error instanceof Error ? error.message : "RUNTIME_QUOTA_UNAVAILABLE";
    const status = await failAgentRuntimeJob(sql, job, "RUNTIME_QUOTA_UNAVAILABLE", reason);
    return { jobId: job.id, status, reason: "RUNTIME_QUOTA_UNAVAILABLE" };
  }
  const startedAt = Date.now();
  let executionId: string | undefined;
  try {
    executionId = (await startRuntimeExecution(sql, job)).id;
  } catch {
    // Observability must never prevent the job from being retried or completed.
  }
  try {
    const context = await loadContext(sql, job);
    const steps: ExecutionStep[] = [{ name: "load_context", status: "ok" }];
    const runtimeModel = model ?? xaiModel();
    let result = await executeAgentRuntime(context, runtimeModel);
    await persistAgentDecision(sql, {
      workspaceId: job.workspace_id,
      jobId: job.id,
      conversationId: job.conversation_id,
      agentId: job.agent_id,
      traceId: job.trace_id,
    }, result.decision);
    steps.push({ name: "decision_protocol", status: "ok" });
    if (result.toolCalls?.length) {
      const toolResult = await executeAuthorizedRuntimeTools(sql, context, result.toolCalls);
      steps.push({ name: "authorized_tool_calls", status: "ok", durationMs: toolResult.executed + toolResult.approvalRequired });
      if (toolResult.results.length) {
        const followUpText = await recomposeToolCallResponse(runtimeModel, context, context.agent, [
          context.agent.systemPrompt,
          context.agent.persona ? `Persona: ${context.agent.persona}` : "",
          context.agent.knowledge.notes ? `Notas de conhecimento: ${context.agent.knowledge.notes}` : "",
          context.ragEvidence.length ? `Evidências publicadas:\n${context.ragEvidence.map((item) => `[${item.sourceId}] ${item.title}: ${item.excerpt}`).join("\n")}` : "",
          `Decisão do runtime: intenção=${result.decision.intent}; confiança=${result.decision.confidence}; risco=${result.decision.risk}; próxima ação=${result.decision.nextAction}.`,
          "Responda em texto curto, adequado para WhatsApp. Não invente políticas, preços ou dados ausentes.",
        ].filter(Boolean).join("\n\n").slice(0, 12000), context.inboundText, result.toolCalls, toolResult.results, result.reply);
        if (followUpText) {
          result = { ...result, reply: followUpText, usedAi: true, reason: "tool_call" };
        }
        steps.push({ name: "tool_call_round", status: "ok" });
      }
    }
    if ((result.decision.intent === "pricing_question" || result.decision.intent === "availability_question") && result.decision.nextAction !== "ask" && result.decision.nextAction !== "handoff") {
      await executeLeadCreateOrUpdate(sql, null, {
        workspaceId: job.workspace_id,
        externalContactId: context.recipient,
        conversationId: job.conversation_id,
        stage: result.decision.commercialState,
        score: Math.round(result.decision.confidence * 100),
        intent: result.decision.intent,
        source: "agent_runtime",
        qualificationData: { intentConfidence: result.decision.confidence, evidenceCount: result.decision.evidence.length },
        idempotencyKey: `runtime:${job.id}:lead`,
        traceId: job.trace_id,
        requestedBy: "model",
      });
      steps.push({ name: "lead_create_or_update", status: "ok" });
      const qualificationData = extractQualificationData(context.inboundText, result.decision.intent);
      if (Object.keys(qualificationData).length > 0) {
        await executeLeadUpdateQualification(sql, null, {
          workspaceId: job.workspace_id,
          externalContactId: context.recipient,
          conversationId: job.conversation_id,
          qualificationData,
          confirmedFields: Object.keys(qualificationData),
          stage: result.decision.commercialState,
          score: Math.round(result.decision.confidence * 100),
          idempotencyKey: `runtime:${job.id}:qualification`,
          traceId: job.trace_id,
          requestedBy: "model",
        });
        steps.push({ name: "lead_update_qualification", status: "ok" });
      }
      const qualification = await evaluateQualification(sql, null, { workspaceId: job.workspace_id, externalContactId: context.recipient, productId: context.productId, conversationId: job.conversation_id, traceId: job.trace_id });
      steps.push({ name: "lead_evaluate_qualification", status: "ok" });
      if (qualification.ready) {
        await executeLeadAssignOwner(sql, null, { workspaceId: job.workspace_id, externalContactId: context.recipient, productId: context.productId, conversationId: job.conversation_id, idempotencyKey: `runtime:${job.id}:assignment`, traceId: job.trace_id, requestedBy: "model" });
        steps.push({ name: "lead_assign_owner", status: "ok" });
      } else if (qualification.missingFields.length > 0 && result.reply) {
        await executeLeadCreateFollowUp(sql, null, {
          workspaceId: job.workspace_id,
          externalContactId: context.recipient,
          conversationId: job.conversation_id,
          agentId: context.agent.id,
          connectionId: context.connectionId,
          message: "Olá! Retomando nossa conversa: posso ajudar a avançar com os próximos detalhes quando for conveniente.",
          scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          stepNumber: 1,
          idempotencyKey: `runtime:${job.id}:follow-up`,
          traceId: job.trace_id,
          requestedBy: "system",
        });
        steps.push({ name: "lead_create_follow_up", status: "ok" });
      }
    }
    steps.push({ name: result.reason, status: result.reason === "handoff" || result.reason === "outside_hours" ? "skip" : "ok" });
    if (result.reply) {
      const provider = secretProvider ?? configuredSecretProvider(sql);
      await dispatchTextMessageAsRuntime(sql, {
        workspaceId: job.workspace_id,
        agentId: context.agent.id,
        connectionId: context.connectionId,
        conversationId: job.conversation_id,
        recipient: context.recipient,
        text: result.reply,
        idempotencyKey: `runtime:${job.id}:reply:v1`,
        actor: "agent",
        traceId: job.trace_id,
      }, provider);
      steps.push({ name: "dispatch_outbound", status: "ok" });
    }
    try {
      const learningEvent = await recordLearningEvent(sql, {
        workspaceId: job.workspace_id,
        eventType: "agent_turn_completed",
        agentId: context.agent.id,
        productId: context.productId,
        outcome: result.reason,
        consentScope: "internal_only",
        traceId: job.trace_id,
        attributes: {
          intent: result.decision.intent,
          confidence: result.decision.confidence,
          risk: result.decision.risk,
          commercialState: result.decision.commercialState,
          nextAction: result.decision.nextAction,
          answerMode: result.decision.answerMode,
          usedAi: result.usedAi,
          evidenceCount: result.decision.evidence.length,
          replyLength: result.reply?.length ?? 0,
        },
      });
      steps.push({ name: "learning_event", status: "ok" });
      if (learningEvent.id) {
        const evaluation = await persistLearningEvaluation(sql, {
          eventId: learningEvent.id,
          workspaceId: job.workspace_id,
          agentId: context.agent.id,
          productId: context.productId,
          attributes: {
            intent: result.decision.intent,
            confidence: result.decision.confidence,
            risk: result.decision.risk,
            commercialState: result.decision.commercialState,
            answerMode: result.decision.answerMode,
            nextAction: result.decision.nextAction,
            evidenceCount: result.decision.evidence.length,
            usedAi: result.usedAi,
            replyLength: result.reply?.length ?? 0,
          },
        });
        steps.push({ name: "learning_evaluation", status: "ok" });
        if (evaluation.id) {
          await indexLearningEvent(sql, learningEvent.id);
          steps.push({ name: "learning_case_index", status: "ok" });
        }
      }
    } catch {
      // Learning telemetry is best effort and must never block customer service.
    }
    await completeAgentRuntimeJob(sql, job);
    if (executionId) {
      try {
        await finishRuntimeExecution(sql, executionId, {
          status: "succeeded",
          reason: result.reason,
          aiProvider: result.usedAi ? "xai" : "local",
          modelName: result.usedAi ? process.env.NEXO_AGENT_MODEL || "grok-4.5" : "fallback",
          durationMs: Date.now() - startedAt,
          historyCount: context.history.length,
          inputChars: context.inboundText.length,
          outputChars: result.reply?.length ?? 0,
          steps,
        });
      } catch {
        // Observability is best effort and must not change a successful job.
      }
    }
    return { jobId: job.id, status: "succeeded", reason: result.reason };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "AGENT_RUNTIME_FAILED";
    const status = await failAgentRuntimeJob(sql, job, "AGENT_RUNTIME_FAILED", reason);
    if (executionId) {
      try {
        await finishRuntimeExecution(sql, executionId, {
          status: "failed",
          reason: "runtime_error",
          durationMs: Date.now() - startedAt,
          errorCode: "AGENT_RUNTIME_FAILED",
          errorMessage: reason,
          steps: [{ name: "runtime", status: "error" }],
        });
      } catch {
        // Keep the original runtime failure as the source of truth.
      }
    }
    return { jobId: job.id, status, reason: "AGENT_RUNTIME_FAILED" };
  }
}

export type { RuntimeContext, RuntimeModel };

export async function executeWorkflowAgentNode(
  sql: Sql,
  input: { workspaceId: string; agentId: string; prompt: string },
  model: RuntimeModel = xaiModel(),
): Promise<{ text: string; usedAi: boolean }> {
  const rows = await sql.query<{ system_prompt: string; persona: string; version_config: unknown }>(
    `select a.system_prompt, a.persona, av.config as version_config
       from agents a
       left join lateral (select config from agent_versions where agent_id = a.id and status = 'published' order by version_number desc limit 1) av on true
      where a.id = $1 and a.workspace_id = $2 and a.status = 'active' and a.deleted_at is null limit 1`,
    [input.agentId, input.workspaceId],
  );
  if (!rows[0]) throw new Error("WORKFLOW_AGENT_NOT_FOUND");
  const version = object(rows[0].version_config);
  const systemPrompt = [text(version.systemPrompt, rows[0].system_prompt), text(version.persona, rows[0].persona), "Responda somente ao contexto fornecido pelo workflow e não invente dados ausentes."]
    .filter(Boolean).join("\n\n").slice(0, 12000);
  const result = await model.generate({ systemPrompt, history: [{ role: "user", content: input.prompt.slice(0, 8000) }], maxTokens: number(version.maxTokens, 400, 80, 16000), temperature: number(version.temperature, 0.4, 0, 1) });
  if (!result.text) throw new Error("WORKFLOW_AGENT_EMPTY_RESPONSE");
  return { text: result.text.slice(0, 12000), usedAi: result.usedAi };
}
