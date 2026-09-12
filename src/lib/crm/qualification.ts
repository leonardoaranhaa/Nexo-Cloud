import { randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";
import type { JsonObject, JsonValue } from "../multitenancy/server.ts";
import { requireWorkspaceAccess } from "../multitenancy/server.ts";
import { executeLeadUpdateQualification } from "./leads.ts";

export type QualificationCriterionType = "text_present" | "number_min" | "boolean_true" | "enum_match" | "email_present";
export type QualificationCriterion = { key: string; type: QualificationCriterionType; required?: boolean; weight?: number; min?: number; values?: string[]; label?: string };
export type QualificationPolicyInput = { workspaceId: string; productId?: string; name: string; minimumScore: number; criteria: QualificationCriterion[] };
export type CriterionResult = { key: string; label: string; required: boolean; satisfied: boolean; score: number; reason: string };
export type QualificationEvaluation = { ready: boolean; score: number; missingFields: string[]; results: CriterionResult[]; policyId?: string; leadId?: string; stage?: string };

const criterionTypes = new Set<QualificationCriterionType>(["text_present", "number_min", "boolean_true", "enum_match", "email_present"]);
const allowedKeys = new Set(["need", "budget", "timeline", "company", "role", "location", "productInterest", "decisionMaker", "consent", "email"]);
const terminalStages = new Set(["converted", "lost", "human_active"]);

function normalizeCriteria(criteria: QualificationCriterion[]): QualificationCriterion[] {
  if (!Array.isArray(criteria) || criteria.length === 0 || criteria.length > 20) throw new Error("QUALIFICATION_CRITERIA_REQUIRED");
  return criteria.map((criterion) => {
    if (!allowedKeys.has(criterion.key) || !criterionTypes.has(criterion.type)) throw new Error("QUALIFICATION_CRITERION_INVALID");
    const weight = Math.min(Math.max(Math.round(criterion.weight ?? 1), 1), 100);
    return { key: criterion.key, type: criterion.type, required: criterion.required === true, weight, min: criterion.min, values: criterion.values?.slice(0, 20).map((value) => String(value).slice(0, 120)), label: String(criterion.label ?? criterion.key).slice(0, 120) };
  });
}

export async function createQualificationPolicy(sql: Sql, userId: string, input: QualificationPolicyInput): Promise<{ id: string; versionNumber: number }> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const name = input.name.trim().slice(0, 160);
  if (!name) throw new Error("QUALIFICATION_POLICY_NAME_REQUIRED");
  if (!Number.isFinite(input.minimumScore) || input.minimumScore < 0 || input.minimumScore > 100) throw new Error("QUALIFICATION_SCORE_INVALID");
  const criteria = normalizeCriteria(input.criteria);
  if (input.productId) {
    const product = await sql<{ id: string }>`select id from agent_products where id = ${input.productId} and status = 'published' limit 1`;
    if (!product[0]) throw new Error("QUALIFICATION_PRODUCT_NOT_FOUND");
  }
  const version = await sql<{ version: number }>`select coalesce(max(version_number), 0) + 1 as version from crm_qualification_policies where workspace_id = ${input.workspaceId} and product_id is not distinct from ${input.productId ?? null}`;
  const versionNumber = Number(version[0]?.version ?? 1);
  const id = randomUUID();
  await sql.query(`insert into crm_qualification_policies (id, workspace_id, product_id, name, version_number, minimum_score, criteria, created_by) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`, [id, input.workspaceId, input.productId ?? null, name, versionNumber, Math.round(input.minimumScore), JSON.stringify(criteria), userId]);
  return { id, versionNumber };
}

export async function publishQualificationPolicy(sql: Sql, userId: string, input: { workspaceId: string; policyId: string }): Promise<void> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "publish");
  const policy = await sql<{ id: string; product_id: string | null }>`select id, product_id from crm_qualification_policies where id = ${input.policyId} and workspace_id = ${input.workspaceId} and status = 'draft' limit 1`;
  if (!policy[0]) throw new Error("QUALIFICATION_POLICY_NOT_FOUND");
  await sql.query(`update crm_qualification_policies set status = 'retired' where workspace_id = $1 and product_id is not distinct from $2 and status = 'published'`, [input.workspaceId, policy[0].product_id]);
  await sql.query(`update crm_qualification_policies set status = 'published', published_at = current_timestamp where id = $1 and workspace_id = $2`, [input.policyId, input.workspaceId]);
}

function valueFor(data: JsonObject, key: string): JsonValue | undefined { return data[key]; }
function evaluateCriterion(criterion: QualificationCriterion, data: JsonObject): CriterionResult {
  const value = valueFor(data, criterion.key);
  const required = criterion.required === true;
  let satisfied = false;
  if (criterion.type === "text_present") satisfied = typeof value === "string" ? value.trim().length > 0 : false;
  if (criterion.type === "email_present") satisfied = typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (criterion.type === "boolean_true") satisfied = value === true;
  if (criterion.type === "number_min") satisfied = typeof value === "number" && Number.isFinite(value) && value >= Number(criterion.min ?? 0);
  if (criterion.type === "enum_match") satisfied = typeof value === "string" && Boolean(criterion.values?.includes(value));
  return { key: criterion.key, label: String(criterion.label ?? criterion.key), required, satisfied, score: satisfied ? Number(criterion.weight ?? 1) : 0, reason: satisfied ? "criterion_satisfied" : value === undefined ? "missing_value" : "criterion_not_satisfied" };
}

export async function evaluateQualification(sql: Sql, userId: string | null, input: { workspaceId: string; externalContactId: string; productId?: string; agentId?: string; conversationId?: string; traceId?: string }): Promise<QualificationEvaluation> {
  if (userId) await requireWorkspaceAccess(sql, userId, input.workspaceId, "operate");
  const lead = await sql<{ id: string; stage: string; score: number; qualification_data: JsonObject }>`select id, stage, score, qualification_data from crm_leads where workspace_id = ${input.workspaceId} and external_contact_id = ${input.externalContactId} limit 1`;
  if (!lead[0]) throw new Error("LEAD_NOT_FOUND");
  const policy = await sql<{ id: string; minimum_score: number; criteria: QualificationCriterion[] }>`select id, minimum_score, criteria from crm_qualification_policies where workspace_id = ${input.workspaceId} and product_id is not distinct from ${input.productId ?? null} and status = 'published' order by version_number desc limit 1`;
  if (!policy[0]) return { ready: false, score: 0, missingFields: ["qualification_policy"], results: [] };
  const criteria = normalizeCriteria(policy[0].criteria);
  const results = criteria.map((criterion) => evaluateCriterion(criterion, lead[0].qualification_data));
  const totalWeight = criteria.reduce((sum, criterion) => sum + Number(criterion.weight ?? 1), 0);
  const score = totalWeight ? Math.round((results.reduce((sum, result) => sum + result.score, 0) / totalWeight) * 100) : 0;
  const missingFields = results.filter((result) => result.required && !result.satisfied).map((result) => result.key);
  const ready = missingFields.length === 0 && score >= Number(policy[0].minimum_score);
  await sql.query(`insert into crm_qualification_evaluations (id, workspace_id, lead_id, policy_id, conversation_id, trace_id, ready, score, missing_fields, results) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)`, [randomUUID(), input.workspaceId, lead[0].id, policy[0].id, input.conversationId ?? null, input.traceId ?? null, ready, score, JSON.stringify(missingFields), JSON.stringify(results)]);
  if (ready && !terminalStages.has(lead[0].stage)) {
    await executeLeadUpdateQualification(sql, null, { workspaceId: input.workspaceId, externalContactId: input.externalContactId, conversationId: input.conversationId, qualificationData: {}, stage: "qualified", score, idempotencyKey: `qualification:${policy[0].id}:${lead[0].id}:${score}`, traceId: input.traceId, requestedBy: "system" });
  }
  return { ready, score, missingFields, results, policyId: policy[0].id, leadId: lead[0].id, stage: ready && !terminalStages.has(lead[0].stage) ? "qualified" : lead[0].stage };
}
