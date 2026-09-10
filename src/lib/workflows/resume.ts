import type { Sql } from "../db.ts";

export async function requestWorkflowWaitResume(sql: Sql, input: { workspaceId: string; runId: string; reason?: string }): Promise<boolean> {
  const rows = await sql.query<{ id: string }>(`update workflow_runs set status = 'queued', resume_requested = true, resume_reason = $1, error_code = null, error_message = null where id = $2 and workspace_id = $3 and status = 'waiting' and current_node_id in (select wn.node_id from workflow_node_runs wn where wn.run_id = workflow_runs.id and wn.node_type = 'wait' and wn.status = 'waiting') returning id`, [(input.reason ?? "manual resume").slice(0, 240), input.runId, input.workspaceId]);
  return Boolean(rows[0]);
}

export async function expireWorkflowApprovals(sql: Sql, now = new Date()): Promise<number> {
  const approvals = await sql.query<{ id: string; run_id: string }>(`update workflow_approvals set status = 'expired', decided_at = $1, reason = 'approval expired' where status = 'pending' and expires_at is not null and expires_at <= $1 returning id, run_id`, [now.toISOString()]);
  for (const approval of approvals) await sql.query(`update workflow_runs set status = 'canceled', error_code = 'WORKFLOW_APPROVAL_EXPIRED', error_message = 'Approval expired', resume_requested = false, resume_reason = null where id = $1 and status = 'waiting'`, [approval.run_id]);
  return approvals.length;
}
