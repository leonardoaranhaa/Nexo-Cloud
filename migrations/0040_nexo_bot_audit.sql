-- Multi-tenant audit events for Nexo Bot conversations and operational actions.
create table if not exists nexo_bot_audit_events (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  actor_id text not null,
  event_type text not null check (event_type in ('chat_completed', 'chat_failed', 'action_proposed', 'action_confirmed', 'action_succeeded', 'action_failed')),
  action_id text,
  action_type text,
  status text not null check (status in ('pending', 'succeeded', 'failed')),
  summary text,
  resource_type text,
  resource_id text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  input_chars integer not null default 0 check (input_chars >= 0),
  output_chars integer not null default 0 check (output_chars >= 0),
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default current_timestamp
);

create index if not exists nexo_bot_audit_workspace_created_idx
  on nexo_bot_audit_events (workspace_id, created_at desc);
create index if not exists nexo_bot_audit_workspace_event_idx
  on nexo_bot_audit_events (workspace_id, event_type, created_at desc);
create index if not exists nexo_bot_audit_workspace_action_idx
  on nexo_bot_audit_events (workspace_id, action_type, created_at desc);
