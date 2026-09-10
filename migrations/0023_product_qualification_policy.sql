-- Versioned, product-aware qualification policies and evaluations.
create table if not exists crm_qualification_policies (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  product_id text references agent_products (id) on delete restrict,
  name text not null,
  version_number integer not null default 1,
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  minimum_score integer not null default 70 check (minimum_score between 0 and 100),
  criteria jsonb not null default '[]'::jsonb,
  created_by text not null,
  created_at timestamptz not null default current_timestamp,
  published_at timestamptz,
  unique (workspace_id, product_id, version_number)
);

create unique index if not exists crm_one_published_qualification_policy_idx
  on crm_qualification_policies (workspace_id, coalesce(product_id, ''::text)) where status = 'published';

create table if not exists crm_qualification_evaluations (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  lead_id text not null references crm_leads (id) on delete cascade,
  policy_id text not null references crm_qualification_policies (id) on delete restrict,
  conversation_id text references conversations (id) on delete set null,
  trace_id text,
  ready boolean not null,
  score integer not null check (score between 0 and 100),
  missing_fields jsonb not null default '[]'::jsonb,
  results jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default current_timestamp
);

create index if not exists crm_qualification_evaluations_workspace_idx on crm_qualification_evaluations (workspace_id, lead_id, created_at desc);

insert into tools (id, workspace_id, connector_definition_id, key, name, description, risk_level, timeout_ms, input_schema)
values ('tool_crm_lead_evaluate_qualification', null, null, 'lead.evaluate_qualification', 'Avaliar qualificação do lead', 'Avalia critérios publicados do produto e determina se o lead está pronto.', 'write', 3000, '{"type":"object","required":["externalContactId"],"properties":{"externalContactId":{"type":"string"},"conversationId":{"type":"string"},"agentId":{"type":"string"}}}')
on conflict (id) do nothing;
