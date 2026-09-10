-- Internal event routing metadata and durable idempotency.
alter table workflow_events
  add column if not exists trigger_id text references workflow_triggers (id) on delete set null,
  add column if not exists idempotency_key text;
create unique index if not exists workflow_events_idempotency_idx
  on workflow_events (workspace_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists workflow_triggers_event_type_idx
  on workflow_triggers (workflow_id, type, enabled);
