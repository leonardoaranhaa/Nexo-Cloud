-- Durable continuation markers for wait and approval nodes.
alter table workflow_runs
  add column if not exists resume_requested boolean not null default false,
  add column if not exists resume_reason text;
create unique index if not exists workflow_approvals_one_pending_node_idx
  on workflow_approvals (node_run_id) where status = 'pending';
