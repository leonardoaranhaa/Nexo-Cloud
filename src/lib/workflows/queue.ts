import { randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";

export type ClaimedWorkflowRun = {
  id: string;
  workspace_id: string;
  workflow_id: string;
  workflow_version_id: string;
  input: Record<string, unknown>;
  context: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  correlation_id: string;
};

export async function requeueExpiredWorkflowLeases(sql: Sql): Promise<number> {
  const result = await sql.query<{ id: string }>(`update workflow_runs set status = 'queued', claimed_by = null, lease_until = null, next_attempt_at = current_timestamp, last_error_at = current_timestamp where status = 'running' and lease_until < current_timestamp returning id`);
  return result.length;
}

export async function claimWorkflowRun(sql: Sql, workerId: string = randomUUID(), leaseSeconds = 60): Promise<ClaimedWorkflowRun | null> {
  await requeueExpiredWorkflowLeases(sql);
  const rows = await sql.query<ClaimedWorkflowRun>(`with candidate as (
    select id from workflow_runs
    where status = 'queued' and next_attempt_at <= current_timestamp
    order by created_at
    for update skip locked limit 1
  )
  update workflow_runs r set status = 'running', claimed_by = $1, lease_until = current_timestamp + ($2 || ' seconds')::interval, attempts = r.attempts + 1, started_at = coalesce(r.started_at, current_timestamp)
  from candidate where r.id = candidate.id
  returning r.id, r.workspace_id, r.workflow_id, r.workflow_version_id, r.input, r.context, r.attempts, r.max_attempts, r.correlation_id`, [workerId, Math.max(10, Math.min(900, leaseSeconds))]);
  return rows[0] ?? null;
}

export async function renewWorkflowLease(sql: Sql, runId: string, workerId: string, leaseSeconds = 60): Promise<boolean> {
  const rows = await sql.query<{ id: string }>(`update workflow_runs set lease_until = current_timestamp + ($1 || ' seconds')::interval where id = $2 and claimed_by = $3 and status = 'running' returning id`, [Math.max(10, Math.min(900, leaseSeconds)), runId, workerId]);
  return Boolean(rows[0]);
}

export async function completeWorkflowRun(sql: Sql, runId: string, workerId: string, output: Record<string, unknown>): Promise<boolean> {
  const rows = await sql.query<{ id: string }>(`update workflow_runs set status = 'succeeded', output = $1::jsonb, finished_at = current_timestamp, claimed_by = null, lease_until = null where id = $2 and claimed_by = $3 and status = 'running' returning id`, [JSON.stringify(output), runId, workerId]);
  return Boolean(rows[0]);
}

export async function failOrRetryWorkflowRun(sql: Sql, runId: string, workerId: string, errorCode: string, errorMessage: string): Promise<"queued" | "failed" | "lost"> {
  const rows = await sql.query<{ attempts: number; max_attempts: number }>(`select attempts, max_attempts from workflow_runs where id = $1 and claimed_by = $2 and status = 'running'`, [runId, workerId]);
  if (!rows[0]) return "lost";
  const terminal = rows[0].attempts >= rows[0].max_attempts;
  await sql.query(`update workflow_runs set status = $1, error_code = $2, error_message = $3, last_error_at = current_timestamp, next_attempt_at = case when $1 = 'queued' then current_timestamp + (power(2, greatest(attempts - 1, 0)) * interval '5 seconds') else next_attempt_at end, finished_at = case when $1 = 'failed' then current_timestamp else null end, claimed_by = null, lease_until = null where id = $4 and claimed_by = $5`, [terminal ? "failed" : "queued", errorCode.slice(0, 120), errorMessage.slice(0, 1000), runId, workerId]);
  return terminal ? "failed" : "queued";
}
