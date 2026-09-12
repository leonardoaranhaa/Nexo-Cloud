-- Idempotent relation between an agent blueprint and its generated workflow draft.
create table if not exists agent_blueprint_workflows (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  blueprint_id text not null references agent_development_blueprints (id) on delete cascade,
  agent_id text not null references agents (id) on delete cascade,
  workflow_id text not null references workflows (id) on delete cascade,
  generated_by text not null,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  unique (workspace_id, blueprint_id),
  unique (workspace_id, workflow_id)
);

create index if not exists agent_blueprint_workflows_workspace_idx
  on agent_blueprint_workflows (workspace_id, updated_at desc);
