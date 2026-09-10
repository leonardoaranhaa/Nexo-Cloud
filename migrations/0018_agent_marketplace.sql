-- Internal agent marketplace: catalog products, immutable versions and workspace installations.
create table if not exists agent_products (
  id text primary key,
  slug text not null unique,
  name text not null,
  description text not null default '',
  category text not null,
  provider_type text not null default 'nexo' check (provider_type in ('nexo', 'partner')),
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high')),
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create table if not exists agent_product_versions (
  id text primary key,
  product_id text not null references agent_products (id) on delete cascade,
  version_number integer not null,
  status text not null default 'published' check (status in ('draft', 'published', 'retired')),
  manifest jsonb not null,
  changelog text not null default '',
  created_at timestamptz not null default current_timestamp,
  unique (product_id, version_number)
);

create unique index if not exists agent_product_one_published_version_idx
  on agent_product_versions (product_id) where status = 'published';

create table if not exists agent_product_offers (
  id text primary key,
  product_id text not null references agent_products (id) on delete cascade,
  version_id text not null references agent_product_versions (id) on delete cascade,
  mode text not null check (mode in ('trial', 'subscription', 'license', 'rental')),
  status text not null default 'active' check (status in ('active', 'paused', 'retired')),
  price_cents integer not null default 0,
  currency text not null default 'BRL',
  created_at timestamptz not null default current_timestamp
);

create table if not exists agent_entitlements (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  product_id text not null references agent_products (id) on delete restrict,
  offer_id text not null references agent_product_offers (id) on delete restrict,
  mode text not null check (mode in ('trial', 'subscription', 'license', 'rental', 'internal')),
  status text not null default 'active' check (status in ('pending', 'active', 'expired', 'suspended', 'cancelled')),
  starts_at timestamptz not null default current_timestamp,
  ends_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default current_timestamp
);

create index if not exists agent_entitlements_workspace_idx on agent_entitlements (workspace_id, status);

create table if not exists agent_installations (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  product_id text not null references agent_products (id) on delete restrict,
  version_id text not null references agent_product_versions (id) on delete restrict,
  entitlement_id text not null references agent_entitlements (id) on delete restrict,
  agent_id text not null references agents (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'staging', 'active', 'paused', 'uninstalled')),
  customizations jsonb not null default '{}'::jsonb,
  created_by text not null,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  unique (workspace_id, product_id, agent_id)
);

create index if not exists agent_installations_workspace_idx on agent_installations (workspace_id, status);

insert into agent_products (id, slug, name, description, category, provider_type, status, risk_level)
values ('nexo-product-atendimento-leads', 'nexo-atendimento-leads', 'Nexo Atendimento + Qualificação', 'Agente pronto para atender dúvidas, qualificar leads e encaminhar conversas para operadores.', 'atendimento-vendas', 'nexo', 'published', 'medium')
on conflict (id) do nothing;

insert into agent_product_versions (id, product_id, version_number, status, manifest, changelog)
values ('nexo-product-atendimento-leads-v1', 'nexo-product-atendimento-leads', 1, 'published', '{"agentType":"support","name":"Nexo Atendimento + Qualificação","persona":"Atendente consultivo e objetivo.","welcomeMessage":"Olá! Como posso ajudar?","systemPrompt":"Atenda com clareza, qualifique a necessidade e encaminhe para um operador quando necessário.","language":"pt","editableFields":["name","persona","welcomeMessage","language","knowledge","metadata"],"protectedComponents":["systemPrompt","tools","workflows"],"requiredConnectors":["meta"],"requiredTools":[],"riskLevel":"medium"}'::jsonb, 'Primeira versão interna do agente de atendimento e qualificação.')
on conflict (id) do nothing;

insert into agent_product_offers (id, product_id, version_id, mode, status, price_cents, currency)
values ('nexo-product-atendimento-leads-trial', 'nexo-product-atendimento-leads', 'nexo-product-atendimento-leads-v1', 'trial', 'active', 0, 'BRL')
on conflict (id) do nothing;
