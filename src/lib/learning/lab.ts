import { randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";
import { requireWorkspaceAccess, type JsonObject } from "../multitenancy/server.ts";

export type CandidateType = "prompt" | "policy" | "manifest" | "cadence";
export type CandidateStatus = "draft" | "review" | "approved" | "rejected" | "applied";
export type ImprovementCandidate = { id: string; workspaceId: string; agentId: string | null; productId: string | null; candidateType: CandidateType; status: CandidateStatus; title: string; rationale: string; proposedChange: JsonObject; createdAt: string };
type CaseRow = { id: string; workspace_id: string; agent_id: string | null; product_id: string | null; case_type: string; title: string; summary: string; attributes: Record<string, unknown>; chunk_id: string | null; content: string };

function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function short(value: string, max: number): string { return value.replaceAll("\u0000", "").trim().slice(0, max); }
function typeFor(caseType: string): CandidateType { if (caseType === "tool_failure") return "manifest"; if (caseType === "handoff_case" || caseType === "conversion_success") return "policy"; if (caseType === "regression_case" || caseType === "failure_case") return "prompt"; return "prompt"; }
function proposal(type: CandidateType, caseRow: CaseRow): JsonObject {
  const intent = text(caseRow.attributes.intent) || "the active intent";
  const state = text(caseRow.attributes.commercialState) || "the current commercial state";
  const changes: Record<CandidateType, string> = {
    prompt: `Reforce o comportamento para a intenção ${intent}, usando evidência autorizada e registrando o próximo estado ${state} sem inventar fatos.`,
    policy: `Ajuste a política para tratar ${caseRow.case_type} antes da resposta final, preservando handoff seguro e critérios explícitos de conversão.`,
    manifest: `Declare validação de schema, fallback e resultado sanitizado para a capacidade associada ao caso ${caseRow.case_type}.`,
    cadence: `Ajuste a cadência para usar o próximo passo comercial observado no caso ${caseRow.case_type}, respeitando consentimento e cancelamento.`,
  };
  return { candidateType: type, change: changes[type], sourceCase: caseRow.case_type, intent, commercialState: state, safety: "Não publicar automaticamente; executar avaliação offline antes da promoção." };
}

export async function createImprovementCandidate(sql: Sql, input: { workspaceId: string; caseId: string; candidateType?: CandidateType; requestedBy: string }): Promise<{ created: boolean; candidate: ImprovementCandidate | null }> {
  const rows = await sql.query<CaseRow>(`select c.id, c.workspace_id, c.agent_id, c.product_id, c.case_type, c.title, c.summary, c.attributes, k.id as chunk_id, k.content from nexo_learning_cases c join nexo_learning_chunks k on k.case_id = c.id and k.workspace_id = c.workspace_id and k.status = 'published' where c.id = $1 and c.workspace_id = $2 and c.status in ('indexed','review') and c.visibility_scope in ('internal_only','shared_anonymized') limit 1`, [input.caseId, input.workspaceId]);
  const source = rows[0]; if (!source) throw new Error("LEARNING_CASE_NOT_ELIGIBLE");
  const candidateType = input.candidateType ?? typeFor(source.case_type);
  const intent = text(source.attributes.intent) || "agent_turn";
  const title = short(`${candidateType}: ${source.case_type} · ${intent}`, 180);
  const proposedChange = proposal(candidateType, source);
  const rationale = short(`Gerado a partir do chunk ${source.chunk_id ?? "learning"}. ${source.summary}`, 1000);
  const baselineRows = source.agent_id ? await sql.query<{ id: string; system_prompt: string; persona: string; welcome_message: string; knowledge: JsonObject; tools: JsonObject; metadata: JsonObject }>("select id, system_prompt, persona, welcome_message, knowledge, tools, metadata from agents where id = $1 and workspace_id = $2 limit 1", [source.agent_id, input.workspaceId]) : [];
  const baseline = baselineRows[0] ?? { id: null, system_prompt: "", persona: "", welcome_message: "", knowledge: {}, tools: {}, metadata: {} };
  const inserted = await sql.query<{ id: string; created_at: string }>(`insert into nexo_agent_improvement_candidates (id,workspace_id,agent_id,product_id,candidate_type,status,title,rationale,proposed_change,baseline_snapshot,created_by) values ($1,$2,$3,$4,$5,'review',$6,$7,$8::jsonb,$9::jsonb,$10) on conflict (workspace_id,agent_id,candidate_type,title) do nothing returning id, created_at`, [randomUUID(), input.workspaceId, source.agent_id, source.product_id, candidateType, title, rationale, JSON.stringify(proposedChange), JSON.stringify(baseline)]);
  const candidateId = inserted[0]?.id;
  if (!candidateId) {
    const existing = await sql.query<{ id: string; workspace_id: string; agent_id: string | null; product_id: string | null; candidate_type: CandidateType; status: CandidateStatus; title: string; rationale: string; proposed_change: JsonObject; created_at: string }>("select id, workspace_id, agent_id, product_id, candidate_type, status, title, rationale, proposed_change, created_at from nexo_agent_improvement_candidates where workspace_id = $1 and agent_id is not distinct from $2 and candidate_type = $3 and title = $4 limit 1", [input.workspaceId, source.agent_id, candidateType, title]);
    const row = existing[0]; return { created: false, candidate: row ? mapCandidate(row) : null };
  }
  await sql.query("insert into nexo_agent_improvement_sources (candidate_id,case_id,chunk_id) values ($1,$2,$3) on conflict do nothing", [candidateId, source.id, source.chunk_id]);
  return { created: true, candidate: { id: candidateId, workspaceId: input.workspaceId, agentId: source.agent_id, productId: source.product_id, candidateType, status: "review", title, rationale, proposedChange, createdAt: inserted[0].created_at } };
}

function mapCandidate(row: { id: string; workspace_id: string; agent_id: string | null; product_id: string | null; candidate_type: CandidateType; status: CandidateStatus; title: string; rationale: string; proposed_change: JsonObject; created_at: string }): ImprovementCandidate { return { id: row.id, workspaceId: row.workspace_id, agentId: row.agent_id, productId: row.product_id, candidateType: row.candidate_type, status: row.status, title: row.title, rationale: row.rationale, proposedChange: row.proposed_change, createdAt: row.created_at }; }

export async function listImprovementCandidates(sql: Sql, userId: string, input: { workspaceId: string; status?: CandidateStatus }): Promise<ImprovementCandidate[]> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  const rows = await sql.query<{ id: string; workspace_id: string; agent_id: string | null; product_id: string | null; candidate_type: CandidateType; status: CandidateStatus; title: string; rationale: string; proposed_change: JsonObject; created_at: string }>(`select id, workspace_id, agent_id, product_id, candidate_type, status, title, rationale, proposed_change, created_at from nexo_agent_improvement_candidates where workspace_id = $1 and ($2::text is null or status = $2) order by created_at desc limit 100`, [input.workspaceId, input.status ?? null]);
  return rows.map(mapCandidate);
}

export async function reviewImprovementCandidate(sql: Sql, userId: string, input: { workspaceId: string; candidateId: string; decision: "approved" | "rejected" }): Promise<void> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "manage");
  const result = await sql.query<{ id: string }>("update nexo_agent_improvement_candidates set status = $1, reviewed_by = $2, reviewed_at = current_timestamp where id = $3 and workspace_id = $4 and status = 'review' returning id", [input.decision, userId, input.candidateId, input.workspaceId]);
  if (!result[0]) throw new Error("IMPROVEMENT_CANDIDATE_NOT_REVIEWABLE");
}
