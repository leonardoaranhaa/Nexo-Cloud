-- Meta webhook verification secrets. Values remain exclusively in the secret provider.
alter table connections
  add column if not exists meta_app_secret_ref text,
  add column if not exists meta_verify_token_ref text;

create index if not exists connections_meta_webhook_secret_idx
  on connections (workspace_id, meta_app_secret_ref, meta_verify_token_ref)
  where meta_app_secret_ref is not null or meta_verify_token_ref is not null;
