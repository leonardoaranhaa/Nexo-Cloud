-- Structured engineering cases and lexical chunks for the internal Learning RAG.
create table if not exists nexo_learning_cases (
  id text primary key,
  event_id text not null references nexo_learning_events (id) on delete cascade,
  evaluation_id text not null references nexo_learning_evaluations (id) on delete cascade,
  workspace_id text not null references workspaces (id) on delete cascade,
  agent_id text references agents (id) on delete set null,
  product_id text references agent_products (id) on delete set null,
  case_type text not null check (case_type in ('success_case', 'failure_case', 'regression_case', 'conversion_success', 'handoff_case', 'tool_failure')),
  status text not null default 'draft' check (status in ('draft', 'indexed', 'review', 'archived')),
  visibility_scope text not null default 'internal_only' check (visibility_scope in ('internal_only', 'shared_anonymized')),
  title text not null,
  summary text not null,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default current_timestamp,
  indexed_at timestamptz,
  unique (event_id)
);

create table if not exists nexo_learning_chunks (
  id text primary key,
  case_id text not null references nexo_learning_cases (id) on delete cascade,
  workspace_id text not null references workspaces (id) on delete cascade,
  ordinal integer not null default 0,
  heading text not null default '',
  content text not null,
  lexical_text text not null,
  status text not null default 'published' check (status in ('draft', 'published', 'retired')),
  created_at timestamptz not null default current_timestamp,
  unique (case_id, ordinal)
);

create index if not exists nexo_learning_cases_gate_idx
  on nexo_learning_cases (workspace_id, status, case_type, created_at desc);
create index if not exists nexo_learning_chunks_search_idx
  on nexo_learning_chunks (workspace_id, status);
