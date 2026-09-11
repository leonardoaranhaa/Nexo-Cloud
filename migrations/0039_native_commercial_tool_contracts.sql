-- Complete native commercial tool contracts and register calendar booking.
-- Outputs are validated before a conversational tool result is returned.
update tools
set output_schema = '{"type":"object","required":["created","idempotent","leadId","stage","score","changedFields"],"properties":{"created":{"type":"boolean"},"idempotent":{"type":"boolean"},"leadId":{"type":"string"},"stage":{"type":"string"},"score":{"type":"integer","minimum":0,"maximum":100},"changedFields":{"type":"array","items":{"type":"string"}}}}'::jsonb
where workspace_id is null and key in ('lead.create_or_update', 'lead.update_qualification');

update tools
set output_schema = '{"type":"object","required":["assigned","idempotent","leadId","method","reason"],"properties":{"assigned":{"type":"boolean"},"idempotent":{"type":"boolean"},"leadId":{"type":"string"},"ownerId":{"type":"string"},"method":{"type":"string","enum":["round_robin","least_loaded","manual","no_capacity"]},"reason":{"type":"string"}}}'::jsonb
where workspace_id is null and key = 'lead.assign_owner';

update tools
set output_schema = '{"type":"object","required":["id","created","idempotent","status","scheduledAt"],"properties":{"id":{"type":"string"},"created":{"type":"boolean"},"idempotent":{"type":"boolean"},"status":{"type":"string","enum":["scheduled","processing","sent","cancelled","skipped","failed"]},"scheduledAt":{"type":"string"},"reason":{"type":"string"}}}'::jsonb
where workspace_id is null and key = 'lead.create_follow_up';

update tools
set output_schema = '{"type":"object","required":["status"],"properties":{"status":{"type":"string","enum":["pending","open","closed"]}}}'::jsonb
where workspace_id is null and key = 'conversation.handoff';

insert into tools (id, workspace_id, connector_definition_id, key, name, description, risk_level, timeout_ms, input_schema, output_schema)
values (
  'tool_calendar_book_slot', null, null, 'calendar.book_slot',
  'Reservar horário',
  'Reserva um horário disponível para o contato no calendário do workspace.',
  'write', 3000,
  '{"type":"object","required":["slotId","externalContactId","idempotencyKey"],"properties":{"slotId":{"type":"string"},"externalContactId":{"type":"string","maxLength":160},"conversationId":{"type":"string"},"customerName":{"type":"string","maxLength":160},"notes":{"type":"string","maxLength":1000},"idempotencyKey":{"type":"string","maxLength":160}}}',
  '{"type":"object","required":["id","workspaceId","slotId","externalContactId","status"],"properties":{"id":{"type":"string"},"workspaceId":{"type":"string"},"slotId":{"type":"string"},"externalContactId":{"type":"string"},"status":{"type":"string","enum":["confirmed","cancelled"]}}}'
)
on conflict (id) do update set output_schema = excluded.output_schema, input_schema = excluded.input_schema, description = excluded.description, risk_level = excluded.risk_level, timeout_ms = excluded.timeout_ms;
