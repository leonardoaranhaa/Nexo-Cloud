import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";
import type { JsonObject } from "../multitenancy/server.ts";
import { requireWorkspaceAccess } from "../multitenancy/server.ts";

const stages = ["new", "engaged", "qualifying", "qualified", "nurture", "handoff_pending", "human_active", "converted", "lost"] as const;
type LeadStage = (typeof stages)[number];

export type LeadToolInput = {
  workspaceId: string;
  externalContactId: string;
  conversationId?: string;
  name?: string;
  email?: string;
  phone?: string;
  stage?: LeadStage;
  score?: number;
  intent?: string;
  source?: string;
  qualificationData?: JsonObject;
  idempotencyKey: string;
  traceId?: string;
};

export type LeadToolResult = {
  created: boolean;
  idempotent: boolean;
  leadId: string;
  stage: LeadStage;
  score: number;
  changedFields: string[];
};

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const result = value.replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
  return result || undefined;
}

function score(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const result = Number(value);
  return Number.isFinite(result) ? Math.min(Math.max(Math.round(result), 0), 100) : undefined;
}

function safeData(value: JsonObject | undefined): JsonObject {
  if (!value) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 30));
}

function inputHash(input: LeadToolInput): string {
  return createHash("sha256").update(JSON.stringify({ externalContactId: input.externalContactId, stage: input.stage, score: input.score, intent: input.intent, source: input.source, qualificationData: safeData(input.qualificationData) })).digest("hex");
}

export async function createOrUpdateLead(sql: Sql, userId: string | null, input: LeadToolInput): Promise<LeadToolResult> {
  if (userId) await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const externalContactId = text(input.externalContactId, 160);
  if (!externalContactId) throw new Error("LEAD_CONTACT_REQUIRED");
  if (input.stage && !stages.includes(input.stage)) throw new Error("LEAD_STAGE_INVALID");
  const idempotencyKey = text(input.idempotencyKey, 160);
  if (!idempotencyKey) throw new Error("LEAD_IDEMPOTENCY_REQUIRED");
  if (input.conversationId) {
    const conversation = await sql<{ id: string }>`select id from conversations where id = ${input.conversationId} and workspace_id = ${input.workspaceId} limit 1`;
    if (!conversation[0]) throw new Error("LEAD_CONVERSATION_NOT_FOUND");
  }
  const duplicate = await sql<{ lead_id: string }>`select lead_id from crm_lead_events where workspace_id = ${input.workspaceId} and idempotency_key = ${idempotencyKey} limit 1`;
  if (duplicate[0]) {
    const current = await sql<{ id: string; stage: LeadStage; score: number }>`select id, stage, score from crm_leads where id = ${duplicate[0].lead_id} and workspace_id = ${input.workspaceId} limit 1`;
    if (!current[0]) throw new Error("LEAD_EVENT_CORRUPTED");
    return { created: false, idempotent: true, leadId: current[0].id, stage: current[0].stage, score: Number(current[0].score), changedFields: [] };
  }
  const current = await sql<{ id: string; stage: LeadStage; score: number; name: string | null; email: string | null; phone: string | null; intent: string | null; source: string | null; qualification_data: JsonObject }>`select id, stage, score, name, email, phone, intent, source, qualification_data from crm_leads where workspace_id = ${input.workspaceId} and external_contact_id = ${externalContactId} limit 1`;
  const nextStage = input.stage ?? current[0]?.stage ?? "new";
  const nextScore = score(input.score) ?? Number(current[0]?.score ?? 0);
  const values = {
    name: text(input.name, 120) ?? current[0]?.name ?? null,
    email: text(input.email, 160) ?? current[0]?.email ?? null,
    phone: text(input.phone, 40) ?? current[0]?.phone ?? null,
    intent: text(input.intent, 80) ?? current[0]?.intent ?? null,
    source: text(input.source, 80) ?? current[0]?.source ?? null,
    qualificationData: { ...(current[0]?.qualification_data ?? {}), ...safeData(input.qualificationData) },
  };
  const leadId = current[0]?.id ?? randomUUID();
  await sql.query(
    `insert into crm_leads (id, workspace_id, external_contact_id, name, email, phone, stage, score, intent, source, qualification_data, last_conversation_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
     on conflict (workspace_id, external_contact_id) do update set
       name = coalesce(excluded.name, crm_leads.name), email = coalesce(excluded.email, crm_leads.email), phone = coalesce(excluded.phone, crm_leads.phone),
       stage = excluded.stage, score = greatest(crm_leads.score, excluded.score), intent = coalesce(excluded.intent, crm_leads.intent),
       source = coalesce(excluded.source, crm_leads.source), qualification_data = crm_leads.qualification_data || excluded.qualification_data,
       last_conversation_id = coalesce(excluded.last_conversation_id, crm_leads.last_conversation_id), updated_at = current_timestamp`,
    [leadId, input.workspaceId, externalContactId, values.name, values.email, values.phone, nextStage, nextScore, values.intent, values.source, JSON.stringify(values.qualificationData), input.conversationId ?? null],
  );
  const changedFields = Object.entries({ name: input.name, email: input.email, phone: input.phone, stage: input.stage, score: input.score, intent: input.intent, source: input.source, qualificationData: input.qualificationData }).filter(([, value]) => value !== undefined).map(([key]) => key);
  await sql.query(`insert into crm_lead_events (id, workspace_id, lead_id, conversation_id, event_type, idempotency_key, trace_id, changed_fields) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) on conflict (workspace_id, idempotency_key) do nothing`, [randomUUID(), input.workspaceId, leadId, input.conversationId ?? null, current[0] ? "updated" : "created", idempotencyKey, input.traceId ?? null, JSON.stringify({ fields: changedFields, inputHash: inputHash(input) })]);
  return { created: !current[0], idempotent: false, leadId, stage: nextStage, score: nextScore, changedFields };
}

export async function executeLeadCreateOrUpdate(sql: Sql, userId: string | null, input: LeadToolInput & { requestedBy?: "model" | "system" | "user" }): Promise<LeadToolResult> {
  const tool = await sql<{ id: string }>`select id from tools where workspace_id is null and key = 'lead.create_or_update' and status = 'active' order by version desc limit 1`;
  if (!tool[0]) throw new Error("TOOL_NOT_FOUND");
  const executionId = randomUUID();
  await sql.query(`insert into tool_executions (id, workspace_id, tool_id, requested_by, status, input_hash, input_redacted, started_at) values ($1,$2,$3,$4,'running',$5,$6::jsonb,current_timestamp)`, [executionId, input.workspaceId, tool[0].id, input.requestedBy ?? "system", inputHash(input), JSON.stringify({ externalContactId: input.externalContactId, conversationId: input.conversationId, stage: input.stage, intent: input.intent, source: input.source })]);
  const started = Date.now();
  try {
    const result = await createOrUpdateLead(sql, userId, input);
    await sql.query(`update tool_executions set status = 'succeeded', output_redacted = $1::jsonb, latency_ms = $2, finished_at = current_timestamp where id = $3`, [JSON.stringify({ created: result.created, idempotent: result.idempotent, leadId: result.leadId, stage: result.stage, score: result.score }), Date.now() - started, executionId]);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "LEAD_TOOL_FAILED";
    await sql.query(`update tool_executions set status = 'failed', error_code = $1, error_message = $2, latency_ms = $3, finished_at = current_timestamp where id = $4`, [message.slice(0, 120), message.slice(0, 500), Date.now() - started, executionId]);
    throw error;
  }
}


const qualificationFields = new Set(["need", "budget", "timeline", "company", "role", "location", "productInterest", "decisionMaker", "consent"]);
const stageRank: Record<LeadStage, number> = { new: 0, engaged: 1, qualifying: 2, qualified: 3, nurture: 2, handoff_pending: 4, human_active: 5, converted: 6, lost: 6 };

function qualificationInput(value: JsonObject | undefined): JsonObject {
  if (!value || Object.keys(value).length > 20) throw new Error("LEAD_QUALIFICATION_PAYLOAD_INVALID");
  const output: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (!qualificationFields.has(key)) throw new Error(`LEAD_QUALIFICATION_FIELD_NOT_ALLOWED:${key}`);
    if (item !== null && typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean") throw new Error("LEAD_QUALIFICATION_VALUE_INVALID");
    if (typeof item === "string" && item.length > 500) throw new Error("LEAD_QUALIFICATION_VALUE_TOO_LONG");
    output[key] = item;
  }
  return output;
}

function confirmedList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && qualificationFields.has(item)).slice(0, 20) : [];
}

export type QualificationToolInput = {
  workspaceId: string;
  externalContactId: string;
  conversationId?: string;
  qualificationData: JsonObject;
  confirmedFields?: string[];
  stage?: LeadStage;
  score?: number;
  idempotencyKey: string;
  traceId?: string;
};

export async function updateLeadQualification(sql: Sql, userId: string | null, input: QualificationToolInput): Promise<LeadToolResult> {
  if (userId) await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const externalContactId = text(input.externalContactId, 160);
  const idempotencyKey = text(input.idempotencyKey, 160);
  if (!externalContactId) throw new Error("LEAD_CONTACT_REQUIRED");
  if (!idempotencyKey) throw new Error("LEAD_IDEMPOTENCY_REQUIRED");
  if (input.conversationId) {
    const conversation = await sql<{ id: string }>`select id from conversations where id = ${input.conversationId} and workspace_id = ${input.workspaceId} limit 1`;
    if (!conversation[0]) throw new Error("LEAD_CONVERSATION_NOT_FOUND");
  }
  const incoming = qualificationInput(input.qualificationData);
  const duplicate = await sql<{ lead_id: string }>`select lead_id from crm_lead_events where workspace_id = ${input.workspaceId} and idempotency_key = ${idempotencyKey} limit 1`;
  if (duplicate[0]) {
    const current = await sql<{ id: string; stage: LeadStage; score: number }>`select id, stage, score from crm_leads where id = ${duplicate[0].lead_id} and workspace_id = ${input.workspaceId} limit 1`;
    if (!current[0]) throw new Error("LEAD_EVENT_CORRUPTED");
    return { created: false, idempotent: true, leadId: current[0].id, stage: current[0].stage, score: Number(current[0].score), changedFields: [] };
  }
  const current = await sql<{ id: string; stage: LeadStage; score: number; qualification_data: JsonObject }>`select id, stage, score, qualification_data from crm_leads where workspace_id = ${input.workspaceId} and external_contact_id = ${externalContactId} limit 1`;
  const existing = current[0]?.qualification_data ?? {};
  const protectedFields = confirmedList(existing._confirmedFields);
  for (const field of protectedFields) {
    if (field in incoming && JSON.stringify(existing[field]) !== JSON.stringify(incoming[field])) throw new Error(`LEAD_CONFIRMED_FIELD_CONFLICT:${field}`);
  }
  const nextConfirmed = [...new Set([...protectedFields, ...confirmedList(input.confirmedFields)])];
  const merged: JsonObject = { ...existing, ...incoming, _confirmedFields: nextConfirmed };
  const leadId = current[0]?.id ?? randomUUID();
  const requestedStage = input.stage ?? current[0]?.stage ?? "qualifying";
  const nextStage = current[0] && stageRank[requestedStage] < stageRank[current[0].stage] ? current[0].stage : requestedStage;
  const nextScore = Math.max(Number(current[0]?.score ?? 0), score(input.score) ?? 0);
  await sql.query(`insert into crm_leads (id, workspace_id, external_contact_id, stage, score, qualification_data, last_conversation_id) values ($1,$2,$3,$4,$5,$6::jsonb,$7) on conflict (workspace_id, external_contact_id) do update set stage = excluded.stage, score = excluded.score, qualification_data = excluded.qualification_data, last_conversation_id = coalesce(excluded.last_conversation_id, crm_leads.last_conversation_id), updated_at = current_timestamp`, [leadId, input.workspaceId, externalContactId, nextStage, nextScore, JSON.stringify(merged), input.conversationId ?? null]);
  const changedFields = Object.keys(incoming);
  await sql.query(`insert into crm_lead_events (id, workspace_id, lead_id, conversation_id, event_type, idempotency_key, trace_id, changed_fields) values ($1,$2,$3,$4,'qualification_updated',$5,$6,$7::jsonb)`, [randomUUID(), input.workspaceId, leadId, input.conversationId ?? null, idempotencyKey, input.traceId ?? null, JSON.stringify({ fields: changedFields, confirmedFields: nextConfirmed })]);
  return { created: !current[0], idempotent: false, leadId, stage: nextStage, score: nextScore, changedFields };
}

export async function executeLeadUpdateQualification(sql: Sql, userId: string | null, input: QualificationToolInput & { requestedBy?: "model" | "system" | "user" }): Promise<LeadToolResult> {
  const tool = await sql<{ id: string }>`select id from tools where workspace_id is null and key = 'lead.update_qualification' and status = 'active' order by version desc limit 1`;
  if (!tool[0]) throw new Error("TOOL_NOT_FOUND");
  const executionId = randomUUID();
  await sql.query(`insert into tool_executions (id, workspace_id, tool_id, requested_by, status, input_hash, input_redacted, started_at) values ($1,$2,$3,$4,'running',$5,$6::jsonb,current_timestamp)`, [executionId, input.workspaceId, tool[0].id, input.requestedBy ?? "system", inputHash({ ...input, qualificationData: {} } as LeadToolInput), JSON.stringify({ externalContactId: input.externalContactId, conversationId: input.conversationId, confirmedFields: input.confirmedFields, fields: Object.keys(input.qualificationData) })]);
  const started = Date.now();
  try {
    const result = await updateLeadQualification(sql, userId, input);
    await sql.query(`update tool_executions set status = 'succeeded', output_redacted = $1::jsonb, latency_ms = $2, finished_at = current_timestamp where id = $3`, [JSON.stringify({ leadId: result.leadId, stage: result.stage, score: result.score, changedFields: result.changedFields, idempotent: result.idempotent }), Date.now() - started, executionId]);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "LEAD_QUALIFICATION_TOOL_FAILED";
    await sql.query(`update tool_executions set status = 'failed', error_code = $1, error_message = $2, latency_ms = $3, finished_at = current_timestamp where id = $4`, [message.slice(0, 120), message.slice(0, 500), Date.now() - started, executionId]);
    throw error;
  }
}


export function extractQualificationData(textValue: string, intent: string): JsonObject {
  const value = textValue.trim();
  if (!value || value.endsWith("?") || value.endsWith("？")) return {};
  const output: JsonObject = {};
  if ((intent === "pricing_question" || intent === "availability_question") && value.length <= 500) output.need = value;
  const email = value.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0];
  if (email) output.email = email;
  const budget = value.match(/(?:r\$|rs\$?)\s?([\d.,]+)/i)?.[1];
  if (budget) output.budget = `R$ ${budget}`;
  const timeline = value.match(/(?:em|ate|até)\s+(\d+\s*(?:dias?|semanas?|meses?|anos?))/i)?.[1];
  if (timeline) output.timeline = timeline;
  return output;
}
