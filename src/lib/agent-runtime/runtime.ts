import { randomUUID } from "node:crypto";
import type { Sql } from "../db";
import { localFallbackReply, isWithinHours, matchFaq, wantsHandoff } from "../pipeline.ts";
import type { Agent } from "../types.ts";
import { dispatchTextMessageAsRuntime } from "../messaging/router.ts";
import { awsSecretsManagerProvider, unavailableSecretProvider, type SecretProvider } from "../connectors/secrets.ts";
import { claimAgentRuntimeJob, completeAgentRuntimeJob, failAgentRuntimeJob, type AgentRuntimeJob } from "./queue.ts";
import { finishRuntimeExecution, startRuntimeExecution, type ExecutionStep } from "./execution.ts";

type JsonRecord = Record<string, unknown>;

type RuntimeModel = {
  generate(input: {
    systemPrompt: string;
    history: { role: "user" | "assistant"; content: string }[];
    maxTokens: number;
    temperature: number;
  }): Promise<{ text?: string; usedAi: boolean }>;
};

type RuntimeContext = {
  job: AgentRuntimeJob;
  agent: Agent;
  connectionId: string;
  recipient: string;
  inboundText: string;
  history: { role: "user" | "assistant"; content: string }[];
};

function object(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
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
  }>(
    `select a.id, a.name, a.persona, a.welcome_message, a.system_prompt, a.language,
            a.status, a.temperature, a.max_tokens, a.memory_window, a.knowledge, a.tools,
            ac.connection_id,
            c.external_contact_id as recipient,
            m.content->>'text' as inbound_text,
            av.config as version_config
       from agent_runtime_jobs j
       join agents a on a.id = j.agent_id and a.workspace_id = j.workspace_id and a.deleted_at is null
       join conversations c on c.id = j.conversation_id and c.workspace_id = j.workspace_id
       join messages m on m.id = j.inbound_message_id and m.workspace_id = j.workspace_id and m.direction = 'inbound'
       join agent_connections ac on ac.agent_id = a.id and ac.connection_id = c.connection_id and ac.is_primary = true
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
  return { job, agent, connectionId: row.connection_id, recipient: row.recipient, inboundText: text(row.inbound_text), history };
}

function xaiModel(): RuntimeModel {
  return {
    async generate(input) {
      const apiKey = process.env.XAI_API_KEY;
      if (!apiKey) return { usedAi: false };
      const response = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: process.env.NEXO_AGENT_MODEL || "grok-4.5",
          messages: [{ role: "system", content: input.systemPrompt }, ...input.history],
          max_tokens: input.maxTokens,
          temperature: input.temperature,
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`AI_PROVIDER_${response.status}`);
      const body = await response.json() as { choices?: { message?: { content?: unknown } }[] };
      const value = body.choices?.[0]?.message?.content;
      return { text: typeof value === "string" ? value.trim().slice(0, 4096) : "", usedAi: true };
    },
  };
}

export async function executeAgentRuntime(
  context: RuntimeContext,
  model: RuntimeModel = xaiModel(),
): Promise<{ reply?: string; usedAi: boolean; reason: string }> {
  const { agent, inboundText } = context;
  if (!inboundText) return { usedAi: false, reason: "empty_inbound" };
  if (!isWithinHours(agent)) return { reply: localFallbackReply(agent, inboundText), usedAi: false, reason: "outside_hours" };
  if (wantsHandoff(agent, inboundText)) return { reply: localFallbackReply(agent, inboundText), usedAi: false, reason: "handoff" };
  const faq = matchFaq(agent, inboundText);
  if (faq) return { reply: faq.a, usedAi: false, reason: "faq" };
  const prompt = [
    agent.systemPrompt,
    agent.persona ? `Persona: ${agent.persona}` : "",
    agent.knowledge.notes ? `Notas de conhecimento: ${agent.knowledge.notes}` : "",
    "Responda em texto curto, adequado para WhatsApp. Não invente políticas, preços ou dados ausentes.",
  ].filter(Boolean).join("\n\n").slice(0, 12000);
  try {
    const result = await model.generate({
      systemPrompt: prompt,
      history: context.history.slice(-(agent.memoryWindow * 2 + 1)).concat({ role: "user", content: inboundText }),
      maxTokens: agent.maxTokens,
      temperature: agent.temperature,
    });
    if (result.text) return { reply: result.text, usedAi: result.usedAi, reason: "ai" };
  } catch {
    // The deterministic fallback keeps the conversation available when the provider is down.
  }
  return { reply: localFallbackReply(agent, inboundText), usedAi: false, reason: "fallback" };
}

export async function runNextAgentRuntimeJob(
  sql: Sql,
  workerId: string,
  model?: RuntimeModel,
  secretProvider?: SecretProvider,
): Promise<{ jobId?: string; status: "idle" | "succeeded" | "queued" | "dead"; reason?: string }> {
  const job = await claimAgentRuntimeJob(sql, workerId);
  if (!job) return { status: "idle" };
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
    const result = await executeAgentRuntime(context, model);
    steps.push({ name: result.reason, status: result.reason === "handoff" || result.reason === "outside_hours" ? "skip" : "ok" });
    if (result.reply) {
      const provider = secretProvider ?? (process.env.NEXO_SECRETS_BACKEND === "aws" && process.env.AWS_REGION
        ? awsSecretsManagerProvider({ region: process.env.AWS_REGION })
        : unavailableSecretProvider());
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
