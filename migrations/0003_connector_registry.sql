-- Connector registry and secret references.
-- Secret values never belong in this schema: only an opaque secret_ref is stored.

create table if not exists connector_definitions (
  id text primary key,
  key text not null unique,
  name text not null,
  kind text not null default 'native_api'
    check (kind in ('native_api', 'mcp', 'webhook')),
  provider text not null,
  version text not null default '1.0.0',
  capabilities jsonb not null default '{}'::jsonb,
  status text not null default 'active'
    check (status in ('active', 'disabled', 'review')),
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

insert into connector_definitions (id, key, name, kind, provider, capabilities)
values
  ('connector_def_evolution', 'whatsapp_evolution', 'WhatsApp · Evolution API', 'native_api', 'evolution', '{"healthcheck":true,"webhook":true,"qr":true}'),
  ('connector_def_meta', 'whatsapp_meta', 'WhatsApp · Meta Cloud API', 'native_api', 'meta', '{"healthcheck":true,"webhook":true,"templates":true}'),
  ('connector_def_zapi', 'whatsapp_zapi', 'WhatsApp · Z-API', 'native_api', 'zapi', '{"healthcheck":true,"webhook":true,"qr":true}'),
  ('connector_def_mcp_generic', 'mcp_generic', 'MCP Server genérico', 'mcp', 'mcp', '{"discovery":true,"tool_execution":true}')
on conflict (key) do nothing;

alter table connections
  add column if not exists connector_definition_id text references connector_definitions (id),
  add column if not exists secret_ref text,
  add column if not exists scopes jsonb not null default '{}'::jsonb,
  add column if not exists health_status text not null default 'unknown'
    check (health_status in ('unknown', 'healthy', 'degraded', 'unhealthy')),
  add column if not exists health_error text;

update connections c
set connector_definition_id = d.id
from connector_definitions d
where c.connector_definition_id is null
  and d.provider = c.provider;

create index if not exists connections_workspace_health_idx
  on connections (workspace_id, health_status);

create index if not exists connections_definition_idx
  on connections (connector_definition_id);
