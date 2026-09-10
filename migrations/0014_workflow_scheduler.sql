-- Durable schedule cursor and claim metadata.
alter table workflow_triggers
  add column if not exists next_run_at timestamptz,
  add column if not exists last_fired_at timestamptz,
  add column if not exists schedule_claimed_by text,
  add column if not exists schedule_lease_until timestamptz;
create index if not exists workflow_triggers_schedule_due_idx
  on workflow_triggers (next_run_at)
  where type = 'schedule' and enabled = true;
