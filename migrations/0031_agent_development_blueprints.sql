-- Persisted, workspace-isolated blueprints produced by the assisted agent development environment.
create table if not exists agent_development_blueprints (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  agent_id text not null references agents (id) on delete cascade,
  agent_type text not null default 'custom',
  objectives jsonb not null default '[]'::jsonb,
  capabilities jsonb not null default '[]'::jsonb,
  guardrails jsonb not null default '[]'::jsonb,
  test_scenarios jsonb not null default '[]'::jsonb,
  source_brief text not null default '',
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  unique (workspace_id, agent_id)
);

create index if not exists agent_development_blueprints_workspace_idx
  on agent_development_blueprints (workspace_id, updated_at desc);

create index if not exists agent_development_blueprints_agent_idx
  on agent_development_blueprints (agent_id);
