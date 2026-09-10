-- Sanitized execution observability for the Agent Runtime.
create table if not exists agent_runtime_execution_logs (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  job_id text not null references agent_runtime_jobs (id) on delete cascade,
  agent_id text not null references agents (id) on delete cascade,
  conversation_id text not null references conversations (id) on delete cascade,
  inbound_message_id text not null references messages (id) on delete cascade,
  trace_id text not null,
  attempt_count integer not null check (attempt_count > 0),
  status text not null check (status in ('running', 'succeeded', 'failed', 'skipped')),
  reason text,
  ai_provider text,
  model_name text,
  duration_ms integer,
  history_count integer not null default 0,
  input_chars integer not null default 0,
  output_chars integer not null default 0,
  error_code text,
  error_message text,
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default current_timestamp,
  completed_at timestamptz,
  unique (job_id, attempt_count)
);

create index if not exists agent_runtime_execution_workspace_created_idx
  on agent_runtime_execution_logs (workspace_id, created_at desc);
create index if not exists agent_runtime_execution_status_idx
  on agent_runtime_execution_logs (workspace_id, status, created_at desc);
