-- Conversation operations for the local inbox and Agent Runtime handoff.
alter table conversations
  add column if not exists assigned_to text,
  add column if not exists handoff_reason text,
  add column if not exists handoff_at timestamptz,
  add column if not exists closed_at timestamptz;

create index if not exists conversations_workspace_status_updated_idx
  on conversations (workspace_id, status, updated_at desc);
create index if not exists conversations_workspace_assignee_idx
  on conversations (workspace_id, assigned_to)
  where assigned_to is not null;
