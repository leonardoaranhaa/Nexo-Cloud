-- Native commercial CRM primitive: lead.create_or_update.
create table if not exists crm_leads (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  external_contact_id text not null,
  name text,
  email text,
  phone text,
  stage text not null default 'new' check (stage in ('new', 'engaged', 'qualifying', 'qualified', 'nurture', 'handoff_pending', 'human_active', 'converted', 'lost')),
  score integer not null default 0 check (score between 0 and 100),
  intent text,
  source text,
  qualification_data jsonb not null default '{}'::jsonb,
  last_conversation_id text references conversations (id) on delete set null,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  unique (workspace_id, external_contact_id)
);

create index if not exists crm_leads_workspace_stage_idx on crm_leads (workspace_id, stage, updated_at desc);
create index if not exists crm_leads_workspace_contact_idx on crm_leads (workspace_id, external_contact_id);

create table if not exists crm_lead_events (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  lead_id text not null references crm_leads (id) on delete cascade,
  conversation_id text references conversations (id) on delete set null,
  event_type text not null check (event_type in ('created', 'updated', 'stage_changed')),
  idempotency_key text not null,
  trace_id text,
  changed_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default current_timestamp,
  unique (workspace_id, idempotency_key)
);

create index if not exists crm_lead_events_workspace_created_idx on crm_lead_events (workspace_id, created_at desc);

insert into tools (id, workspace_id, connector_definition_id, key, name, description, risk_level, timeout_ms, input_schema)
values ('tool_crm_lead_create_or_update', null, null, 'lead.create_or_update', 'Criar ou atualizar lead', 'Persiste um lead comercial no CRM interno do workspace de forma idempotente.', 'write', 3000, '{"type":"object","required":["externalContactId"],"properties":{"externalContactId":{"type":"string","maxLength":160},"name":{"type":"string","maxLength":120},"email":{"type":"string","maxLength":160},"phone":{"type":"string","maxLength":40},"stage":{"type":"string"},"score":{"type":"integer","minimum":0,"maximum":100},"intent":{"type":"string","maxLength":80},"source":{"type":"string","maxLength":80},"qualificationData":{"type":"object"},"conversationId":{"type":"string"},"idempotencyKey":{"type":"string","maxLength":160}}}')
on conflict (id) do nothing;
