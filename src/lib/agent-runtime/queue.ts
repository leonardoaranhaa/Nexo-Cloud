import { randomUUID } from "node:crypto";
import type { Sql } from "../db";

export type AgentRuntimeJob = {
  id: string;
  workspace_id: string;
  agent_id: string;
  conversation_id: string;
  inbound_message_id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "dead";
  attempt_count: number;
  available_at: string;
  locked_at: string | null;
  locked_by: string | null;
  trace_id: string;
};

export async function enqueueAgentRuntimeJob(
  sql: Sql,
  input: { workspaceId: string; agentId: string; conversationId: string; inboundMessageId: string; traceId?: string },
): Promise<{ id: string; created: boolean }> {
  const id = randomUUID();
  const traceId = input.traceId?.trim() || randomUUID();
  const rows = await sql.query<{ id: string }>(
    `insert into agent_runtime_jobs
      (id, workspace_id, agent_id, conversation_id, inbound_message_id, trace_id)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (workspace_id, inbound_message_id) do nothing
     returning id`,
    [id, input.workspaceId, input.agentId, input.conversationId, input.inboundMessageId, traceId],
  );
  if (rows[0]) return { id: rows[0].id, created: true };
  const existing = await sql.query<{ id: string }>(
    `select id from agent_runtime_jobs where workspace_id = $1 and inbound_message_id = $2 limit 1`,
    [input.workspaceId, input.inboundMessageId],
  );
  if (!existing[0]) throw new Error("AGENT_RUNTIME_JOB_CLAIM_FAILED");
  return { id: existing[0].id, created: false };
}

export async function claimAgentRuntimeJob(
  sql: Sql,
  workerId: string,
  leaseSeconds = 90,
): Promise<AgentRuntimeJob | undefined> {
  const lease = Math.min(Math.max(Math.round(leaseSeconds), 15), 600);
  const rows = await sql.query<AgentRuntimeJob>(
    `update agent_runtime_jobs
        set status = 'running',
            attempt_count = attempt_count + 1,
            locked_at = current_timestamp,
            locked_by = $1,
            updated_at = current_timestamp
      where id = (
        select id from agent_runtime_jobs
         where (status = 'queued' and available_at <= current_timestamp)
            or (status = 'running' and locked_at < current_timestamp - ($2 || ' seconds')::interval)
         order by available_at asc, created_at asc
         limit 1
      )
      returning id, workspace_id, agent_id, conversation_id, inbound_message_id,
                status, attempt_count, available_at, locked_at, locked_by, trace_id`,
    [workerId, String(lease)],
  );
  return rows[0];
}

export async function completeAgentRuntimeJob(sql: Sql, job: AgentRuntimeJob): Promise<void> {
  await sql.query(
    `update agent_runtime_jobs
        set status = 'succeeded', completed_at = current_timestamp,
            locked_at = null, locked_by = null, updated_at = current_timestamp
      where id = $1 and workspace_id = $2 and status = 'running' and locked_by = $3`,
    [job.id, job.workspace_id, job.locked_by],
  );
}

export async function failAgentRuntimeJob(
  sql: Sql,
  job: AgentRuntimeJob,
  errorCode: string,
  errorMessage: string,
  maxAttempts = 3,
): Promise<"queued" | "dead"> {
  const terminal = job.attempt_count >= Math.min(Math.max(Math.round(maxAttempts), 1), 10);
  const safeCode = errorCode.slice(0, 120);
  const safeMessage = errorMessage.slice(0, 500);
  await sql.query(
    `update agent_runtime_jobs
        set status = $1,
            available_at = case when $1 = 'queued' then current_timestamp + (($2 * $2) || ' seconds')::interval else available_at end,
            locked_at = null, locked_by = null,
            last_error_code = $3, last_error_message = $4,
            updated_at = current_timestamp,
            completed_at = case when $1 = 'dead' then current_timestamp else completed_at end
      where id = $5 and workspace_id = $6 and status = 'running' and locked_by = $7`,
    [terminal ? "dead" : "queued", job.attempt_count, safeCode, safeMessage, job.id, job.workspace_id, job.locked_by],
  );
  return terminal ? "dead" : "queued";
}
