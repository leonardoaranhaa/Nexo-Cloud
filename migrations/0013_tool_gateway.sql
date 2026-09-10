-- Tool Gateway registry and execution audit.
create table if not exists tools (
  id text primary key,
  workspace_id text references workspaces (id) on delete cascade,
  connector_definition_id text references connector_definitions (id),
  key text not null,
  name text not null,
  description text not null default '',
  input_schema jsonb not null default '{}'::jsonb,
  risk_level text not null default 'read' check (risk_level in ('read', 'write', 'destructive')),
  timeout_ms integer not null default 10000,
  max_retries integer not null default 1,
  status text not null default 'active' check (status in ('active', 'disabled', 'review')),
  version integer not null default 1,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);
create unique index if not exists tools_scope_key_idx on tools (coalesce(workspace_id, ''), key, version);
insert into tools (id, workspace_id, connector_definition_id, key, name, description, risk_level, input_schema)
values ('tool_evolution_send_text', null, 'connector_def_evolution', 'evolution.send_text', 'Enviar texto via Evolution', 'Envia uma mensagem de texto por uma conexão Evolution autorizada.', 'write', '{"type":"object","required":["connectionId","recipient","text"]}')
on conflict (id) do nothing;

create table if not exists agent_tool_permissions (
  id text primary key,
  agent_version_id text not null references agent_versions (id) on delete cascade,
  tool_id text not null references tools (id) on delete cascade,
  enabled boolean not null default true,
  require_approval boolean not null default false,
  allowed_scopes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default current_timestamp,
  unique (agent_version_id, tool_id)
);

create table if not exists tool_executions (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  run_id text references workflow_runs (id) on delete set null,
  tool_id text not null references tools (id),
  connector_instance_id text references connections (id),
  requested_by text not null check (requested_by in ('model', 'workflow', 'user', 'system')),
  status text not null check (status in ('requested', 'approved', 'running', 'succeeded', 'failed', 'denied')),
  input_hash text not null,
  input_redacted jsonb not null default '{}'::jsonb,
  output_redacted jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  latency_ms integer,
  provider_request_id text,
  created_at timestamptz not null default current_timestamp,
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists tool_executions_workspace_idx on tool_executions (workspace_id, created_at desc);
