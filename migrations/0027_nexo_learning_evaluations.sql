-- Deterministic evaluation results for sanitized Nexo Learning events.
create table if not exists nexo_learning_evaluations (
  id text primary key,
  event_id text not null references nexo_learning_events (id) on delete cascade,
  workspace_id text not null references workspaces (id) on delete cascade,
  agent_id text references agents (id) on delete set null,
  product_id text references agent_products (id) on delete set null,
  groundedness_score numeric(5,4) not null check (groundedness_score between 0 and 1),
  decision_score numeric(5,4) not null check (decision_score between 0 and 1),
  tool_score numeric(5,4) not null check (tool_score between 0 and 1),
  handoff_score numeric(5,4) not null check (handoff_score between 0 and 1),
  conversion_score numeric(5,4) not null check (conversion_score between 0 and 1),
  overall_score numeric(5,4) not null check (overall_score between 0 and 1),
  status text not null check (status in ('eligible', 'review', 'rejected')),
  critical_failure boolean not null default false,
  reasons jsonb not null default '[]'::jsonb,
  evaluated_at timestamptz not null default current_timestamp,
  unique (event_id)
);

create index if not exists nexo_learning_evaluations_workspace_idx
  on nexo_learning_evaluations (workspace_id, evaluated_at desc);
create index if not exists nexo_learning_evaluations_gate_idx
  on nexo_learning_evaluations (workspace_id, status, overall_score desc);
