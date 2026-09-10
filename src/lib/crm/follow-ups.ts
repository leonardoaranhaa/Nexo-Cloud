import { randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";
import { requireWorkspaceAccess } from "../multitenancy/server.ts";
import { dispatchTextMessageAsRuntime, type DispatchTextResult } from "../messaging/router.ts";
import { unavailableSecretProvider, type SecretProvider } from "../connectors/secrets.ts";

const terminalStages = new Set(["converted", "lost", "human_active"]);
export type FollowUpInput = { workspaceId: string; externalContactId: string; conversationId?: string; agentId: string; connectionId: string; cadenceId?: string; message: string; scheduledAt: string; stepNumber?: number; maxAttempts?: number; idempotencyKey: string; traceId?: string };
export type FollowUpResult = { id: string; created: boolean; idempotent: boolean; status: "scheduled" | "processing" | "sent" | "cancelled" | "skipped" | "failed"; scheduledAt: string; reason?: string };

type FollowUpRow = { id: string; workspace_id: string; lead_id: string; conversation_id: string | null; agent_id: string; connection_id: string; external_contact_id: string; message: string; attempt_count: number; max_attempts: number; scheduled_at: string; created_at: string; trace_id: string | null };
function clean(value: unknown, max: number): string | undefined { return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined; }

export async function createLeadFollowUp(sql: Sql, userId: string | null, input: FollowUpInput): Promise<FollowUpResult> {
  if (userId) await requireWorkspaceAccess(sql, userId, input.workspaceId, "operate");
  const contact = clean(input.externalContactId, 160); const message = clean(input.message, 4096); const key = clean(input.idempotencyKey, 160);
  if (!contact) throw new Error("FOLLOW_UP_CONTACT_REQUIRED");
  if (!message) throw new Error("FOLLOW_UP_MESSAGE_REQUIRED");
  if (!key) throw new Error("FOLLOW_UP_IDEMPOTENCY_REQUIRED");
  const scheduled = new Date(input.scheduledAt);
  if (!Number.isFinite(scheduled.getTime()) || scheduled.getTime() <= Date.now()) throw new Error("FOLLOW_UP_SCHEDULE_INVALID");
  const step = Math.min(Math.max(Math.round(input.stepNumber ?? 1), 1), 20); const maxAttempts = Math.min(Math.max(Math.round(input.maxAttempts ?? 3), 1), 10);
  const duplicate = await sql<{ id: string; status: FollowUpResult["status"]; scheduled_at: string }>`select id, status, scheduled_at from crm_follow_ups where workspace_id = ${input.workspaceId} and idempotency_key = ${key} limit 1`;
  if (duplicate[0]) return { id: duplicate[0].id, created: false, idempotent: true, status: duplicate[0].status, scheduledAt: duplicate[0].scheduled_at };
  const lead = await sql<{ id: string; stage: string }>`select id, stage from crm_leads where workspace_id = ${input.workspaceId} and external_contact_id = ${contact} limit 1`;
  if (!lead[0]) throw new Error("LEAD_NOT_FOUND");
  if (terminalStages.has(lead[0].stage)) throw new Error("FOLLOW_UP_LEAD_TERMINAL");
  const route = await sql<{ agent_id: string; connection_id: string }>`select a.id as agent_id, c.id as connection_id from agents a join agent_connections ac on ac.agent_id = a.id and ac.connection_id = ${input.connectionId} and ac.is_primary = true join connections c on c.id = ac.connection_id and c.workspace_id = ${input.workspaceId} where a.id = ${input.agentId} and a.workspace_id = ${input.workspaceId} and a.status = 'active' and c.status <> 'revoked' and c.deleted_at is null limit 1`;
  if (!route[0]) throw new Error("FOLLOW_UP_ROUTE_INVALID");
  if (input.conversationId) {
    const conversation = await sql<{ id: string }>`select id from conversations where id = ${input.conversationId} and workspace_id = ${input.workspaceId} and external_contact_id = ${contact} limit 1`;
    if (!conversation[0]) throw new Error("FOLLOW_UP_CONVERSATION_INVALID");
  }
  if (input.cadenceId) {
    const cadence = await sql<{ id: string }>`select id from crm_follow_up_cadences where id = ${input.cadenceId} and workspace_id = ${input.workspaceId} and status = 'active' limit 1`;
    if (!cadence[0]) throw new Error("FOLLOW_UP_CADENCE_INVALID");
  }
  const id = randomUUID();
  await sql.query(`insert into crm_follow_ups (id, workspace_id, lead_id, conversation_id, agent_id, connection_id, cadence_id, external_contact_id, message, step_number, scheduled_at, max_attempts, idempotency_key, trace_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [id, input.workspaceId, lead[0].id, input.conversationId ?? null, route[0].agent_id, route[0].connection_id, input.cadenceId ?? null, contact, message, step, scheduled.toISOString(), maxAttempts, key, input.traceId ?? null]);
  return { id, created: true, idempotent: false, status: "scheduled", scheduledAt: scheduled.toISOString() };
}

export async function executeLeadCreateFollowUp(sql: Sql, userId: string | null, input: FollowUpInput & { requestedBy?: "model" | "system" | "user" }): Promise<FollowUpResult> {
  const tool = await sql<{ id: string }>`select id from tools where workspace_id is null and key = 'lead.create_follow_up' and status = 'active' limit 1`;
  if (!tool[0]) throw new Error("TOOL_NOT_FOUND");
  const executionId = randomUUID(); const started = Date.now();
  await sql.query(`insert into tool_executions (id, workspace_id, tool_id, requested_by, status, input_hash, input_redacted, started_at) values ($1,$2,$3,$4,'running',$5,$6::jsonb,current_timestamp)`, [executionId, input.workspaceId, tool[0].id, input.requestedBy ?? "system", `follow-up:${input.idempotencyKey}`, JSON.stringify({ externalContactId: input.externalContactId, agentId: input.agentId, connectionId: input.connectionId, cadenceId: input.cadenceId, stepNumber: input.stepNumber, scheduledAt: input.scheduledAt })]);
  try {
    const result = await createLeadFollowUp(sql, userId, input);
    await sql.query(`update tool_executions set status = 'succeeded', output_redacted = $1::jsonb, latency_ms = $2, finished_at = current_timestamp where id = $3`, [JSON.stringify(result), Date.now() - started, executionId]);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "FOLLOW_UP_TOOL_FAILED";
    await sql.query(`update tool_executions set status = 'failed', error_code = $1, error_message = $2, latency_ms = $3, finished_at = current_timestamp where id = $4`, [message.slice(0, 120), message.slice(0, 500), Date.now() - started, executionId]);
    throw error;
  }
}

export async function cancelLeadFollowUps(sql: Sql, input: { workspaceId: string; leadId: string; reason: string }): Promise<number> {
  const result = await sql.query<{ id: string }>(`update crm_follow_ups set status = 'cancelled', cancellation_reason = $1, updated_at = current_timestamp where workspace_id = $2 and lead_id = $3 and status in ('scheduled','failed') returning id`, [input.reason.slice(0, 160), input.workspaceId, input.leadId]);
  return result.length;
}

async function cancelIfNeeded(sql: Sql, row: FollowUpRow): Promise<boolean> {
  const lead = await sql.query<{ stage: string }>(`select stage from crm_leads where id = $1 and workspace_id = $2 limit 1`, [row.lead_id, row.workspace_id]);
  if (!lead[0] || terminalStages.has(lead[0].stage)) { await sql.query(`update crm_follow_ups set status = 'cancelled', cancellation_reason = $1, updated_at = current_timestamp where id = $2 and workspace_id = $3`, [!lead[0] ? "lead_missing" : `lead_${lead[0].stage}`, row.id, row.workspace_id]); return true; }
  const inbound = await sql.query<{ id: string }>(`select id from messages where workspace_id = $1 and conversation_id = $2 and direction = 'inbound' and created_at > $3 limit 1`, [row.workspace_id, row.conversation_id, row.created_at]);
  if (inbound[0]) { await sql.query(`update crm_follow_ups set status = 'cancelled', cancellation_reason = 'contact_replied', updated_at = current_timestamp where id = $1 and workspace_id = $2`, [row.id, row.workspace_id]); return true; }
  return false;
}

export async function pollDueLeadFollowUps(sql: Sql, workerId: string, secretProvider: SecretProvider = unavailableSecretProvider(), now = new Date(), limit = 20): Promise<{ claimed: number; sent: number; cancelled: number; failed: number }> {
  const rows = await sql.query<FollowUpRow>(`with candidates as (select id from crm_follow_ups where status in ('scheduled','failed') and scheduled_at <= $1 and attempt_count < max_attempts order by scheduled_at, created_at limit $2 for update skip locked) update crm_follow_ups f set status = 'processing', attempt_count = f.attempt_count + 1, updated_at = current_timestamp where f.id in (select id from candidates) returning f.*`, [now.toISOString(), Math.min(Math.max(limit, 1), 100)]);
  let sent = 0; let cancelled = 0; let failed = 0;
  for (const row of rows) {
    if (await cancelIfNeeded(sql, row)) { cancelled += 1; continue; }
    try {
      const result: DispatchTextResult = await dispatchTextMessageAsRuntime(sql, { workspaceId: row.workspace_id, agentId: row.agent_id, connectionId: row.connection_id, conversationId: row.conversation_id ?? undefined, recipient: row.external_contact_id, text: row.message, idempotencyKey: `follow-up:${row.id}:attempt:${row.attempt_count}`, actor: "system", traceId: row.trace_id ?? `follow-up:${row.id}` }, secretProvider);
      if (result.status === "sent") { await sql.query(`update crm_follow_ups set status = 'sent', sent_at = current_timestamp, updated_at = current_timestamp where id = $1 and workspace_id = $2`, [row.id, row.workspace_id]); sent += 1; } else throw new Error(result.code);
    } catch (error) {
      const message = error instanceof Error ? error.message : "FOLLOW_UP_DISPATCH_FAILED";
      const retryAt = new Date(now.getTime() + Math.min(60 * 60 * 1000, 2 ** row.attempt_count * 60 * 1000));
      await sql.query(`update crm_follow_ups set status = $1, scheduled_at = $2, last_error = $3, updated_at = current_timestamp where id = $4 and workspace_id = $5`, [row.attempt_count >= row.max_attempts ? "failed" : "scheduled", retryAt.toISOString(), message.slice(0, 500), row.id, row.workspace_id]);
      failed += 1;
    }
  }
  return { claimed: rows.length, sent, cancelled, failed };
}
