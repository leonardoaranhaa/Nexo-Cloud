-- Versioned, reviewable agent improvement candidates.
create table if not exists nexo_agent_improvement_candidates (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  agent_id text references agents (id) on delete set null,
  product_id text references agent_products (id) on delete set null,
  based_on_version_id text references agent_versions (id) on delete set null,
  candidate_type text not null check (candidate_type in ('prompt', 'policy', 'manifest', 'cadence')),
  status text not null default 'review' check (status in ('draft', 'review', 'approved', 'rejected', 'applied')),
  title text not null,
  rationale text not null,
  proposed_change jsonb not null default '{}'::jsonb,
  baseline_snapshot jsonb not null default '{}'::jsonb,
  created_by text not null,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default current_timestamp,
  unique (workspace_id, agent_id, candidate_type, title)
);

create table if not exists nexo_agent_improvement_sources (
  candidate_id text not null references nexo_agent_improvement_candidates (id) on delete cascade,
  case_id text not null references nexo_learning_cases (id) on delete cascade,
  chunk_id text references nexo_learning_chunks (id) on delete set null,
  primary key (candidate_id, case_id)
);

create index if not exists nexo_improvement_candidates_workspace_idx
  on nexo_agent_improvement_candidates (workspace_id, status, created_at desc);
create index if not exists nexo_improvement_sources_case_idx
  on nexo_agent_improvement_sources (case_id);
