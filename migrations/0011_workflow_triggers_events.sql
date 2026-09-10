-- Workflow approvals, event intake and public trigger tokens.
alter table workflow_triggers
  add column if not exists public_token text,
  add column if not exists timezone text not null default 'UTC',
  add column if not exists cron_expression text;
create unique index if not exists workflow_triggers_public_token_idx
  on workflow_triggers (public_token) where public_token is not null;

create table if not exists workflow_approvals (
  id text primary key,
  run_id text not null references workflow_runs (id) on delete cascade,
  node_run_id text not null references workflow_node_runs (id) on delete cascade,
  workspace_id text not null references workspaces (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  requested_by text not null,
  decided_by text,
  reason text not null default '',
  expires_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default current_timestamp
);

create table if not exists workflow_events (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  event_type text not null,
  source text not null,
  external_event_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  correlation_id text not null,
  created_at timestamptz not null default current_timestamp,
  processed_at timestamptz,
  unique (workspace_id, source, external_event_id)
);

create index if not exists workflow_approvals_workspace_idx on workflow_approvals (workspace_id, status, created_at desc);
create index if not exists workflow_events_workspace_idx on workflow_events (workspace_id, created_at desc);
