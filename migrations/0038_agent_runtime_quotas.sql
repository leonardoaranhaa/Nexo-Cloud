-- Daily runtime execution quotas, scoped by workspace and agent.
-- A missing policy uses the server defaults enforced by the quota service.
create table if not exists agent_runtime_quota_policies (
  workspace_id text primary key references workspaces (id) on delete cascade,
  workspace_daily_limit integer not null default 1000 check (workspace_daily_limit between 1 and 1000000),
  agent_daily_limit integer not null default 250 check (agent_daily_limit between 1 and 1000000),
  enabled boolean not null default true,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create table if not exists agent_runtime_quota_workspace_usage (
  workspace_id text not null references workspaces (id) on delete cascade,
  period_start date not null,
  executions integer not null default 0 check (executions >= 0),
  updated_at timestamptz not null default current_timestamp,
  primary key (workspace_id, period_start)
);

create table if not exists agent_runtime_quota_agent_usage (
  workspace_id text not null references workspaces (id) on delete cascade,
  agent_id text not null references agents (id) on delete cascade,
  period_start date not null,
  executions integer not null default 0 check (executions >= 0),
  updated_at timestamptz not null default current_timestamp,
  primary key (workspace_id, agent_id, period_start)
);

create index if not exists agent_runtime_quota_agent_usage_period_idx
  on agent_runtime_quota_agent_usage (workspace_id, period_start, agent_id);
