-- Structured commercial decision protocol for the Agent Runtime.
alter table conversations add column if not exists commercial_state text not null default 'new';
alter table conversations add column if not exists lead_data jsonb not null default '{}'::jsonb;
alter table conversations add column if not exists last_intent text;

create table if not exists agent_runtime_decisions (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  job_id text not null references agent_runtime_jobs (id) on delete cascade,
  conversation_id text not null references conversations (id) on delete cascade,
  agent_id text not null references agents (id) on delete cascade,
  trace_id text not null,
  intent text not null,
  confidence numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
  risk text not null check (risk in ('low', 'medium', 'high')),
  answer_mode text not null check (answer_mode in ('faq', 'answer_with_evidence', 'ask', 'handoff', 'fallback', 'no_reply')),
  next_action text not null check (next_action in ('respond', 'ask', 'handoff', 'update_lead', 'no_reply')),
  commercial_state text not null,
  evidence jsonb not null default '[]'::jsonb,
  requested_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default current_timestamp,
  unique (job_id)
);

create index if not exists agent_runtime_decisions_workspace_idx
  on agent_runtime_decisions (workspace_id, created_at desc);
create index if not exists agent_runtime_decisions_conversation_idx
  on agent_runtime_decisions (workspace_id, conversation_id, created_at desc);
