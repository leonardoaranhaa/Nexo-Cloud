export type HarnessMetricKey =
  | "successRate"
  | "avgTokens"
  | "avgLatencyMs"
  | "toolErrorRate"
  | "handoffRate"
  | "guardrailViolationCount";

export type HarnessMetricsView = Record<HarnessMetricKey, number>;

export type HarnessVersionView = {
  id: string;
  versionNumber: number;
  status: "draft" | "published" | "retired";
  createdAt: string;
  publishedAt: string | null;
};

export type HarnessScenarioResultView = {
  status: "passed" | "failed";
  reply: string;
  reason: string;
  nextAction: string;
  toolsCalled: string[];
  handoff: boolean;
  outputTokens: number;
  failures: string[];
};

export type HarnessComparisonView = {
  scenarioId: string;
  scenarioName: string;
  baseline: HarnessScenarioResultView;
  candidate: HarnessScenarioResultView;
  regression: boolean;
  differences: string[];
};

export type HarnessRunSummaryView = {
  id: string;
  workspaceId: string;
  agentId: string;
  blueprintId: string;
  baselineVersionId: string;
  candidateVersionId: string;
  status: "succeeded" | "failed" | "running";
  scenarioCount: number;
  regressionCount: number;
  baselineMetrics: HarnessMetricsView;
  candidateMetrics: HarnessMetricsView;
  durationMs: number | null;
  createdAt: string;
  completedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
};

export type HarnessRunDetailView = HarnessRunSummaryView & {
  baselineSnapshot: Record<string, unknown>;
  candidateSnapshot: Record<string, unknown>;
  comparisons: HarnessComparisonView[];
};

export type HarnessSnapshotContractView = {
  model: string;
  persona: string;
  prompt: string;
  toolKeys: string[];
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function textList(value: unknown, max = 20): string[] {
  return (Array.isArray(value) ? value : [])
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.slice(0, 400))
    .filter(Boolean)
    .slice(0, max);
}

function status(value: unknown): "succeeded" | "failed" | "running" {
  return value === "failed" || value === "running" ? value : "succeeded";
}

function scenarioStatus(value: unknown): "passed" | "failed" {
  return value === "passed" ? "passed" : "failed";
}

export function parseHarnessMetrics(value: unknown): HarnessMetricsView {
  const source = record(value);
  return {
    successRate: number(source.successRate),
    avgTokens: number(source.avgTokens),
    avgLatencyMs: number(source.avgLatencyMs),
    toolErrorRate: number(source.toolErrorRate),
    handoffRate: number(source.handoffRate),
    guardrailViolationCount: number(source.guardrailViolationCount),
  };
}

export function parseHarnessScenarioResult(value: unknown): HarnessScenarioResultView {
  const source = record(value);
  return {
    status: scenarioStatus(source.status),
    reply: text(source.reply),
    reason: text(source.reason),
    nextAction: text(source.nextAction),
    toolsCalled: textList(source.toolsCalled, 12),
    handoff: boolean(source.handoff),
    outputTokens: number(source.outputTokens),
    failures: textList(source.failures, 20),
  };
}

export function parseHarnessRunSummary(value: unknown): HarnessRunSummaryView | null {
  const source = record(value);
  const id = text(source.id);
  if (!id) return null;
  return {
    id,
    workspaceId: text(source.workspaceId),
    agentId: text(source.agentId),
    blueprintId: text(source.blueprintId),
    baselineVersionId: text(source.baselineVersionId),
    candidateVersionId: text(source.candidateVersionId),
    status: status(source.status),
    scenarioCount: number(source.scenarioCount),
    regressionCount: number(source.regressionCount),
    baselineMetrics: parseHarnessMetrics(source.baselineMetrics),
    candidateMetrics: parseHarnessMetrics(source.candidateMetrics),
    durationMs: source.durationMs === null || source.durationMs === undefined ? null : number(source.durationMs),
    createdAt: text(source.createdAt),
    completedAt: source.completedAt === null || source.completedAt === undefined ? null : text(source.completedAt),
    approvedBy: source.approvedBy === null || source.approvedBy === undefined ? null : text(source.approvedBy),
    approvedAt: source.approvedAt === null || source.approvedAt === undefined ? null : text(source.approvedAt),
  };
}

export function parseHarnessRunDetail(value: unknown): HarnessRunDetailView | null {
  const summary = parseHarnessRunSummary(value);
  if (!summary) return null;
  const source = record(value);
  const comparisons = (Array.isArray(source.comparisons) ? source.comparisons : [])
    .map((item) => {
      const comparison = record(item);
      const scenarioId = text(comparison.scenarioId);
      if (!scenarioId) return null;
      return {
        scenarioId,
        scenarioName: text(comparison.scenarioName, scenarioId),
        baseline: parseHarnessScenarioResult(comparison.baseline),
        candidate: parseHarnessScenarioResult(comparison.candidate),
        regression: boolean(comparison.regression),
        differences: textList(comparison.differences, 20),
      } satisfies HarnessComparisonView;
    })
    .filter((item): item is HarnessComparisonView => item !== null);
  return {
    ...summary,
    baselineSnapshot: record(source.baselineSnapshot),
    candidateSnapshot: record(source.candidateSnapshot),
    comparisons,
  };
}

export function summarizeHarnessSnapshot(snapshot: unknown): HarnessSnapshotContractView {
  const source = record(snapshot);
  const version = record(source.version);
  const tools = Array.isArray(source.tools) ? source.tools : [];
  const modelParts = [text(version.modelProvider), text(version.modelName)].filter(Boolean);
  return {
    model: modelParts.join(" · ") || "Modelo resolvido no servidor",
    persona: text(version.persona, "Persona não disponível no snapshot"),
    prompt: text(version.systemPrompt, "Prompt não disponível no snapshot"),
    toolKeys: tools.map((item) => text(record(item).key)).filter(Boolean).slice(0, 20),
  };
}

export function formatHarnessPercent(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

export function formatHarnessNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value);
}

export function formatHarnessDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}
