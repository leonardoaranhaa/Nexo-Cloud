-- Correlate Nexo Bot conversations and confirmed actions with the same operational trace.
alter table nexo_bot_audit_events
  add column if not exists trace_id text;

create index if not exists nexo_bot_audit_workspace_trace_idx
  on nexo_bot_audit_events (workspace_id, trace_id, created_at desc);
