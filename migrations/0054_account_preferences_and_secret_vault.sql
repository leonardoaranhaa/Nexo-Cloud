-- Persistent account preferences and an encrypted, server-only secret vault.
-- Secret plaintext is never stored; only AES-256-GCM material is persisted.

create table if not exists user_preferences (
  user_id text primary key references "user" ("id") on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create table if not exists nexo_secret_values (
  secret_ref text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  connection_id text not null references connections (id) on delete cascade,
  ciphertext text not null,
  nonce text not null,
  auth_tag text not null,
  key_version text not null default 'v1',
  created_by text,
  updated_by text,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create index if not exists nexo_secret_values_connection_idx
  on nexo_secret_values (workspace_id, connection_id);

create or replace function nexo_secret_values_workspace_guard()
returns trigger
language plpgsql
as $$
declare
  expected_workspace text;
begin
  select workspace_id into expected_workspace
    from connections
   where id = NEW.connection_id;
  if expected_workspace is null or expected_workspace <> NEW.workspace_id then
    raise exception 'SECRET_CONNECTION_WORKSPACE_MISMATCH';
  end if;
  return NEW;
end;
$$;

drop trigger if exists nexo_secret_values_workspace_guard_trigger on nexo_secret_values;
create trigger nexo_secret_values_workspace_guard_trigger
before insert or update on nexo_secret_values
for each row execute function nexo_secret_values_workspace_guard();
