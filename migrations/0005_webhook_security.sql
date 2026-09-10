-- Per-connection webhook authentication reference.
-- The JWT/custom-header secret value remains exclusively in Secrets Manager.
alter table connections
  add column if not exists webhook_secret_ref text,
  add column if not exists last_event_at timestamptz;

update connections
set webhook_secret_ref = 'nexo/' || workspace_id || '/' || id || '/webhook_jwt'
where webhook_secret_ref is null;

create index if not exists connections_webhook_secret_idx
  on connections (workspace_id, webhook_secret_ref)
  where webhook_secret_ref is not null;
