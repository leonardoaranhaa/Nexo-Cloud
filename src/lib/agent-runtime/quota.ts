import type { Sql } from "../db.ts";
import type { AgentRuntimeJob } from "./queue.ts";

export const DEFAULT_WORKSPACE_DAILY_LIMIT = 1_000;
export const DEFAULT_AGENT_DAILY_LIMIT = 250;

type QuotaPolicy = {
  workspace_daily_limit: number;
  agent_daily_limit: number;
  enabled: boolean;
};

export type RuntimeQuotaReservation = {
  periodStart: string;
  workspaceUsed: number;
  workspaceLimit: number;
  agentUsed: number;
  agentLimit: number;
};

export class RuntimeQuotaExceededError extends Error {
  readonly code = "RUNTIME_QUOTA_EXCEEDED" as const;
  readonly scope: "workspace" | "agent";

  constructor(scope: "workspace" | "agent") {
    super(`Daily runtime execution quota exceeded for ${scope}`);
    this.name = "RuntimeQuotaExceededError";
    this.scope = scope;
  }
}

export class RuntimeQuotaDisabledError extends Error {
  readonly code = "RUNTIME_QUOTA_DISABLED" as const;

  constructor() {
    super("Daily runtime execution quota is disabled for this workspace");
    this.name = "RuntimeQuotaDisabledError";
  }
}

function utcPeriodStart(): string {
  return new Date().toISOString().slice(0, 10);
}

function positiveLimit(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function ensureQuotaSchema(sql: Sql): Promise<void> {
  await sql.query(`create table if not exists agent_runtime_quota_policies (
    workspace_id text primary key references workspaces (id) on delete cascade,
    workspace_daily_limit integer not null default 1000,
    agent_daily_limit integer not null default 250,
    enabled boolean not null default true,
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp
  )`);
  await sql.query(`create table if not exists agent_runtime_quota_workspace_usage (
    workspace_id text not null references workspaces (id) on delete cascade,
    period_start date not null,
    executions integer not null default 0,
    updated_at timestamptz not null default current_timestamp,
    primary key (workspace_id, period_start)
  )`);
  await sql.query(`create table if not exists agent_runtime_quota_agent_usage (
    workspace_id text not null references workspaces (id) on delete cascade,
    agent_id text not null references agents (id) on delete cascade,
    period_start date not null,
    executions integer not null default 0,
    updated_at timestamptz not null default current_timestamp,
    primary key (workspace_id, agent_id, period_start)
  )`);
}

export async function reserveRuntimeQuota(
  sql: Sql,
  job: Pick<AgentRuntimeJob, "workspace_id" | "agent_id">,
): Promise<RuntimeQuotaReservation> {
  await ensureQuotaSchema(sql);
  const policyRows = await sql.query<QuotaPolicy>(
    `select workspace_daily_limit, agent_daily_limit, enabled
       from agent_runtime_quota_policies
      where workspace_id = $1
      limit 1`,
    [job.workspace_id],
  );
  const policy = policyRows[0];
  if (policy && !policy.enabled) throw new RuntimeQuotaDisabledError();

  const periodStart = utcPeriodStart();
  const workspaceLimit = positiveLimit(policy?.workspace_daily_limit, DEFAULT_WORKSPACE_DAILY_LIMIT);
  const agentLimit = positiveLimit(policy?.agent_daily_limit, DEFAULT_AGENT_DAILY_LIMIT);
  const workspaceRows = await sql.query<{ executions: number }>(
    `insert into agent_runtime_quota_workspace_usage
      (workspace_id, period_start, executions)
     values ($1, $2, 1)
     on conflict (workspace_id, period_start) do update set
       executions = agent_runtime_quota_workspace_usage.executions + 1,
       updated_at = current_timestamp
     where agent_runtime_quota_workspace_usage.executions < $3
     returning executions`,
    [job.workspace_id, periodStart, workspaceLimit],
  );
  if (!workspaceRows[0]) throw new RuntimeQuotaExceededError("workspace");

  const agentRows = await sql.query<{ executions: number }>(
    `insert into agent_runtime_quota_agent_usage
      (workspace_id, agent_id, period_start, executions)
     values ($1, $2, $3, 1)
     on conflict (workspace_id, agent_id, period_start) do update set
       executions = agent_runtime_quota_agent_usage.executions + 1,
       updated_at = current_timestamp
     where agent_runtime_quota_agent_usage.executions < $4
     returning executions`,
    [job.workspace_id, job.agent_id, periodStart, agentLimit],
  );
  if (!agentRows[0]) {
    await sql.query(
      `update agent_runtime_quota_workspace_usage
          set executions = greatest(executions - 1, 0), updated_at = current_timestamp
        where workspace_id = $1 and period_start = $2`,
      [job.workspace_id, periodStart],
    );
    throw new RuntimeQuotaExceededError("agent");
  }

  return {
    periodStart,
    workspaceUsed: Number(workspaceRows[0].executions),
    workspaceLimit,
    agentUsed: Number(agentRows[0].executions),
    agentLimit,
  };
}
