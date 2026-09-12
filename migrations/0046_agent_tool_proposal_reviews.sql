-- Governed, auditable review decisions for blueprint-generated tool proposals.
create table if not exists agent_tool_proposal_reviews (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  proposal_id text not null references agent_tool_proposals (id) on delete cascade,
  decision text not null check (decision in ('approved', 'rejected')),
  reviewer_id text not null,
  reason text not null default '',
  created_at timestamptz not null default current_timestamp
);

create index if not exists agent_tool_proposal_reviews_workspace_idx
  on agent_tool_proposal_reviews (workspace_id, proposal_id, created_at desc);

create unique index if not exists agent_tool_proposal_reviews_approved_idx
  on agent_tool_proposal_reviews (proposal_id) where decision = 'approved';
