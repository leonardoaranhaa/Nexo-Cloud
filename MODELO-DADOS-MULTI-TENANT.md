# Modelo de dados inicial — organizações, workspaces e agentes multi-tenant

## 1. Objetivo

O banco precisa suportar várias empresas usando a mesma aplicação, sem misturar dados entre clientes. A hierarquia inicial recomendada é:

```text
Usuário
  └── Organização
        └── Workspace
              ├── Agentes
              ├── Conexões
              ├── Conversas
              ├── Ferramentas autorizadas
              └── Eventos e métricas
```

A regra central é:

> Todo recurso de negócio deve pertencer a um `workspace_id`, e todo workspace deve pertencer a uma `organization_id`.

O frontend nunca deve decidir sozinho a organização ou o workspace que serão consultados. O backend deve obter o usuário autenticado, validar sua associação ao workspace e só então executar a query.

## 2. Decisões recomendadas para a primeira versão

| Decisão | Recomendação |
|---|---|
| Banco | PostgreSQL/Neon, aproveitando `src/lib/db.ts` |
| Identificador de usuário | `text`, compatível com o Better Auth já preparado |
| Identificadores de domínio | `text` com UUID/ULID gerado no servidor |
| Isolamento | `workspace_id` obrigatório em todos os recursos de negócio |
| Hierarquia | Organização → workspace → recurso |
| Multi-tenancy | Shared database/shared schema, com isolamento lógico rigoroso |
| Autorização | Memberships + checagem server-side em toda operação |
| RLS | Pode ser adicionada depois; não substitui autorização da aplicação no MVP |
| Exclusão | Soft delete para organizações, workspaces e agentes |
| Versionamento | Agentes editáveis separados de versões publicadas imutáveis |
| Segredos | Nunca armazenar tokens diretamente em tabelas públicas de configuração |

## 3. Entidades principais

### 3.1 `organizations`

Representa a empresa, cliente ou conta contratante. É a unidade de propriedade, faturamento e governança.

Campos principais:

- `id`;
- `name`;
- `slug`;
- `status`;
- `created_by`;
- `created_at`;
- `updated_at`;
- `deleted_at`.

### 3.2 `workspaces`

Representa um ambiente dentro da organização. Inicialmente podem existir `development` e `production`, mas a tabela deve permitir outros ambientes no futuro.

Campos principais:

- `id`;
- `organization_id`;
- `name`;
- `slug`;
- `environment`;
- `status`;
- `created_by`;
- timestamps;
- `deleted_at`.

A combinação `organization_id + slug` deve ser única. O mesmo slug pode existir em organizações diferentes.

### 3.3 `organization_memberships`

Define quem pertence à organização e qual é seu papel global.

Papéis iniciais:

- `owner`: controle total e faturamento;
- `admin`: administração da organização e workspaces;
- `member`: acesso operacional conforme os workspaces;
- `billing`: acesso financeiro, sem necessariamente operar agentes.

### 3.4 `workspace_memberships`

Define o que cada membro pode fazer dentro de um workspace específico.

Papéis iniciais:

- `workspace_admin`;
- `builder`: cria e edita agentes;
- `operator`: opera conversas e publicações autorizadas;
- `analyst`: consulta dados e métricas;
- `viewer`: somente leitura.

A separação entre membership da organização e membership do workspace evita conceder acesso total a todos os ambientes automaticamente.

### 3.5 `agents`

Representa o agente editável. Deve armazenar configuração de negócio, não apenas um prompt solto.

Campos principais:

- identidade e nome;
- `workspace_id`;
- `status`;
- `agent_type`;
- persona;
- mensagem de boas-vindas;
- idioma;
- configuração de modelo;
- regras de memória;
- regras de horário;
- configuração de handoff;
- metadata JSONB para extensões não críticas;
- `created_by`, `updated_by`;
- timestamps;
- `deleted_at`.

O agente editável não deve ser usado diretamente para processar mensagens em produção. O runtime deve executar uma versão publicada e imutável.

### 3.6 `agent_versions`

Representa um snapshot de agente pronto para execução.

Cada publicação cria uma nova versão. Isso permite:

- rollback;
- auditoria;
- comparação entre versões;
- teste antes de produção;
- rastreamento da versão que respondeu uma mensagem.

Campos principais:

- `agent_id`;
- `version_number`;
- `status`;
- `config` JSONB com snapshot completo;
- `published_by`;
- `published_at`;
- `retired_at`.

### 3.7 `connections`

Representa a ligação de um workspace a um provedor externo, como Meta Cloud API, Evolution ou Z-API.

A conexão deve armazenar apenas identificadores e configuração não sensível. Tokens devem ficar em um secret manager ou em uma referência segura a segredo.

Campos principais:

- `workspace_id`;
- `provider`;
- `name`;
- `status`;
- `external_account_id`;
- `external_phone_id`;
- `secret_ref`;
- `config` JSONB sem tokens;
- `last_healthcheck_at`;
- timestamps;
- `deleted_at`.

### 3.8 Recursos que podem entrar na primeira migration ou logo depois

- `agent_connections`: associação entre agentes e conexões;
- `conversations`: conversas por agente, conexão e contato externo;
- `messages`: mensagens recebidas e enviadas;
- `agent_events`: eventos sanitizados e logs operacionais;
- `audit_events`: alterações administrativas;
- `usage_records`: consumo de tokens, mensagens e execuções.

## 4. Diagrama relacional

```text
user
  │
  ├── organization_memberships ── organization
  │                                  │
  │                                  ├── workspace
  │                                  │     │
  │                                  │     ├── workspace_memberships
  │                                  │     ├── agents ── agent_versions
  │                                  │     ├── connections
  │                                  │     ├── conversations ── messages
  │                                  │     ├── agent_events
  │                                  │     └── audit_events
  │                                  │
  │                                  └── billing/quotas, futuramente
  │
  └── created_by / updated_by em recursos administrativos
```

## 5. Migration SQL inicial

Abaixo está uma base para `migrations/0002_multi_tenant_core.sql`. Ela deve ser revisada conforme o padrão de migration do projeto antes de ser aplicada.

```sql
-- migrations/0002_multi_tenant_core.sql

create extension if not exists pgcrypto;

create table if not exists organizations (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  slug text not null,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'deleted')),
  created_by text not null references "user" (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists organizations_slug_unique
  on organizations (lower(slug))
  where deleted_at is null;

create table if not exists organization_memberships (
  organization_id text not null references organizations (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member', 'billing')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists organization_memberships_user_idx
  on organization_memberships (user_id);

create table if not exists workspaces (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations (id) on delete cascade,
  name text not null,
  slug text not null,
  environment text not null default 'production'
    check (environment in ('development', 'staging', 'production')),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'deleted')),
  created_by text not null references "user" (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, slug)
);

create index if not exists workspaces_organization_idx
  on workspaces (organization_id)
  where deleted_at is null;

create table if not exists workspace_memberships (
  workspace_id text not null references workspaces (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  role text not null default 'viewer'
    check (role in ('workspace_admin', 'builder', 'operator', 'analyst', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_memberships_user_idx
  on workspace_memberships (user_id);

create table if not exists agents (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references workspaces (id) on delete cascade,
  name text not null,
  slug text not null,
  agent_type text not null default 'support'
    check (agent_type in ('support', 'sales', 'marketing', 'ads', 'traffic', 'operations', 'custom')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'archived')),
  language text not null default 'pt'
    check (language in ('pt', 'en', 'es')),
  persona text not null default '',
  welcome_message text not null default '',
  system_prompt text not null default '',
  model_provider text not null default 'xai',
  model_name text not null default 'grok-4.5',
  temperature numeric(3, 2) not null default 0.4
    check (temperature >= 0 and temperature <= 2),
  max_tokens integer not null default 400
    check (max_tokens between 80 and 16000),
  memory_window integer not null default 8
    check (memory_window between 0 and 100),
  knowledge jsonb not null default '{}'::jsonb,
  tools jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by text not null references "user" (id),
  updated_by text not null references "user" (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, slug)
);

create index if not exists agents_workspace_status_idx
  on agents (workspace_id, status)
  where deleted_at is null;

create table if not exists agent_versions (
  id text primary key default gen_random_uuid()::text,
  agent_id text not null references agents (id) on delete cascade,
  version_number integer not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'retired')),
  config jsonb not null,
  created_by text not null references "user" (id),
  created_at timestamptz not null default now(),
  published_by text references "user" (id),
  published_at timestamptz,
  retired_at timestamptz,
  unique (agent_id, version_number)
);

create unique index if not exists one_published_agent_version
  on agent_versions (agent_id)
  where status = 'published';

create table if not exists connections (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references workspaces (id) on delete cascade,
  name text not null,
  provider text not null
    check (provider in ('meta', 'evolution', 'zapi', 'generic_webhook')),
  status text not null default 'pending'
    check (status in ('pending', 'connected', 'disconnected', 'error', 'revoked')),
  external_account_id text,
  external_phone_id text,
  secret_ref text,
  config jsonb not null default '{}'::jsonb,
  last_healthcheck_at timestamptz,
  created_by text not null references "user" (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists connections_workspace_provider_idx
  on connections (workspace_id, provider)
  where deleted_at is null;

create table if not exists agent_connections (
  agent_id text not null references agents (id) on delete cascade,
  connection_id text not null references connections (id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (agent_id, connection_id)
);

create unique index if not exists one_primary_connection_per_agent
  on agent_connections (agent_id)
  where is_primary = true;
```

## 6. Regra crítica: evitar associação cruzada entre workspaces

As chaves estrangeiras acima impedem que um agente aponte para uma conexão inexistente, mas ainda é possível tentar associar um agente do workspace A a uma conexão do workspace B. Para evitar isso, existem duas opções.

### Opção recomendada no MVP: validação server-side

Antes de inserir em `agent_connections`, o backend deve executar uma query que confirme:

```sql
select 1
from agents a
join connections c on c.workspace_id = a.workspace_id
where a.id = $1
  and c.id = $2
  and a.workspace_id = $3;
```

O `workspace_id` deve ser obtido do contexto autenticado, e não enviado como autoridade pelo frontend.

### Opção posterior: chave composta

Também é possível tornar o banco mais rigoroso usando chaves compostas com `workspace_id` em todas as tabelas de associação. Isso aumenta a segurança estrutural, mas deixa o schema mais verboso. Para a primeira versão, a validação server-side e testes de autorização são suficientes, desde que todas as queries sejam centralizadas.

## 7. Autorização server-side

Toda operação deve seguir este fluxo:

```text
sessão autenticada
  → user_id verificado
  → workspace solicitado
  → membership validada
  → papel convertido em permissões
  → query filtrada por workspace_id
  → mutação registrada em auditoria
```

Exemplo conceitual:

```ts
async function requireWorkspaceAccess(
  userId: string,
  workspaceId: string,
  permission: "read" | "write" | "publish",
) {
  const membership = await findWorkspaceMembership(userId, workspaceId);
  if (!membership) throw new Error("WORKSPACE_ACCESS_DENIED");

  if (!can(membership.role, permission)) {
    throw new Error("WORKSPACE_PERMISSION_DENIED");
  }

  return membership;
}
```

Uma query de agentes deve sempre conter o escopo:

```sql
select a.*
from agents a
join workspace_memberships wm
  on wm.workspace_id = a.workspace_id
where wm.user_id = $1
  and a.workspace_id = $2
  and a.deleted_at is null
order by a.updated_at desc;
```

Nunca aceitar um `user_id` enviado pelo cliente como base de autorização. O backend deve obtê-lo da sessão.

## 8. Onde colocar os dados do agente

### Colunas normais

Use colunas normais para dados frequentemente filtrados, ordenados ou validados:

- `workspace_id`;
- `name`;
- `slug`;
- `agent_type`;
- `status`;
- `language`;
- `model_provider`;
- `model_name`;
- `temperature`;
- `max_tokens`;
- `memory_window`.

### JSONB

Use JSONB para configurações que ainda estão evoluindo ou possuem estrutura variável:

- `knowledge`;
- `tools`;
- `metadata`;
- `agent_versions.config`.

FAQs, documentos, ferramentas e permissões podem começar em JSONB, mas devem migrar para tabelas próprias quando houver busca, versionamento, compartilhamento ou auditoria individual.

## 9. O que não deve entrar na tabela `agents`

Não colocar diretamente em `agents`:

- token da Meta;
- chave da Evolution;
- chave da Z-API;
- senha de CRM;
- histórico completo de mensagens;
- prompt publicado sem versionamento;
- dados de outro workspace;
- estado transitório de execução;
- dados de cobrança.

Esses dados pertencem a secrets, `agent_versions`, `messages`, `runs` ou `usage_records`.

## 10. Ordem de implementação

### Migration 0002

Criar:

- `organizations`;
- `organization_memberships`;
- `workspaces`;
- `workspace_memberships`;
- `agents`;
- `agent_versions`;
- `connections`;
- `agent_connections`.

### Migration 0003

Criar:

- `conversations`;
- `messages`;
- `agent_events`;
- `idempotency_keys`.

### Migration 0004

Criar:

- `knowledge_sources`;
- `tools`;
- `agent_tool_permissions`;
- `runs`.

### Migration 0005

Criar:

- `audit_events`;
- `usage_records`;
- quotas e billing.

## 11. Migração do estado atual

O estado atual usa IDs como `agent_clara` e `conn_meta`. A migração deve ocorrer assim:

1. Criar uma organização inicial para o usuário proprietário.
2. Criar um workspace `production`.
3. Inserir os agentes seed como registros reais.
4. Inserir as conexões seed como registros `pending`, nunca como `connected` automaticamente.
5. Associar agentes às conexões em `agent_connections`.
6. Criar uma primeira versão `draft` para cada agente.
7. Remover a dependência do `localStorage` como fonte de verdade.
8. Manter Zustand somente como cache de interface e estado temporário.
9. Remover `resetDemo` do ambiente de produção ou restringi-lo ao workspace de desenvolvimento.

## 12. Estratégia de isolamento

Para a primeira versão, recomenda-se:

- banco compartilhado;
- schema compartilhado;
- `workspace_id` obrigatório;
- membership validada no backend;
- queries de domínio centralizadas em `server/db.ts`;
- testes que tentem acessar recursos de outro workspace;
- logs de autorização negada;
- soft delete;
- sem acesso direto do frontend ao banco.

RLS, ou Row-Level Security, pode ser adicionado quando o produto estiver mais maduro. Ela é útil como segunda barreira, mas não deve ser usada como único mecanismo enquanto a aplicação ainda estiver definindo seu contexto de sessão e conexão com o banco.

## 13. Testes mínimos

O modelo deve possuir testes para:

1. usuário membro acessa seu workspace;
2. usuário de outra organização não acessa o workspace;
3. `viewer` não altera agente;
4. `builder` pode editar, mas não publicar;
5. `operator` pode operar conversa;
6. `workspace_admin` pode publicar;
7. agente de um workspace não pode usar conexão de outro;
8. agente arquivado não aparece na listagem padrão;
9. somente uma versão publicada pode existir por agente;
10. remoção de membro revoga acesso imediatamente;
11. soft delete não apaga histórico operacional;
12. nenhum segredo aparece na resposta da API.

## 14. Recomendação final

O modelo inicial deve ser **simples no número de tabelas, rigoroso no isolamento e preparado para versionamento**. A estrutura mais importante não é a tabela `agents`; é a combinação:

```text
organization_memberships
+ workspace_memberships
+ workspace_id em todo recurso
+ autorização server-side
+ agent_versions para publicação
```

Com isso, a plataforma poderá evoluir de atendimento para vendas, Ads, tráfego e workflows sem precisar refazer a base multi-tenant.
