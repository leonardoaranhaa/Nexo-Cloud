-- Minimal local workflow control plane.
create table if not exists workflows (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  name text not null,
  slug text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  trigger_type text not null default 'manual' check (trigger_type in ('manual', 'webhook', 'event', 'schedule', 'status_change')),
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  deleted_at timestamptz,
  unique (workspace_id, slug)
);

create table if not exists workflow_versions (
  id text primary key,
  workflow_id text not null references workflows (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  definition jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  published_by text,
  published_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default current_timestamp,
  unique (workflow_id, version_number)
);

create unique index if not exists workflow_versions_one_published_idx
  on workflow_versions (workflow_id) where status = 'published';

create table if not exists workflow_triggers (
  id text primary key,
  workflow_id text not null references workflows (id) on delete cascade,
  type text not null check (type in ('manual', 'webhook', 'event', 'schedule', 'status_change')),
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  last_received_at timestamptz,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create table if not exists workflow_runs (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  workflow_id text not null references workflows (id) on delete cascade,
  workflow_version_id text not null references workflow_versions (id) on delete restrict,
  trigger_id text references workflow_triggers (id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'running', 'waiting', 'succeeded', 'failed', 'canceled')),
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  current_node_id text,
  correlation_id text not null,
  idempotency_key text not null,
  attempts integer not null default 0 check (attempts >= 0),
  error_code text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default current_timestamp,
  unique (workspace_id, idempotency_key)
);

create table if not exists workflow_node_runs (
  id text primary key,
  run_id text not null references workflow_runs (id) on delete cascade,
  node_id text not null,
  node_type text not null,
  status text not null check (status in ('queued', 'running', 'waiting', 'succeeded', 'failed', 'skipped')),
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  attempt integer not null default 1 check (attempt > 0),
  error_code text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists workflows_workspace_idx on workflows (workspace_id, updated_at desc);
create index if not exists workflow_runs_workspace_idx on workflow_runs (workspace_id, created_at desc);
create index if not exists workflow_node_runs_run_idx on workflow_node_runs (run_id, started_at);
