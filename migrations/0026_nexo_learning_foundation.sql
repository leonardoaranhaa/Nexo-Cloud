-- Dedicated logical store for sanitized Nexo Learning events.
create table if not exists nexo_learning_events (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  event_type text not null check (event_type in ('agent_turn_completed', 'lead_qualified', 'lead_converted', 'handoff_requested', 'tool_failed', 'follow_up_sent')),
  agent_id text references agents (id) on delete set null,
  product_id text references agent_products (id) on delete set null,
  agent_version text,
  outcome text,
  consent_scope text not null default 'internal_only' check (consent_scope in ('disabled', 'internal_only', 'shared_anonymized')),
  trace_id text,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default current_timestamp,
  retained_until timestamptz
);

create unique index if not exists nexo_learning_events_trace_type_idx
  on nexo_learning_events (workspace_id, trace_id, event_type)
  where trace_id is not null;
create index if not exists nexo_learning_events_workspace_created_idx
  on nexo_learning_events (workspace_id, created_at desc);
create index if not exists nexo_learning_events_type_idx
  on nexo_learning_events (workspace_id, event_type, created_at desc);
