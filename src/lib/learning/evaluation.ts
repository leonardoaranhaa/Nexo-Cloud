import { randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";

export type EvaluationStatus = "eligible" | "review" | "rejected";
export type LearningEvaluation = { groundednessScore: number; decisionScore: number; toolScore: number; handoffScore: number; conversionScore: number; overallScore: number; status: EvaluationStatus; criticalFailure: boolean; reasons: string[] };
type Attributes = Record<string, unknown>;

function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function numeric(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? value : Number(value ?? 0) || 0; }
function score(value: number): number { return Math.round(Math.max(0, Math.min(1, value)) * 10000) / 10000; }

export function evaluateLearningAttributes(attributes: Attributes): LearningEvaluation {
  const mode = text(attributes.answerMode); const nextAction = text(attributes.nextAction); const intent = text(attributes.intent); const risk = text(attributes.risk); const state = text(attributes.commercialState); const evidenceCount = numeric(attributes.evidenceCount); const toolFailures = numeric(attributes.toolFailures); const toolsExpected = numeric(attributes.toolsExpected); const toolsSucceeded = numeric(attributes.toolsSucceeded);
  const reasons: string[] = [];
  let groundednessScore = 1;
  if (mode === "answer_with_evidence") groundednessScore = evidenceCount > 0 ? 1 : 0.2;
  else if (mode === "faq") groundednessScore = evidenceCount > 0 ? 0.95 : 0.5;
  else if (mode === "fallback") groundednessScore = 0.45;
  if (groundednessScore < 0.7) reasons.push("resposta sem evidência suficiente");

  let decisionScore = Math.max(0.2, Math.min(1, numeric(attributes.confidence)));
  let criticalFailure = false;
  if (risk === "high" && nextAction !== "handoff" && nextAction !== "ask") { decisionScore = 0.2; criticalFailure = true; reasons.push("risco alto sem pergunta ou handoff"); }
  if (decisionScore < 0.7) reasons.push("baixa confiança da decisão");

  const toolScore = toolFailures > 0 ? 0 : toolsExpected > 0 ? score(toolsSucceeded / toolsExpected) : 1;
  if (toolFailures > 0) reasons.push("falha em ferramenta");

  let handoffScore = 1;
  if (intent === "human_request") {
    handoffScore = nextAction === "handoff" ? 1 : 0;
    if (handoffScore === 0) { criticalFailure = true; reasons.push("pedido humano sem handoff"); }
  } else if (nextAction === "handoff") handoffScore = 0.8;

  const conversionScore = state === "converted" ? 1 : state === "qualified" ? 0.85 : state === "lost" ? 0 : 0.5;
  if (state === "converted") reasons.push("conversão confirmada");
  const overallScore = score(groundednessScore * 0.25 + decisionScore * 0.2 + toolScore * 0.15 + handoffScore * 0.15 + conversionScore * 0.25);
  const status: EvaluationStatus = criticalFailure ? "rejected" : overallScore >= 0.8 ? "eligible" : overallScore >= 0.6 ? "review" : "rejected";
  if (status === "review") reasons.push("requer revisão de engenharia");
  if (status === "rejected" && !criticalFailure) reasons.push("pontuação abaixo do gate");
  return { groundednessScore: score(groundednessScore), decisionScore: score(decisionScore), toolScore: score(toolScore), handoffScore: score(handoffScore), conversionScore: score(conversionScore), overallScore, status, criticalFailure, reasons };
}

export async function persistLearningEvaluation(sql: Sql, input: { eventId: string; workspaceId: string; agentId?: string; productId?: string; attributes: Attributes }): Promise<{ id?: string; created: boolean; evaluation: LearningEvaluation }> {
  const evaluation = evaluateLearningAttributes(input.attributes);
  const rows = await sql.query<{ id: string }>(`insert into nexo_learning_evaluations (id,event_id,workspace_id,agent_id,product_id,groundedness_score,decision_score,tool_score,handoff_score,conversion_score,overall_score,status,critical_failure,reasons) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb) on conflict (event_id) do nothing returning id`, [randomUUID(), input.eventId, input.workspaceId, input.agentId ?? null, input.productId ?? null, evaluation.groundednessScore, evaluation.decisionScore, evaluation.toolScore, evaluation.handoffScore, evaluation.conversionScore, evaluation.overallScore, evaluation.status, evaluation.criticalFailure, JSON.stringify(evaluation.reasons)]);
  return { id: rows[0]?.id, created: Boolean(rows[0]), evaluation };
}
