-- Messaging and outbound delivery records.
-- Message content is application data; connector secrets remain in Secrets Manager.
create table if not exists conversations (
  id text primary key,
  workspace_id text not null references workspaces (id),
  agent_id text not null references agents (id),
  connection_id text not null references connections (id),
  external_contact_id text not null,
  channel text not null default 'whatsapp',
  status text not null default 'open'
    check (status in ('open', 'closed', 'pending')),
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create table if not exists messages (
  id text primary key,
  workspace_id text not null references workspaces (id),
  conversation_id text not null references conversations (id),
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_type text not null check (sender_type in ('contact', 'agent', 'user', 'workflow', 'system')),
  external_message_id text,
  idempotency_key text,
  content jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('received', 'queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'unknown')),
  error_code text,
  error_message text,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create table if not exists message_deliveries (
  id text primary key,
  workspace_id text not null references workspaces (id),
  message_id text not null references messages (id),
  connection_id text not null references connections (id),
  provider text not null,
  provider_message_id text,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'unknown')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  idempotency_key text not null,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  sent_at timestamptz
);

create unique index if not exists messages_workspace_idempotency_idx
  on messages (workspace_id, idempotency_key)
  where idempotency_key is not null;
create unique index if not exists conversations_open_route_idx
  on conversations (workspace_id, agent_id, connection_id, external_contact_id)
  where status = 'open';
create unique index if not exists deliveries_workspace_idempotency_idx
  on message_deliveries (workspace_id, idempotency_key);
create unique index if not exists messages_workspace_external_idx
  on messages (workspace_id, external_message_id)
  where external_message_id is not null;
create index if not exists conversations_workspace_created_idx
  on conversations (workspace_id, created_at);
create index if not exists messages_conversation_created_idx
  on messages (conversation_id, created_at);
create index if not exists deliveries_status_retry_idx
  on message_deliveries (status, next_attempt_at);
create index if not exists deliveries_provider_message_idx
  on message_deliveries (workspace_id, provider_message_id)
  where provider_message_id is not null;
