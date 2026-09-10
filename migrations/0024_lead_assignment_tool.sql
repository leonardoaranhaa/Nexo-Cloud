-- Automatic owner assignment for qualified leads.
alter table crm_leads add column if not exists owner_id text;

create table if not exists crm_assignment_rules (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  product_id text references agent_products (id) on delete restrict,
  name text not null,
  mode text not null default 'round_robin' check (mode in ('round_robin', 'least_loaded')),
  owner_ids jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  created_by text not null,
  created_at timestamptz not null default current_timestamp,
  published_at timestamptz
);

create unique index if not exists crm_one_published_assignment_rule_idx
  on crm_assignment_rules (workspace_id, coalesce(product_id, ''::text)) where status = 'published';

create table if not exists crm_lead_assignments (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  lead_id text not null references crm_leads (id) on delete cascade,
  conversation_id text references conversations (id) on delete set null,
  previous_owner_id text,
  owner_id text,
  method text not null check (method in ('round_robin', 'least_loaded', 'manual', 'no_capacity')),
  idempotency_key text not null,
  trace_id text,
  reason text,
  created_at timestamptz not null default current_timestamp,
  unique (workspace_id, idempotency_key)
);

create index if not exists crm_lead_assignments_workspace_idx on crm_lead_assignments (workspace_id, created_at desc);
create index if not exists crm_leads_owner_idx on crm_leads (workspace_id, owner_id, updated_at desc);

insert into tools (id, workspace_id, connector_definition_id, key, name, description, risk_level, timeout_ms, input_schema)
values ('tool_crm_lead_assign_owner', null, null, 'lead.assign_owner', 'Atribuir responsável ao lead', 'Distribui leads qualificados para operadores elegíveis do workspace.', 'write', 3000, '{"type":"object","required":["externalContactId","idempotencyKey"],"properties":{"externalContactId":{"type":"string"},"conversationId":{"type":"string"},"ownerId":{"type":"string"},"productId":{"type":"string"},"idempotencyKey":{"type":"string","maxLength":160}}}')
on conflict (id) do nothing;
