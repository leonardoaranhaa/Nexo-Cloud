-- Durable CRM follow-ups with scheduler-compatible states.
create table if not exists crm_follow_up_cadences (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  name text not null,
  max_steps integer not null default 3 check (max_steps between 1 and 20),
  interval_minutes integer not null default 1440 check (interval_minutes between 5 and 43200),
  stop_on_reply boolean not null default true,
  stop_on_conversion boolean not null default true,
  status text not null default 'active' check (status in ('draft', 'active', 'paused', 'retired')),
  created_by text not null,
  created_at timestamptz not null default current_timestamp
);

create table if not exists crm_follow_ups (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  lead_id text not null references crm_leads (id) on delete cascade,
  conversation_id text references conversations (id) on delete set null,
  agent_id text not null references agents (id) on delete cascade,
  connection_id text not null references connections (id) on delete restrict,
  cadence_id text references crm_follow_up_cadences (id) on delete set null,
  external_contact_id text not null,
  message text not null,
  step_number integer not null default 1 check (step_number between 1 and 20),
  scheduled_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'processing', 'sent', 'cancelled', 'skipped', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  last_error text,
  cancellation_reason text,
  idempotency_key text not null,
  trace_id text,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  sent_at timestamptz,
  unique (workspace_id, idempotency_key)
);

create index if not exists crm_follow_ups_due_idx on crm_follow_ups (status, scheduled_at);
create index if not exists crm_follow_ups_workspace_idx on crm_follow_ups (workspace_id, status, scheduled_at);

insert into tools (id, workspace_id, connector_definition_id, key, name, description, risk_level, timeout_ms, input_schema)
values ('tool_crm_lead_create_follow_up', null, null, 'lead.create_follow_up', 'Criar follow-up do lead', 'Agenda uma etapa de acompanhamento comercial com cancelamento e retry.', 'write', 3000, '{"type":"object","required":["externalContactId","message","scheduledAt","idempotencyKey"],"properties":{"externalContactId":{"type":"string"},"conversationId":{"type":"string"},"agentId":{"type":"string"},"connectionId":{"type":"string"},"message":{"type":"string","maxLength":4096},"scheduledAt":{"type":"string"},"stepNumber":{"type":"integer"},"cadenceId":{"type":"string"},"idempotencyKey":{"type":"string","maxLength":160}}}')
on conflict (id) do nothing;
