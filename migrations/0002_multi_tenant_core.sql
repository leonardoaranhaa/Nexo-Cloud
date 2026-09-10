-- Nexo Cloud multi-tenant core.
-- Every business resource is scoped to a workspace.
-- User references remain TEXT without a database FK because the local preview
-- supports the signed-out dev-user fallback while production uses Better Auth.

create table if not exists organizations (
  id text primary key,
  name text not null,
  slug text not null,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'deleted')),
  created_by text not null,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  deleted_at timestamptz,
  unique (slug)
);

create table if not exists organization_memberships (
  organization_id text not null references organizations (id) on delete cascade,
  user_id text not null,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member', 'billing')),
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  primary key (organization_id, user_id)
);

create index if not exists organization_memberships_user_idx
  on organization_memberships (user_id);

create table if not exists workspaces (
  id text primary key,
  organization_id text not null references organizations (id) on delete cascade,
  name text not null,
  slug text not null,
  environment text not null default 'development'
    check (environment in ('development', 'staging', 'production')),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'deleted')),
  created_by text not null,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  deleted_at timestamptz,
  unique (organization_id, slug)
);

create index if not exists workspaces_organization_idx
  on workspaces (organization_id);

create table if not exists workspace_memberships (
  workspace_id text not null references workspaces (id) on delete cascade,
  user_id text not null,
  role text not null default 'viewer'
    check (role in ('workspace_admin', 'builder', 'operator', 'analyst', 'viewer')),
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  primary key (workspace_id, user_id)
);

create index if not exists workspace_memberships_user_idx
  on workspace_memberships (user_id);

create table if not exists agents (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  name text not null,
  slug text not null,
  agent_type text not null default 'support'
    check (agent_type in ('support', 'sales', 'marketing', 'ads', 'traffic', 'operations', 'custom')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'archived')),
  language text not null default 'pt'
    check (language in ('pt', 'en', 'es')),
  persona text not null default '',
  welcome_message text not null default '',
  system_prompt text not null default '',
  model_provider text not null default 'xai',
  model_name text not null default 'grok-4.5',
  temperature numeric(3, 2) not null default 0.4
    check (temperature >= 0 and temperature <= 2),
  max_tokens integer not null default 400
    check (max_tokens between 80 and 16000),
  memory_window integer not null default 8
    check (memory_window between 0 and 100),
  knowledge jsonb not null default '{}'::jsonb,
  tools jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  deleted_at timestamptz,
  unique (workspace_id, slug)
);

create index if not exists agents_workspace_status_idx
  on agents (workspace_id, status);

create table if not exists agent_versions (
  id text primary key,
  agent_id text not null references agents (id) on delete cascade,
  version_number integer not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'retired')),
  config jsonb not null,
  created_by text not null,
  created_at timestamptz not null default current_timestamp,
  published_by text,
  published_at timestamptz,
  retired_at timestamptz,
  unique (agent_id, version_number)
);

create unique index if not exists agent_versions_one_published_idx
  on agent_versions (agent_id)
  where status = 'published';

create table if not exists connections (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  name text not null,
  provider text not null,
  status text not null default 'pending'
    check (status in ('pending', 'connected', 'disconnected', 'error', 'revoked')),
  external_account_id text,
  external_phone_id text,
  secret_ref text,
  config jsonb not null default '{}'::jsonb,
  last_healthcheck_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  deleted_at timestamptz
);

create index if not exists connections_workspace_provider_idx
  on connections (workspace_id, provider);

create table if not exists agent_connections (
  agent_id text not null references agents (id) on delete cascade,
  connection_id text not null references connections (id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default current_timestamp,
  primary key (agent_id, connection_id)
);

create unique index if not exists agent_connections_one_primary_idx
  on agent_connections (agent_id)
  where is_primary = true;
