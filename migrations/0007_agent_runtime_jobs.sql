-- Durable Agent Runtime queue. The webhook only creates a job; a worker claims it later.
create table if not exists agent_runtime_jobs (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  agent_id text not null references agents (id) on delete cascade,
  conversation_id text not null references conversations (id) on delete cascade,
  inbound_message_id text not null references messages (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'dead')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default current_timestamp,
  locked_at timestamptz,
  locked_by text,
  trace_id text not null,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  completed_at timestamptz,
  unique (workspace_id, inbound_message_id)
);

create index if not exists agent_runtime_jobs_claim_idx
  on agent_runtime_jobs (status, available_at, locked_at);
create index if not exists agent_runtime_jobs_workspace_idx
  on agent_runtime_jobs (workspace_id, created_at);
