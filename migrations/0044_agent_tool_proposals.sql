-- Governed, workspace-scoped tool proposals generated from agent blueprints.
create table if not exists agent_tool_proposals (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  agent_id text not null references agents (id) on delete cascade,
  blueprint_id text not null references agent_development_blueprints (id) on delete cascade,
  capability text not null,
  tool_id text not null references tools (id) on delete restrict,
  tool_key text not null,
  name text not null,
  description text not null default '',
  input_schema jsonb not null default '{}'::jsonb,
  output_schema jsonb not null default '{}'::jsonb,
  risk_level text not null check (risk_level in ('read', 'write', 'destructive')),
  requires_approval boolean not null default true,
  rationale text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'rejected', 'archived')),
  created_by text not null,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  unique (workspace_id, blueprint_id, capability, tool_key)
);

create index if not exists agent_tool_proposals_workspace_idx
  on agent_tool_proposals (workspace_id, blueprint_id, status, updated_at desc);
create index if not exists agent_tool_proposals_tool_idx
  on agent_tool_proposals (workspace_id, tool_key, status);
