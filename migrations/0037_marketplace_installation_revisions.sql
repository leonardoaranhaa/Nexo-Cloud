-- Reversible Marketplace installation updates.
create table if not exists agent_installation_revisions (
  id text primary key,
  installation_id text not null references agent_installations (id) on delete cascade,
  workspace_id text not null references workspaces (id) on delete cascade,
  from_version_id text not null references agent_product_versions (id),
  to_version_id text not null references agent_product_versions (id),
  from_config jsonb not null default '{}'::jsonb,
  to_config jsonb not null default '{}'::jsonb,
  action text not null check (action in ('update', 'rollback')),
  created_by text not null,
  created_at timestamptz not null default current_timestamp
);
create index if not exists agent_installation_revisions_workspace_idx on agent_installation_revisions (workspace_id, installation_id, created_at desc);
