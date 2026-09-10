-- Native CRM and conversation operations exposed through the authorized tool registry.
insert into tools (id, workspace_id, connector_definition_id, key, name, description, risk_level, timeout_ms, input_schema)
values ('tool_crm_lead_update_qualification', null, null, 'lead.update_qualification', 'Atualizar qualificacao do lead', 'Registra campos de qualificacao confirmados sem sobrescrever dados protegidos.', 'write', 3000, '{"type":"object","required":["externalContactId","qualificationData","idempotencyKey"],"properties":{"externalContactId":{"type":"string"},"conversationId":{"type":"string"},"qualificationData":{"type":"object"},"confirmedFields":{"type":"array","items":{"type":"string"}},"stage":{"type":"string"},"score":{"type":"integer"},"idempotencyKey":{"type":"string","maxLength":160}}}')
on conflict (id) do nothing;

insert into tools (id, workspace_id, connector_definition_id, key, name, description, risk_level, timeout_ms, input_schema)
values ('tool_conversation_handoff', null, null, 'conversation.handoff', 'Transferir conversa para humano', 'Atualiza o estado de handoff da conversa dentro do workspace.', 'write', 3000, '{"type":"object","required":["conversationId","action"],"properties":{"conversationId":{"type":"string"},"action":{"type":"string","enum":["assign","release","resume","close"]},"reason":{"type":"string","maxLength":500}}}')
on conflict (id) do nothing;
