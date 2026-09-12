import type { Sql } from "../db.ts";
import { requireWorkspaceAccess } from "../multitenancy/server.ts";

export type WorkspaceReadinessReport = {
  workspaceId: string;
  status: "ready" | "attention" | "blocked";
  connections: {
    total: number;
    ready: number;
    notChecked: number;
    unhealthy: number;
    needsConfiguration: number;
  };
  runtime: {
    executionsToday: number;
    failedToday: number;
    queued: number;
    workspaceDailyLimit: number | null;
    workspaceDailyUsed: number;
  };
  observability: {
    executionsLast24h: number;
    failuresLast24h: number;
    lastExecutionAt: string | null;
  };
  blockers: string[];
};

type ConnectionRow = { health_status: string | null; secret_ref: string | null; provider: string; config: Record<string, unknown> | null };
type RuntimeRow = { executions_today: string | number; failed_today: string | number; queued: string | number };
type QuotaRow = { workspace_daily_limit: string | number | null; executions: string | number | null };
type ObservabilityRow = { executions_last_24h: string | number; failures_last_24h: string | number; last_execution_at: string | null };

function number(value: string | number | null | undefined): number { return Number(value ?? 0); }

export async function getWorkspaceReadinessReport(
  sql: Sql,
  userId: string,
  workspaceId: string,
): Promise<WorkspaceReadinessReport> {
  await requireWorkspaceAccess(sql, userId, workspaceId, "read");
  const connections = await sql.query<ConnectionRow>(
    `select health_status, secret_ref, provider, config from connections where workspace_id = $1 and deleted_at is null`,
    [workspaceId],
  );
  const runtime = (await sql.query<RuntimeRow>(
    `select
       count(*) filter (where created_at::date = current_date) as executions_today,
       count(*) filter (where status in ('failed', 'dead') and created_at::date = current_date) as failed_today,
       count(*) filter (where status in ('queued', 'running')) as queued
     from agent_runtime_jobs where workspace_id = $1`,
    [workspaceId],
  ))[0] ?? { executions_today: 0, failed_today: 0, queued: 0 };
  const quota = (await sql.query<QuotaRow>(
    `select p.workspace_daily_limit, u.executions
       from agent_runtime_quota_policies p
       left join agent_runtime_quota_workspace_usage u
         on u.workspace_id = p.workspace_id and u.period_start = current_date
      where p.workspace_id = $1 limit 1`,
    [workspaceId],
  ))[0] ?? { workspace_daily_limit: null, executions: 0 };
  const observability = (await sql.query<ObservabilityRow>(
    `select
       count(*) as executions_last_24h,
       count(*) filter (where status in ('failed', 'skipped')) as failures_last_24h,
       max(created_at)::text as last_execution_at
     from agent_runtime_execution_logs
     where workspace_id = $1 and created_at >= current_timestamp - interval '24 hours'`,
    [workspaceId],
  ))[0] ?? { executions_last_24h: 0, failures_last_24h: 0, last_execution_at: null };

  let ready = 0;
  let notChecked = 0;
  let unhealthy = 0;
  let needsConfiguration = 0;
  const blockers: string[] = [];
  for (const connection of connections) {
    const config = connection.config ?? {};
    const configured = Boolean(connection.secret_ref) && (connection.provider === "meta"
      ? typeof config.phoneNumberId === "string" && typeof config.graphVersion === "string"
      : Boolean(config.instance && config.baseUrl));
    if (!configured) { needsConfiguration += 1; continue; }
    if (connection.health_status === "healthy") ready += 1;
    else if (connection.health_status === "unhealthy" || connection.health_status === "degraded") unhealthy += 1;
    else notChecked += 1;
  }
  if (connections.length === 0) blockers.push("NO_CONNECTION");
  if (needsConfiguration > 0) blockers.push("CONNECTION_CONFIGURATION_REQUIRED");
  if (unhealthy > 0) blockers.push("UNHEALTHY_CONNECTION");
  if (notChecked > 0) blockers.push("HEALTHCHECK_REQUIRED");
  const limit = quota.workspace_daily_limit === null ? null : number(quota.workspace_daily_limit);
  if (limit !== null && number(quota.executions) >= limit) blockers.push("WORKSPACE_QUOTA_EXHAUSTED");
  if (number(runtime.failed_today) > 0) blockers.push("RUNTIME_FAILURES_TODAY");

  return {
    workspaceId,
    status: blockers.some((code) => ["NO_CONNECTION", "CONNECTION_CONFIGURATION_REQUIRED", "UNHEALTHY_CONNECTION", "WORKSPACE_QUOTA_EXHAUSTED"].includes(code)) ? "blocked" : blockers.length ? "attention" : "ready",
    connections: { total: connections.length, ready, notChecked, unhealthy, needsConfiguration },
    runtime: { executionsToday: number(runtime.executions_today), failedToday: number(runtime.failed_today), queued: number(runtime.queued), workspaceDailyLimit: limit, workspaceDailyUsed: number(quota.executions) },
    observability: { executionsLast24h: number(observability.executions_last_24h), failuresLast24h: number(observability.failures_last_24h), lastExecutionAt: observability.last_execution_at },
    blockers,
  };
}
