-- Durable queue metadata for workflow runs.
alter table workflow_runs
  add column if not exists claimed_by text,
  add column if not exists lease_until timestamptz,
  add column if not exists next_attempt_at timestamptz not null default current_timestamp,
  add column if not exists max_attempts integer not null default 3 check (max_attempts > 0),
  add column if not exists last_error_at timestamptz;
create index if not exists workflow_runs_queue_idx
  on workflow_runs (status, next_attempt_at, created_at)
  where status in ('queued', 'running');
create index if not exists workflow_runs_lease_idx
  on workflow_runs (lease_until)
  where status = 'running';
