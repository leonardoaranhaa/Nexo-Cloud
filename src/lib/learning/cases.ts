import { randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";
import { sanitizeLearningAttributes } from "./server.ts";
import type { EvaluationStatus } from "./evaluation.ts";

export type LearningCaseType = "success_case" | "failure_case" | "regression_case" | "conversion_success" | "handoff_case" | "tool_failure";
export type LearningCase = { id: string; eventId: string; evaluationId: string; workspaceId: string; caseType: LearningCaseType; status: "draft" | "indexed" | "review" | "archived"; title: string; summary: string; chunkCount: number };

type Attributes = Record<string, unknown>;
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function numeric(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? value : Number(value ?? 0) || 0; }
function lexical(value: string): string { return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(); }
function short(value: string, max: number): string { return value.replaceAll("\u0000", "").trim().slice(0, max); }

export function classifyLearningCase(attributes: Attributes, evaluationStatus: EvaluationStatus): LearningCaseType {
  if (attributes.regression === true) return "regression_case";
  if (text(attributes.commercialState) === "converted") return "conversion_success";
  if (numeric(attributes.toolFailures) > 0) return "tool_failure";
  if (text(attributes.intent) === "human_request" || text(attributes.nextAction) === "handoff") return "handoff_case";
  return evaluationStatus === "eligible" ? "success_case" : "failure_case";
}

export async function buildLearningCase(sql: Sql, input: { eventId: string; evaluationId: string; workspaceId: string; agentId?: string; productId?: string; evaluationStatus: EvaluationStatus; overallScore: number; reasons: string[]; attributes: Attributes }): Promise<{ created: boolean; case: LearningCase | null }> {
  if (input.evaluationStatus === "rejected") return { created: false, case: null };
  const caseType = classifyLearningCase(input.attributes, input.evaluationStatus);
  const safeAttributes = sanitizeLearningAttributes({ ...input.attributes, overallScore: input.overallScore, evaluationStatus: input.evaluationStatus });
  const intent = short(text(input.attributes.intent) || "agent_turn", 80);
  const state = short(text(input.attributes.commercialState) || "unknown", 80);
  const title = short(`${caseType}: ${intent} → ${state}`, 180);
  const summary = short(`Caso ${caseType} com nota ${input.overallScore.toFixed(2)}. Intenção ${intent}. Estado comercial ${state}. ${input.reasons.slice(0, 3).join("; ")}`, 600);
  const rows = await sql.query<{ id: string }>(`insert into nexo_learning_cases (id,event_id,evaluation_id,workspace_id,agent_id,product_id,case_type,status,visibility_scope,title,summary,attributes,indexed_at) values ($1,$2,$3,$4,$5,$6,$7,$8,'internal_only',$9,$10,$11::jsonb,current_timestamp) on conflict (event_id) do nothing returning id`, [randomUUID(), input.eventId, input.evaluationId, input.workspaceId, input.agentId ?? null, input.productId ?? null, caseType, input.evaluationStatus === "review" ? "review" : "indexed", title, summary, JSON.stringify(safeAttributes)]);
  const caseId = rows[0]?.id;
  if (!caseId) {
    const existing = await sql.query<{ id: string; event_id: string; evaluation_id: string; workspace_id: string; case_type: LearningCaseType; status: LearningCase["status"]; title: string; summary: string; chunk_count: number }>("select c.id, c.event_id, c.evaluation_id, c.workspace_id, c.case_type, c.status, c.title, c.summary, count(k.id)::int as chunk_count from nexo_learning_cases c left join nexo_learning_chunks k on k.case_id = c.id where c.event_id = $1 group by c.id limit 1", [input.eventId]);
    const row = existing[0];
    return { created: false, case: row ? { id: row.id, eventId: row.event_id, evaluationId: row.evaluation_id, workspaceId: row.workspace_id, caseType: row.case_type, status: row.status, title: row.title, summary: row.summary, chunkCount: Number(row.chunk_count) } : null };
  }
  const chunkContent = short([`Engineering case: ${title}`, `Summary: ${summary}`, `Signals: ${JSON.stringify(safeAttributes)}`, `Evaluation reasons: ${input.reasons.slice(0, 5).join("; ") || "none"}`].join("\n"), 2200);
  await sql.query(`insert into nexo_learning_chunks (id,case_id,workspace_id,ordinal,heading,content,lexical_text,status) values ($1,$2,$3,0,$4,$5,$6,'published') on conflict (case_id,ordinal) do nothing`, [randomUUID(), caseId, input.workspaceId, title, chunkContent, lexical(`${title} ${chunkContent}`)]);
  return { created: true, case: { id: caseId, eventId: input.eventId, evaluationId: input.evaluationId, workspaceId: input.workspaceId, caseType, status: input.evaluationStatus === "review" ? "review" : "indexed", title, summary, chunkCount: 1 } };
}

export async function indexLearningEvent(sql: Sql, eventId: string): Promise<{ indexed: boolean; caseId?: string }> {
  const rows = await sql.query<{ event_id: string; workspace_id: string; agent_id: string | null; product_id: string | null; attributes: Attributes; evaluation_id: string; status: EvaluationStatus; overall_score: number; reasons: string[] }>(`select e.id as event_id, e.workspace_id, e.agent_id, e.product_id, e.attributes, v.id as evaluation_id, v.status, v.overall_score, v.reasons from nexo_learning_events e join nexo_learning_evaluations v on v.event_id = e.id where e.id = $1 limit 1`, [eventId]);
  const event = rows[0];
  if (!event) return { indexed: false };
  const result = await buildLearningCase(sql, { eventId: event.event_id, evaluationId: event.evaluation_id, workspaceId: event.workspace_id, agentId: event.agent_id ?? undefined, productId: event.product_id ?? undefined, evaluationStatus: event.status, overallScore: Number(event.overall_score), reasons: Array.isArray(event.reasons) ? event.reasons : [], attributes: event.attributes ?? {} });
  return { indexed: Boolean(result.case), caseId: result.case?.id };
}

export async function retrieveNexoLearning(sql: Sql, input: { workspaceId: string; query: string; limit?: number }): Promise<{ sourceId: string; caseId: string; caseType: LearningCaseType; title: string; excerpt: string; score: number }[]> {
  const normalized = lexical(input.query); if (!normalized) return [];
  const terms = new Set(normalized.split(" ").filter((term) => term.length > 2));
  const rows = await sql.query<{ id: string; case_id: string; case_type: LearningCaseType; title: string; content: string; lexical_text: string }>(`select k.id, k.case_id, c.case_type, c.title, k.content, k.lexical_text from nexo_learning_chunks k join nexo_learning_cases c on c.id = k.case_id and c.workspace_id = k.workspace_id and c.status in ('indexed','review') and c.visibility_scope in ('internal_only','shared_anonymized') where k.workspace_id = $1 and k.status = 'published' limit 300`, [input.workspaceId]);
  return rows.map((row) => { const matched = [...terms].filter((term) => row.lexical_text.includes(term)).length; return { sourceId: `nexo-learning:${row.id}`, caseId: row.case_id, caseType: row.case_type, title: row.title, excerpt: row.content.slice(0, 1000), score: matched / Math.max(terms.size, 1) }; }).filter((row) => row.score > 0).sort((a, b) => b.score - a.score).slice(0, Math.min(Math.max(input.limit ?? 5, 1), 10));
}
