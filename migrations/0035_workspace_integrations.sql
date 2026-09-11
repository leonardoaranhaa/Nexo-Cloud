-- Workspace-scoped integrations provisioned by Marketplace products.
create table if not exists workspace_integrations (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  integration_key text not null,
  name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'connected', 'disconnected', 'error')),
  config jsonb not null default '{}'::jsonb,
  last_tested_at timestamptz,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  unique (workspace_id, integration_key)
);

create index if not exists workspace_integrations_workspace_idx
  on workspace_integrations (workspace_id, status);
