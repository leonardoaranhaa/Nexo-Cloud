-- Offline/evaluation runs for blueprint scenarios. No external side effects are allowed.
create table if not exists agent_blueprint_evaluation_runs (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  agent_id text not null references agents (id) on delete cascade,
  blueprint_id text not null references agent_development_blueprints (id) on delete cascade,
  agent_version_id text references agent_versions (id) on delete set null,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed')),
  scenario_count integer not null default 0 check (scenario_count >= 0),
  passed_count integer not null default 0 check (passed_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  duration_ms integer,
  error_code text,
  error_message text,
  created_by text not null,
  created_at timestamptz not null default current_timestamp,
  completed_at timestamptz
);

create table if not exists agent_blueprint_evaluation_results (
  id text primary key,
  run_id text not null references agent_blueprint_evaluation_runs (id) on delete cascade,
  workspace_id text not null references workspaces (id) on delete cascade,
  agent_id text not null references agents (id) on delete cascade,
  blueprint_id text not null references agent_development_blueprints (id) on delete cascade,
  scenario_id text not null,
  scenario_name text not null,
  status text not null check (status in ('passed', 'failed')),
  reply text not null default '',
  reason text not null default '',
  intent text not null default '',
  next_action text not null default '',
  tools_called jsonb not null default '[]'::jsonb,
  handoff boolean not null default false,
  used_ai boolean not null default false,
  evidence_count integer not null default 0,
  latency_ms integer not null default 0,
  output_tokens integer not null default 0,
  failures jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default current_timestamp,
  unique (run_id, scenario_id)
);

create index if not exists agent_blueprint_evaluation_runs_workspace_idx
  on agent_blueprint_evaluation_runs (workspace_id, created_at desc);
create index if not exists agent_blueprint_evaluation_results_run_idx
  on agent_blueprint_evaluation_results (run_id, status);
create index if not exists agent_blueprint_evaluation_results_workspace_idx
  on agent_blueprint_evaluation_results (workspace_id, created_at desc);
