import { randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";
import { requireWorkspaceAccess, type JsonObject, type JsonValue } from "../multitenancy/server.ts";
import type { BlueprintScenarioResult } from "./types.ts";
import { evaluateBlueprintVersion, type BlueprintVersionEvaluation } from "./scenarios.ts";

export type EvaluationHarnessMetrics = {
  successRate: number;
  avgTokens: number;
  avgLatencyMs: number;
  toolErrorRate: number;
  handoffRate: number;
  guardrailViolationCount: number;
};

export type EvaluationHarnessScenarioComparison = {
  scenarioId: string;
  scenarioName: string;
  baseline: BlueprintScenarioResult;
  candidate: BlueprintScenarioResult;
  regression: boolean;
  differences: string[];
};

export type EvaluationHarnessRun = {
  id: string;
  workspaceId: string;
  agentId: string;
  blueprintId: string;
  baselineVersionId: string;
  candidateVersionId: string;
  status: "succeeded" | "failed";
  scenarioCount: number;
  regressionCount: number;
  baselineMetrics: EvaluationHarnessMetrics;
  candidateMetrics: EvaluationHarnessMetrics;
  baselineSnapshot: JsonObject;
  candidateSnapshot: JsonObject;
  comparisons: EvaluationHarnessScenarioComparison[];
};

type HarnessInput = {
  workspaceId: string;
  agentId: string;
  blueprintId: string;
  baselineVersionId: string;
  candidateVersionId: string;
};

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function redactText(value: string): string {
  return value
    .replace(/(?:bearer\s+|sk-|xoxb-|ghp_)[a-z0-9._-]+/gi, "[secret]")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[phone]")
    .slice(0, 4000);
}

const forbiddenSnapshotKey = /(?:raw|secret|password|credential|token|authorization|payload|webhook)/i;

function sanitizeSnapshotValue(value: unknown, depth = 0): JsonValue | undefined {
  if (depth > 5) return "[depth_limit]";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitizeSnapshotValue(item, depth + 1) ?? "[removed]");
  if (typeof value === "object") {
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (forbiddenSnapshotKey.test(key)) continue;
      const sanitized = sanitizeSnapshotValue(item, depth + 1);
      if (sanitized !== undefined) result[key.slice(0, 80)] = sanitized;
    }
    return result;
  }
  return undefined;
}

function sanitizeSnapshot(value: unknown): JsonObject {
  const sanitized = sanitizeSnapshotValue(value);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized) ? sanitized as JsonObject : {};
}

function evaluationSnapshot(evaluation: BlueprintVersionEvaluation): JsonObject {
  return sanitizeSnapshot({ version: evaluation.versionSnapshot, tools: evaluation.toolsSnapshot });
}

function sanitizeResult(result: BlueprintScenarioResult): BlueprintScenarioResult {
  return {
    ...result,
    reply: redactText(result.reply),
    reason: redactText(result.reason),
    intent: redactText(result.intent),
    nextAction: redactText(result.nextAction),
    toolsCalled: result.toolsCalled.slice(0, 12).map(redactText),
    failures: result.failures.slice(0, 20).map(redactText),
  };
}

function metrics(results: BlueprintScenarioResult[]): EvaluationHarnessMetrics {
  if (!results.length) {
    return { successRate: 0, avgTokens: 0, avgLatencyMs: 0, toolErrorRate: 0, handoffRate: 0, guardrailViolationCount: 0 };
  }
  const toolErrors = results.filter((result) => result.failures.some((failure) => failure.startsWith("missing_tool:") || failure === "tool_error")).length;
  const guardrailViolations = results.reduce((total, result) => total + result.failures.filter((failure) => failure.startsWith("contains_forbidden:") || failure.startsWith("guardrail_violation:")).length, 0);
  return {
    successRate: round(results.filter((result) => result.status === "passed").length / results.length),
    avgTokens: round(results.reduce((total, result) => total + result.outputTokens, 0) / results.length),
    avgLatencyMs: round(results.reduce((total, result) => total + result.latencyMs, 0) / results.length),
    toolErrorRate: round(toolErrors / results.length),
    handoffRate: round(results.filter((result) => result.handoff).length / results.length),
    guardrailViolationCount: guardrailViolations,
  };
}

function compareResults(baseline: BlueprintScenarioResult, candidate: BlueprintScenarioResult): { regression: boolean; differences: string[] } {
  const differences: string[] = [];
  if (baseline.status !== candidate.status) differences.push(`status:${baseline.status}->${candidate.status}`);
  if (baseline.handoff !== candidate.handoff) differences.push(`handoff:${baseline.handoff}->${candidate.handoff}`);
  if (baseline.toolsCalled.join(",") !== candidate.toolsCalled.join(",")) differences.push("tools_changed");
  if (baseline.outputTokens !== candidate.outputTokens) differences.push(`output_tokens:${baseline.outputTokens}->${candidate.outputTokens}`);
  if (baseline.reply !== candidate.reply) differences.push("reply_changed");
  const regression = baseline.status === "passed" && candidate.status === "failed";
  return { regression, differences: differences.slice(0, 20) };
}

function evaluationByScenario(evaluation: BlueprintVersionEvaluation): Map<string, BlueprintScenarioResult> {
  return new Map(evaluation.results.map((result) => [result.scenarioId, result]));
}

function comparisonRows(baseline: BlueprintVersionEvaluation, candidate: BlueprintVersionEvaluation): EvaluationHarnessScenarioComparison[] {
  const candidateByScenario = evaluationByScenario(candidate);
  return baseline.results.map((baselineResult) => {
    const candidateResult = candidateByScenario.get(baselineResult.scenarioId);
    if (!candidateResult) {
      const missing: BlueprintScenarioResult = {
        scenarioId: baselineResult.scenarioId,
        name: baselineResult.name,
        status: "failed",
        reply: "",
        reason: "candidate_scenario_missing",
        intent: "general_inquiry",
        nextAction: "ask",
        toolsCalled: [],
        handoff: false,
        usedAi: false,
        evidenceCount: 0,
        latencyMs: 0,
        outputTokens: 0,
        failures: ["candidate_scenario_missing"],
      };
      return { scenarioId: baselineResult.scenarioId, scenarioName: baselineResult.name, baseline: sanitizeResult(baselineResult), candidate: missing, regression: baselineResult.status === "passed", differences: ["candidate_scenario_missing"] };
    }
    const safeBaseline = sanitizeResult(baselineResult);
    const safeCandidate = sanitizeResult(candidateResult);
    const result = compareResults(safeBaseline, safeCandidate);
    return { scenarioId: baselineResult.scenarioId, scenarioName: baselineResult.name, baseline: safeBaseline, candidate: safeCandidate, ...result };
  });
}

async function persistHarness(sql: Sql, input: {
  runId: string;
  userId: string;
  request: HarnessInput;
  baseline: BlueprintVersionEvaluation;
  candidate: BlueprintVersionEvaluation;
  comparisons: EvaluationHarnessScenarioComparison[];
  baselineMetrics: EvaluationHarnessMetrics;
  candidateMetrics: EvaluationHarnessMetrics;
  startedAt: number;
}): Promise<void> {
  const regressionCount = input.comparisons.filter((comparison) => comparison.regression).length;
  await sql.query(
    `insert into agent_evaluation_harness_runs
      (id, workspace_id, agent_id, blueprint_id, baseline_version_id, candidate_version_id,
       status, scenario_count, regression_count, baseline_snapshot, candidate_snapshot,
       baseline_metrics, candidate_metrics, duration_ms, created_by, completed_at)
     values ($1,$2,$3,$4,$5,$6,'succeeded',$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,current_timestamp)`,
    [
      input.runId,
      input.request.workspaceId,
      input.request.agentId,
      input.request.blueprintId,
      input.request.baselineVersionId,
      input.request.candidateVersionId,
      input.comparisons.length,
      regressionCount,
      JSON.stringify(evaluationSnapshot(input.baseline)),
      JSON.stringify(evaluationSnapshot(input.candidate)),
      JSON.stringify(input.baselineMetrics),
      JSON.stringify(input.candidateMetrics),
      Date.now() - input.startedAt,
      input.userId,
    ],
  );
  for (const comparison of input.comparisons) {
    await sql.query(
      `insert into agent_evaluation_harness_results
        (id, run_id, workspace_id, agent_id, blueprint_id, scenario_id, scenario_name,
         baseline_result, candidate_result, regression, differences)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11::jsonb)`,
      [
        randomUUID(), input.runId, input.request.workspaceId, input.request.agentId, input.request.blueprintId,
        comparison.scenarioId, comparison.scenarioName, JSON.stringify(comparison.baseline), JSON.stringify(comparison.candidate),
        comparison.regression, JSON.stringify(comparison.differences),
      ],
    );
  }
}

export async function runEvaluationHarness(
  sql: Sql,
  userId: string,
  input: HarnessInput,
): Promise<EvaluationHarnessRun> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  if (input.baselineVersionId === input.candidateVersionId) throw new Error("EVALUATION_VERSIONS_MUST_DIFFER");
  const startedAt = Date.now();
  const baseline = await evaluateBlueprintVersion(sql, {
    workspaceId: input.workspaceId,
    agentId: input.agentId,
    blueprintId: input.blueprintId,
    agentVersionId: input.baselineVersionId,
  });
  const candidate = await evaluateBlueprintVersion(sql, {
    workspaceId: input.workspaceId,
    agentId: input.agentId,
    blueprintId: input.blueprintId,
    agentVersionId: input.candidateVersionId,
    scenarioSet: baseline.scenarios,
  });
  if (baseline.agentVersionId !== input.baselineVersionId || candidate.agentVersionId !== input.candidateVersionId) throw new Error("EVALUATION_VERSION_SNAPSHOT_MISMATCH");
  const comparisons = comparisonRows(baseline, candidate);
  const baselineMetrics = metrics(baseline.results);
  const candidateMetrics = metrics(candidate.results);
  const runId = randomUUID();
  await persistHarness(sql, { runId, userId, request: input, baseline, candidate, comparisons, baselineMetrics, candidateMetrics, startedAt });
  return {
    id: runId,
    workspaceId: input.workspaceId,
    agentId: input.agentId,
    blueprintId: input.blueprintId,
    baselineVersionId: input.baselineVersionId,
    candidateVersionId: input.candidateVersionId,
    status: "succeeded",
    scenarioCount: comparisons.length,
    regressionCount: comparisons.filter((comparison) => comparison.regression).length,
    baselineMetrics,
    candidateMetrics,
    baselineSnapshot: evaluationSnapshot(baseline),
    candidateSnapshot: evaluationSnapshot(candidate),
    comparisons,
  };
}

export async function listEvaluationHarnessRuns(sql: Sql, userId: string, input: { workspaceId: string; agentId?: string; blueprintId?: string }): Promise<JsonObject[]> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  return sql.query<JsonObject>(`select id, workspace_id as "workspaceId", agent_id as "agentId", blueprint_id as "blueprintId", baseline_version_id as "baselineVersionId", candidate_version_id as "candidateVersionId", status, scenario_count as "scenarioCount", regression_count as "regressionCount", approved_by as "approvedBy", approved_at as "approvedAt", approval_note as "approvalNote", baseline_metrics as "baselineMetrics", candidate_metrics as "candidateMetrics", duration_ms as "durationMs", created_at as "createdAt", completed_at as "completedAt" from agent_evaluation_harness_runs where workspace_id = $1 and ($2::text is null or agent_id = $2) and ($3::text is null or blueprint_id = $3) order by created_at desc limit 50`, [input.workspaceId, input.agentId ?? null, input.blueprintId ?? null]);
}
export async function approveEvaluationHarnessRun(sql: Sql, userId: string, input: { workspaceId: string; runId: string; note?: string }): Promise<JsonObject> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "publish");
  const rows = await sql.query<JsonObject>(`update agent_evaluation_harness_runs
    set approved_by = $1, approved_at = current_timestamp, approval_note = $2
    where id = $3 and workspace_id = $4 and status = 'succeeded' and regression_count = 0
      and coalesce((candidate_metrics->>'successRate')::numeric, 0) >= coalesce((baseline_metrics->>'successRate')::numeric, 0)
      and coalesce((candidate_metrics->>'guardrailViolationCount')::numeric, 0) <= coalesce((baseline_metrics->>'guardrailViolationCount')::numeric, 0)
    returning id, workspace_id as "workspaceId", agent_id as "agentId", candidate_version_id as "candidateVersionId", approved_by as "approvedBy", approved_at as "approvedAt", approval_note as "approvalNote"`, [userId, String(input.note ?? "").trim().slice(0, 500) || null, input.runId, input.workspaceId]);
  if (!rows[0]) throw new Error("HARNESS_NOT_APPROVABLE");
  return rows[0];
}

export async function getEvaluationHarnessRun(sql: Sql, userId: string, input: { workspaceId: string; runId: string }): Promise<JsonObject | null> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  const runs = await sql.query<JsonObject>(`select id, workspace_id as "workspaceId", agent_id as "agentId", blueprint_id as "blueprintId", baseline_version_id as "baselineVersionId", candidate_version_id as "candidateVersionId", status, scenario_count as "scenarioCount", regression_count as "regressionCount", approved_by as "approvedBy", approved_at as "approvedAt", approval_note as "approvalNote", baseline_snapshot as "baselineSnapshot", candidate_snapshot as "candidateSnapshot", baseline_metrics as "baselineMetrics", candidate_metrics as "candidateMetrics", duration_ms as "durationMs", created_at as "createdAt", completed_at as "completedAt" from agent_evaluation_harness_runs where id = $1 and workspace_id = $2 limit 1`, [input.runId, input.workspaceId]);
  if (!runs[0]) return null;
  const results = await sql.query<JsonObject>(`select scenario_id as "scenarioId", scenario_name as "scenarioName", baseline_result as "baseline", candidate_result as "candidate", regression, differences from agent_evaluation_harness_results where run_id = $1 and workspace_id = $2 order by scenario_id`, [input.runId, input.workspaceId]);
  return { ...runs[0], comparisons: results };
}
