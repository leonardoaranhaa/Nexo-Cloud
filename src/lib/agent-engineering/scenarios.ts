import { randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";
import type { Agent, Faq } from "../types.ts";
import { requireWorkspaceAccess, type JsonObject } from "../multitenancy/server.ts";
import { retrieveKnowledge, type KnowledgeEvidence } from "../knowledge/server.ts";
import { evaluateAgentRuntimeTurn } from "../agent-runtime/runtime.ts";
import { listAgentToolsForVersion, type RuntimeAuthorizedTool } from "../connectors/tools-server.ts";
import { indexLearningEvent } from "../learning/cases.ts";
import { persistLearningEvaluation } from "../learning/evaluation.ts";
import { recordLearningEvent } from "../learning/server.ts";
import type { BlueprintScenarioExpected, BlueprintScenarioInput, BlueprintScenarioResult, BlueprintTestScenario } from "./types.ts";

export type BlueprintEvaluationRun = {
  id: string;
  workspaceId: string;
  agentId: string;
  blueprintId: string;
  agentVersionId: string | null;
  status: "succeeded" | "failed";
  scenarioCount: number;
  passedCount: number;
  failedCount: number;
  results: BlueprintScenarioResult[];
};

export type BlueprintVersionEvaluation = {
  agentVersionId: string | null;
  versionSnapshot: JsonObject;
  toolsSnapshot: JsonObject[];
  scenarios: BlueprintTestScenario[];
  results: BlueprintScenarioResult[];
};

type BlueprintRow = {
  id: string;
  workspace_id: string;
  agent_id: string;
  agent_type: string;
  test_scenarios: unknown;
  version_id: string | null;
  version_config: unknown;
  agent_name: string;
  agent_persona: string;
  welcome_message: string;
  system_prompt: string;
  language: "pt" | "en" | "es";
  temperature: number | string;
  max_tokens: number | string;
  memory_window: number | string;
  knowledge: unknown;
  tools: unknown;
};

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function boundedTextList(value: unknown, maxItems = 12, maxLength = 180): string[] {
  return (Array.isArray(value) ? value : [])
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function number(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
}

function listFaqs(value: unknown): Faq[] {
  const source = object(value);
  return (Array.isArray(source.faqs) ? source.faqs : [])
    .map((item, index) => {
      const faq = object(item);
      return { id: text(faq.id, `faq-${index + 1}`), q: text(faq.q), a: text(faq.a) };
    })
    .filter((faq) => faq.q && faq.a)
    .slice(0, 50);
}

function evaluationAgent(row: BlueprintRow): Agent {
  const config = object(row.version_config);
  const knowledge = object(config.knowledge ?? row.knowledge);
  const tools = object(config.tools ?? row.tools);
  return {
    id: row.agent_id,
    name: text(config.name, row.agent_name),
    persona: text(config.persona, row.agent_persona),
    welcomeMessage: text(config.welcomeMessage, row.welcome_message),
    systemPrompt: text(config.systemPrompt, row.system_prompt),
    language: row.language,
    connectionId: null,
    status: "draft",
    temperature: number(config.temperature ?? row.temperature, 0.3, 0, 1),
    maxTokens: number(config.maxTokens ?? row.max_tokens, 400, 80, 16000),
    memoryWindow: number(config.memoryWindow ?? row.memory_window, 8, 0, 100),
    template: "evaluation",
    knowledge: { faqs: listFaqs(knowledge), notes: text(knowledge.notes) },
    tools: {
      handoff: tools.handoff !== false,
      handoffKeywords: text(tools.handoffKeywords, "humano, atendente, pessoa, gerente"),
      hoursEnabled: tools.hoursEnabled === true,
      hoursStart: text(tools.hoursStart, "08:00"),
      hoursEnd: text(tools.hoursEnd, "18:00"),
      catalog: tools.catalog === true,
      audio: tools.audio === true,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function normalizeExpected(value: unknown): BlueprintScenarioExpected {
  const source = object(value);
  return {
    contains: boundedTextList(source.contains),
    notContains: boundedTextList(source.notContains ?? source.not_contains),
    toolsCalled: boundedTextList(source.toolsCalled ?? source.tools_called, 8, 120),
    handoff: typeof source.handoff === "boolean" ? source.handoff : undefined,
    maxTokens: source.maxTokens === undefined && source.max_tokens === undefined
      ? undefined
      : number(source.maxTokens ?? source.max_tokens, 400, 1, 16000),
  };
}

function normalizeScenario(value: unknown, index: number): BlueprintTestScenario | null {
  if (typeof value === "string" && value.trim()) {
    return { id: `legacy-${index + 1}`, name: value.trim().slice(0, 160), input: { message: value.trim().slice(0, 2000) }, expected: {} };
  }
  const source = object(value);
  const inputSource = object(source.input);
  const message = text(inputSource.message ?? source.message);
  if (!message) return null;
  const input: BlueprintScenarioInput = {
    channel: text(inputSource.channel ?? source.channel) || undefined,
    message: message.slice(0, 2000),
    context: object(inputSource.context ?? source.context) as JsonObject,
  };
  return {
    id: text(source.id, `scenario-${index + 1}`).slice(0, 120),
    name: text(source.name, `Cenário ${index + 1}`).slice(0, 160),
    description: text(source.description).slice(0, 500) || undefined,
    input,
    expected: normalizeExpected(source.expected),
  };
}

function scenarios(value: unknown): BlueprintTestScenario[] {
  const result = (Array.isArray(value) ? value : [])
    .map((item, index) => normalizeScenario(item, index))
    .filter((item): item is BlueprintTestScenario => item !== null)
    .slice(0, 20);
  if (!result.length) throw new Error("BLUEPRINT_SCENARIOS_REQUIRED");
  return result;
}

function estimateTokens(value: string): number {
  return value ? Math.ceil(value.length / 4) : 0;
}

function evaluateExpectations(
  expected: BlueprintScenarioExpected,
  reply: string,
  toolsCalled: string[],
  handoff: boolean,
  outputTokens: number,
): string[] {
  const failures: string[] = [];
  const normalizedReply = reply.toLocaleLowerCase();
  for (const expectedText of expected.contains ?? []) {
    if (!normalizedReply.includes(expectedText.toLocaleLowerCase())) failures.push(`missing:${expectedText}`);
  }
  for (const forbiddenText of expected.notContains ?? []) {
    if (normalizedReply.includes(forbiddenText.toLocaleLowerCase())) failures.push(`contains_forbidden:${forbiddenText}`);
  }
  for (const expectedTool of expected.toolsCalled ?? []) {
    if (!toolsCalled.includes(expectedTool)) failures.push(`missing_tool:${expectedTool}`);
  }
  if (expected.handoff !== undefined && expected.handoff !== handoff) failures.push(expected.handoff ? "handoff_expected" : "handoff_unexpected");
  if (expected.maxTokens !== undefined && outputTokens > expected.maxTokens) failures.push("max_tokens_exceeded");
  return failures.slice(0, 20);
}

async function loadBlueprint(sql: Sql, input: { workspaceId: string; agentId: string; blueprintId: string; agentVersionId?: string }): Promise<BlueprintRow> {
  const rows = await sql.query<BlueprintRow>(
    `select b.id, b.workspace_id, b.agent_id, b.agent_type, b.test_scenarios,
            v.id as version_id, v.config as version_config,
            a.name as agent_name, a.persona as agent_persona, a.welcome_message,
            a.system_prompt, a.language, a.temperature, a.max_tokens, a.memory_window,
            a.knowledge, a.tools
       from agent_development_blueprints b
       join agents a on a.id = b.agent_id and a.workspace_id = b.workspace_id and a.deleted_at is null
       left join lateral (
         select id, config
           from agent_versions
          where agent_id = b.agent_id
            and status in ('draft', 'published')
            and ($4::text is null or id = $4)
          order by case when status = 'draft' then 0 else 1 end, version_number desc
          limit 1
       ) v on true
      where b.id = $1 and b.workspace_id = $2 and b.agent_id = $3
      limit 1`,
    [input.blueprintId, input.workspaceId, input.agentId, input.agentVersionId ?? null],
  );
  if (!rows[0]) throw new Error("BLUEPRINT_NOT_FOUND");
  if (input.agentVersionId && rows[0].version_id !== input.agentVersionId) throw new Error("AGENT_VERSION_NOT_FOUND");
  return rows[0];
}

function toolsSnapshot(authorizedTools: RuntimeAuthorizedTool[]): JsonObject[] {
  return authorizedTools.map((tool) => ({
    id: tool.id,
    key: tool.key,
    riskLevel: tool.riskLevel,
    requireApproval: tool.requireApproval,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
  }));
}

export async function evaluateBlueprintVersion(
  sql: Sql,
  input: { workspaceId: string; agentId: string; blueprintId: string; agentVersionId?: string; scenarioSet?: BlueprintTestScenario[] },
): Promise<BlueprintVersionEvaluation> {
  const blueprint = await loadBlueprint(sql, input);
  const definedScenarios = input.scenarioSet ?? scenarios(blueprint.test_scenarios);
  const agent = evaluationAgent(blueprint);
  const authorizedTools: RuntimeAuthorizedTool[] = blueprint.version_id
    ? await listAgentToolsForVersion(sql, input.workspaceId, blueprint.version_id)
    : [];
  const results: BlueprintScenarioResult[] = [];
  for (const scenario of definedScenarios) {
    const scenarioStartedAt = Date.now();
    let ragEvidence: KnowledgeEvidence[] = [];
    try {
      ragEvidence = await retrieveKnowledge(sql, { workspaceId: input.workspaceId, query: scenario.input.message, limit: 5 });
    } catch {
      ragEvidence = [];
    }
    const execution = await evaluateAgentRuntimeTurn({
      agent,
      inboundText: scenario.input.message,
      history: [],
      ragEvidence,
      authorizedTools,
      evaluationContext: {
        ...(scenario.input.channel ? { channel: scenario.input.channel } : {}),
        ...scenario.input.context,
      },
    });
    const reply = execution.reply ?? "";
    const toolsCalled = (execution.toolCalls ?? []).map((call) => call.name).filter(Boolean);
    const handoff = execution.decision.nextAction === "handoff" || execution.decision.answerMode === "handoff";
    const outputTokens = estimateTokens(reply);
    const failures = evaluateExpectations(scenario.expected, reply, toolsCalled, handoff, outputTokens);
    results.push({
      scenarioId: scenario.id,
      name: scenario.name,
      status: failures.length ? "failed" : "passed",
      reply,
      reason: execution.reason,
      intent: execution.decision.intent,
      nextAction: execution.decision.nextAction,
      toolsCalled,
      handoff,
      usedAi: execution.usedAi,
      evidenceCount: execution.decision.evidence.length,
      latencyMs: Date.now() - scenarioStartedAt,
      outputTokens,
      failures,
    });
  }
  return {
    agentVersionId: blueprint.version_id,
    versionSnapshot: object(blueprint.version_config) as JsonObject,
    toolsSnapshot: toolsSnapshot(authorizedTools),
    scenarios: definedScenarios,
    results,
  };
}

async function persistScenarioResult(sql: Sql, input: { runId: string; workspaceId: string; agentId: string; blueprintId: string; result: BlueprintScenarioResult }): Promise<void> {
  await sql.query(
    `insert into agent_blueprint_evaluation_results
      (id, run_id, workspace_id, agent_id, blueprint_id, scenario_id, scenario_name, status,
       reply, reason, intent, next_action, tools_called, handoff, used_ai, evidence_count,
       latency_ms, output_tokens, failures)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18,$19::jsonb)
     on conflict (run_id, scenario_id) do update set
       status = excluded.status, reply = excluded.reply, reason = excluded.reason,
       intent = excluded.intent, next_action = excluded.next_action,
       tools_called = excluded.tools_called, handoff = excluded.handoff,
       used_ai = excluded.used_ai, evidence_count = excluded.evidence_count,
       latency_ms = excluded.latency_ms, output_tokens = excluded.output_tokens,
       failures = excluded.failures`,
    [
      randomUUID(), input.runId, input.workspaceId, input.agentId, input.blueprintId,
      input.result.scenarioId, input.result.name, input.result.status, input.result.reply,
      input.result.reason, input.result.intent, input.result.nextAction,
      JSON.stringify(input.result.toolsCalled), input.result.handoff, input.result.usedAi,
      input.result.evidenceCount, input.result.latencyMs, input.result.outputTokens,
      JSON.stringify(input.result.failures),
    ],
  );
}

async function persistLearningSnapshot(sql: Sql, input: { runId: string; workspaceId: string; agentId: string; result: BlueprintScenarioResult }): Promise<void> {
  const traceId = `blueprint-evaluation:${input.runId}:${input.result.scenarioId}`;
  const event = await recordLearningEvent(sql, {
    workspaceId: input.workspaceId,
    eventType: "agent_turn_completed",
    agentId: input.agentId,
    outcome: `evaluation_${input.result.status}`,
    consentScope: "internal_only",
    traceId,
    attributes: {
      scenarioId: input.result.scenarioId,
      scenarioStatus: input.result.status,
      reason: input.result.reason,
      intent: input.result.intent,
      nextAction: input.result.nextAction,
      handoff: input.result.handoff,
      usedAi: input.result.usedAi,
      evidenceCount: input.result.evidenceCount,
      outputTokens: input.result.outputTokens,
      failures: input.result.failures,
    },
  });
  if (!event.id) return;
  const evaluation = await persistLearningEvaluation(sql, {
    eventId: event.id,
    workspaceId: input.workspaceId,
    agentId: input.agentId,
    attributes: {
      answerMode: input.result.handoff ? "handoff" : "evaluation",
      confidence: input.result.status === "passed" ? 1 : 0.4,
      risk: input.result.handoff ? "medium" : "low",
      nextAction: input.result.nextAction,
      evidenceCount: input.result.evidenceCount,
      toolsExpected: 0,
      toolsSucceeded: input.result.toolsCalled.length,
      toolFailures: 0,
      commercialState: "new",
    },
  });
  if (evaluation.id) await indexLearningEvent(sql, event.id);
}

export async function runBlueprintScenarios(
  sql: Sql,
  userId: string,
  input: { workspaceId: string; agentId: string; blueprintId: string },
): Promise<BlueprintEvaluationRun> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const initial = await loadBlueprint(sql, input);
  const definedScenarios = scenarios(initial.test_scenarios);
  const runId = randomUUID();
  const startedAt = Date.now();
  const evaluation = await evaluateBlueprintVersion(sql, {
    ...input,
    ...(initial.version_id ? { agentVersionId: initial.version_id } : {}),
    scenarioSet: definedScenarios,
  });
  await sql.query(
    `insert into agent_blueprint_evaluation_runs
      (id, workspace_id, agent_id, blueprint_id, agent_version_id, agent_version_snapshot, tools_snapshot, scenario_count, created_by)
     values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)`,
    [runId, input.workspaceId, input.agentId, input.blueprintId, evaluation.agentVersionId, JSON.stringify(evaluation.versionSnapshot), JSON.stringify(evaluation.toolsSnapshot), definedScenarios.length, userId],
  );
  try {
    for (const result of evaluation.results) {
      await persistScenarioResult(sql, { runId, workspaceId: input.workspaceId, agentId: input.agentId, blueprintId: input.blueprintId, result });
      await persistLearningSnapshot(sql, { runId, workspaceId: input.workspaceId, agentId: input.agentId, result });
    }
    const passedCount = evaluation.results.filter((result) => result.status === "passed").length;
    const failedCount = evaluation.results.length - passedCount;
    await sql.query(
      `update agent_blueprint_evaluation_runs
          set status = 'succeeded', passed_count = $2, failed_count = $3,
              duration_ms = $4, completed_at = current_timestamp
        where id = $1 and workspace_id = $5`,
      [runId, passedCount, failedCount, Date.now() - startedAt, input.workspaceId],
    );
    return { id: runId, workspaceId: input.workspaceId, agentId: input.agentId, blueprintId: input.blueprintId, agentVersionId: evaluation.agentVersionId, status: "succeeded", scenarioCount: evaluation.results.length, passedCount, failedCount, results: evaluation.results };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "BLUEPRINT_EVALUATION_FAILED";
    await sql.query(
      `update agent_blueprint_evaluation_runs
          set status = 'failed', duration_ms = $2, error_code = 'BLUEPRINT_EVALUATION_FAILED', error_message = $3,
              completed_at = current_timestamp
        where id = $1 and workspace_id = $4`,
      [runId, Date.now() - startedAt, message, input.workspaceId],
    );
    throw error;
  }
}

export { scenarios as normalizeBlueprintScenarios };
