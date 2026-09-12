-- Configurable error workflow for failed terminal executions.
alter table workflows
  add column if not exists error_workflow_id text references workflows (id) on delete set null;

create index if not exists workflows_error_workflow_idx
  on workflows (error_workflow_id)
  where error_workflow_id is not null;
