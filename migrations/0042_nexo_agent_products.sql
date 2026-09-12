-- Nexo-owned agent products for the internal Marketplace.
-- Manifests describe capabilities and prerequisites; execution remains governed by the Tool Gateway.

update agent_product_versions
set manifest = '{
  "agentType": "support",
  "name": "Nexo Atendimento + Qualificação",
  "persona": "Atendente consultivo, objetivo e acolhedor.",
  "welcomeMessage": "Olá! Como posso ajudar você hoje?",
  "systemPrompt": "Atenda com clareza, use somente o conhecimento publicado, qualifique a necessidade quando houver intenção comercial e encaminhe para uma pessoa quando necessário.",
  "language": "pt",
  "modelProvider": "xai",
  "modelName": "grok-4.5",
  "temperature": 0.35,
  "maxTokens": 420,
  "memoryWindow": 12,
  "capabilities": [
    "Responder dúvidas usando conhecimento publicado",
    "Qualificar a necessidade do contato",
    "Registrar ou atualizar o lead no CRM",
    "Transferir a conversa para um operador",
    "Respeitar janela de atendimento"
  ],
  "objectives": [
    "Resolver dúvidas com resposta baseada em evidência",
    "Identificar oportunidade comercial sem pressionar o contato",
    "Preservar continuidade quando houver handoff"
  ],
  "guardrails": [
    "Não inventar preço, estoque, prazo ou política",
    "Não afirmar que uma ação externa foi concluída sem confirmação",
    "Transferir quando o contato pedir uma pessoa ou houver baixa confiança"
  ],
  "supportedConnectors": ["meta", "evolution"],
  "requiredTools": ["lead.create_or_update", "lead.update_qualification", "conversation.handoff"],
  "editableFields": ["name", "persona", "welcomeMessage", "language", "knowledge", "metadata"],
  "protectedComponents": ["systemPrompt", "tools", "workflows"],
  "riskLevel": "medium"
}'::jsonb,
    changelog = 'Manifesto operacional de Atendimento com CRM, handoff, conhecimento e canais Meta ou Evolution.'
where id = 'nexo-product-atendimento-leads-v1'
  and product_id = 'nexo-product-atendimento-leads';

insert into agent_products (id, slug, name, description, category, provider_type, status, risk_level)
values (
  'nexo-product-vendas-conversao',
  'nexo-vendas-conversao',
  'Nexo Vendas + Conversão',
  'Agente comercial pronto para descobrir intenção, qualificar leads, distribuir oportunidades, criar follow-ups e conduzir agendamentos com aprovação operacional.',
  'vendas-conversao',
  'nexo',
  'published',
  'medium'
)
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  provider_type = excluded.provider_type,
  status = excluded.status,
  risk_level = excluded.risk_level,
  updated_at = current_timestamp;

insert into agent_product_versions (id, product_id, version_number, status, manifest, changelog)
values (
  'nexo-product-vendas-conversao-v1',
  'nexo-product-vendas-conversao',
  1,
  'published',
  '{
    "agentType": "sales",
    "name": "Nexo Vendas + Conversão",
    "persona": "Consultor comercial consultivo, claro e orientado a próximo passo.",
    "welcomeMessage": "Olá! Posso entender o que você procura e indicar o melhor próximo passo.",
    "systemPrompt": "Conduza uma conversa comercial consultiva. Faça uma pergunta por vez, registre critérios confirmados, não invente disponibilidade e proponha um humano ou agendamento somente quando houver contexto suficiente.",
    "language": "pt",
    "modelProvider": "xai",
    "modelName": "grok-4.5",
    "temperature": 0.3,
    "maxTokens": 460,
    "memoryWindow": 16,
    "capabilities": [
      "Identificar intenção de compra ou contratação",
      "Coletar necessidade, orçamento, prazo e contexto",
      "Criar ou atualizar lead no CRM",
      "Atualizar qualificação progressivamente",
      "Atribuir lead a responsável elegível",
      "Criar cadência de follow-up",
      "Consultar disponibilidade e reservar horário",
      "Transferir para um consultor humano"
    ],
    "objectives": [
      "Aumentar a qualidade dos leads sem aumentar fricção",
      "Levar oportunidades qualificadas ao próximo passo mensurável",
      "Preservar rastreabilidade de decisão, responsável e follow-up"
    ],
    "guardrails": [
      "Fazer uma pergunta por vez e não despejar catálogo",
      "Não prometer preço, disponibilidade, desconto ou prazo sem evidência",
      "Exigir aprovação quando a política do workspace determinar",
      "Transferir para humano diante de pedido explícito ou incerteza relevante"
    ],
    "supportedConnectors": ["meta", "evolution"],
    "requiredTools": [
      "lead.create_or_update",
      "lead.update_qualification",
      "lead.assign_owner",
      "lead.create_follow_up",
      "calendar.list_availability",
      "calendar.book_slot",
      "conversation.handoff"
    ],
    "approvalRequiredTools": ["lead.assign_owner", "lead.create_follow_up", "calendar.book_slot"],
    "editableFields": ["name", "persona", "welcomeMessage", "language", "knowledge", "metadata"],
    "protectedComponents": ["systemPrompt", "tools", "workflows"],
    "riskLevel": "medium"
  }'::jsonb,
  'Primeira versão interna do agente de vendas com CRM, agenda, follow-up e handoff.'
)
on conflict (id) do update set
  product_id = excluded.product_id,
  version_number = excluded.version_number,
  status = excluded.status,
  manifest = excluded.manifest,
  changelog = excluded.changelog;

insert into agent_product_offers (id, product_id, version_id, mode, status, price_cents, currency)
values (
  'nexo-product-vendas-conversao-trial',
  'nexo-product-vendas-conversao',
  'nexo-product-vendas-conversao-v1',
  'trial',
  'active',
  0,
  'BRL'
)
on conflict (id) do update set
  product_id = excluded.product_id,
  version_id = excluded.version_id,
  mode = excluded.mode,
  status = excluded.status,
  price_cents = excluded.price_cents,
  currency = excluded.currency;
