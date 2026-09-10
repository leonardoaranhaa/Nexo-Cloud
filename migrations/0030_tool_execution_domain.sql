-- Harden the multi-tenant tool execution domain without duplicating connections.
-- Existing connections are the workspace-scoped connector instances.
alter table tools
  add column if not exists output_schema jsonb not null default '{}'::jsonb;

alter table agent_tool_permissions
  add column if not exists workspace_id text references workspaces (id) on delete cascade;

update agent_tool_permissions p
set workspace_id = a.workspace_id
from agent_versions v
join agents a on a.id = v.agent_id
where p.agent_version_id = v.id
  and p.workspace_id is null;

alter table tool_executions
  add column if not exists organization_id text references organizations (id) on delete set null,
  add column if not exists agent_id text references agents (id) on delete set null,
  add column if not exists agent_version_id text references agent_versions (id) on delete set null,
  add column if not exists conversation_id text references conversations (id) on delete set null,
  add column if not exists trace_id text,
  add column if not exists idempotency_key text,
  add column if not exists approved_by text,
  add column if not exists approval_id text;

create unique index if not exists tool_executions_workspace_idempotency_idx
  on tool_executions (workspace_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists tool_executions_workspace_trace_idx
  on tool_executions (workspace_id, trace_id, created_at desc);

create index if not exists agent_tool_permissions_workspace_idx
  on agent_tool_permissions (workspace_id, agent_version_id, enabled);

create table if not exists tool_execution_approvals (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  tool_execution_id text not null references tool_executions (id) on delete cascade,
  requested_by text not null,
  approver_id text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'expired')),
  reason text not null default '',
  expires_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default current_timestamp,
  unique (tool_execution_id)
);

create index if not exists tool_execution_approvals_workspace_idx
  on tool_execution_approvals (workspace_id, status, created_at desc);
