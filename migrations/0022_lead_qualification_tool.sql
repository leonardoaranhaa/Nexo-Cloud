-- Progressive lead qualification updates.
alter table crm_lead_events drop constraint if exists crm_lead_events_event_type_check;
alter table crm_lead_events add constraint crm_lead_events_event_type_check check (event_type in ('created', 'updated', 'stage_changed', 'qualification_updated'));

insert into tools (id, workspace_id, connector_definition_id, key, name, description, risk_level, timeout_ms, input_schema)
values ('tool_crm_lead_update_qualification', null, null, 'lead.update_qualification', 'Atualizar qualificação do lead', 'Acumula critérios comerciais confirmados sem sobrescrever dados protegidos.', 'write', 3000, '{"type":"object","required":["externalContactId","qualificationData","idempotencyKey"],"properties":{"externalContactId":{"type":"string","maxLength":160},"qualificationData":{"type":"object","maxProperties":20},"confirmedFields":{"type":"array","maxItems":20},"conversationId":{"type":"string"},"idempotencyKey":{"type":"string","maxLength":160}}}')
on conflict (id) do nothing;
