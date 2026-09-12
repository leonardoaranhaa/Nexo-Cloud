# Arquitetura de execução de ferramentas, MCP e conectores

## 1. Objetivo

A camada de ferramentas deve permitir que agentes executem ações em sistemas externos sem quebrar o isolamento multi-tenant, sem expor credenciais e sem deixar que o modelo faça operações fora das permissões configuradas.

A arquitetura recomendada separa quatro conceitos:

```text
Ferramenta
  → operação que o agente pode solicitar

Conector
  → adaptação técnica para um serviço externo

Credencial
  → segredo usado pelo conector

Execução
  → tentativa auditável de executar uma ferramenta
```

MCP entra como uma das fontes de ferramentas. Ele não deve ser o único mecanismo. A plataforma deve suportar:

1. **Ferramentas nativas**, implementadas e controladas pelo Nexo.
2. **Conectores HTTP/API**, para serviços com API própria.
3. **Servidores MCP**, para ferramentas expostas por MCP.
4. **Webhooks e workflows**, para ações assíncronas ou orientadas a eventos.

WhatsApp, Meta e Evolution são apenas o primeiro conjunto de adapters de mensageria. O Connector Runtime deve ser agnóstico ao fornecedor e permitir a expansão incremental para qualquer serviço externo necessário ao ciclo de vida de agentes: sistemas empresariais, CRM, agenda, e-mail, voz, anúncios, tráfego, analytics, pagamentos, storage, bancos, APIs proprietárias, webhooks e MCP. Nenhum contrato de domínio deve assumir que um agente é um agente de WhatsApp; o canal é uma capacidade contextual instalada e autorizada no workspace.

## 2. Princípio central de segurança

O modelo nunca deve receber um token e nunca deve executar uma função diretamente.

O fluxo correto é:

```text
Mensagem
  → Agent Runtime carrega agent_version
  → modelo solicita tool_call
  → Tool Gateway valida workspace, agente e política
  → Connector Runtime resolve credencial no servidor
  → conector ou MCP executa
  → resultado é validado e sanitizado
  → modelo recebe somente o resultado permitido
  → execução é registrada em runs/tool_executions/audit_events
```

O navegador participa apenas da configuração e visualização. Ele não participa da execução de ferramentas de produção.

## 3. Componentes da camada

### 3.1 Tool Registry

Catálogo de todas as ferramentas disponíveis na plataforma.

Responsabilidades:

- registrar ferramentas;
- informar nome e descrição ao modelo;
- armazenar schema de entrada e saída;
- classificar risco;
- informar timeout e limites;
- associar ferramenta a um conector;
- controlar versão da ferramenta;
- marcar ferramenta como ativa, desativada ou em revisão.

### 3.2 Policy Engine

Decide se uma chamada pode ser executada.

Deve validar:

- organização;
- workspace;
- agente;
- versão publicada;
- usuário ou origem da execução;
- ferramenta;
- escopos da credencial;
- risco da operação;
- limite de uso;
- necessidade de aprovação humana;
- horário e política do workspace.

### 3.3 Secret Resolver

Obtém a credencial correta para o workspace sem entregá-la ao modelo ou ao frontend.

Responsabilidades:

- resolver `secret_ref`;
- descriptografar ou consultar secret manager;
- aplicar rotação;
- verificar expiração;
- mascarar tokens em logs;
- impedir acesso cruzado entre workspaces.

### 3.4 Connector Runtime

Executa o adaptador nativo do serviço externo.

Exemplos:

- Google Calendar;
- CRM;
- Meta Ads;
- Google Ads;
- catálogo;
- ERP;
- WhatsApp;
- e-mail.

### 3.5 MCP Runtime

Conecta-se a servidores MCP autorizados, descobre ferramentas e encaminha chamadas aprovadas.

O MCP Runtime deve controlar:

- URL ou transporte do servidor;
- autenticação do servidor;
- catálogo permitido;
- versão do servidor;
- timeout;
- tamanho do resultado;
- isolamento por workspace;
- retry;
- logs;
- encerramento de conexões.

### 3.6 Execution Store

Registra cada tentativa de execução, incluindo sucesso, erro, latência, custo e resultado sanitizado.

O resultado bruto pode conter dados sensíveis. Por isso, deve existir uma política de retenção e uma separação entre log operacional e payload completo protegido.

## 4. Modelo de dados adicional

O modelo multi-tenant anterior deve ser ampliado com as tabelas abaixo.

### 4.1 `connector_definitions`

Descreve o tipo de integração, sem armazenar credenciais de um cliente específico.

```text
connector_definitions
- id
- key
- name
- kind              -- native_api, mcp, webhook
- provider
- version
- capabilities     -- JSONB
- status
- created_at
- updated_at
```

Exemplos de `key`:

- `meta_ads`;
- `google_ads`;
- `hubspot`;
- `google_calendar`;
- `mcp_generic`.

### 4.2 `connector_instances`

Representa uma conexão específica criada por um workspace.

```text
connector_instances
- id
- workspace_id
- connector_definition_id
- name
- status
- secret_ref
- config             -- JSONB sem segredos
- scopes             -- JSONB
- health_status
- last_healthcheck_at
- created_by
- created_at
- updated_at
- deleted_at
```

Um workspace pode ter várias instâncias do mesmo conector, como duas contas de anúncios diferentes.

### 4.3 `tools`

Registra as ferramentas que podem ser expostas aos agentes.

```text
tools
- id
- connector_definition_id
- connector_instance_id nullable
- key
- name
- description
- input_schema      -- JSONB
- output_schema     -- JSONB
- risk_level        -- read, write, destructive
- timeout_ms
- max_retries
- status
- version
- created_at
- updated_at
```

A ferramenta deve apontar para uma instância específica quando o agente estiver vinculado a uma conta concreta do cliente.

### 4.4 `agent_tool_permissions`

Define o que cada versão publicada do agente pode usar.

```text
agent_tool_permissions
- agent_version_id
- tool_id
- enabled
- allowed_scopes   -- JSONB
- require_approval
- rate_limit       -- JSONB
- conditions       -- JSONB
- created_at
- created_by
```

A permissão deve ser copiada ou congelada na versão publicada. Alterar uma permissão no painel não deve mudar silenciosamente um agente que já está em produção.

### 4.5 `tool_executions`

Registra uma execução individual.

```text
tool_executions
- id
- workspace_id
- agent_id
- agent_version_id
- run_id
- conversation_id nullable
- tool_id
- connector_instance_id
- requested_by       -- model, workflow, user, system
- status             -- requested, approved, running, succeeded, failed, denied
- risk_level
- input_hash
- input_redacted     -- JSONB
- output_redacted    -- JSONB
- error_code
- error_message
- latency_ms
- provider_request_id
- created_at
- started_at
- finished_at
```

Nunca guardar tokens, cookies ou payloads completos sem necessidade. `input_hash` permite correlação sem duplicar dados sensíveis.

### 4.6 `approvals`

Usada para ações que exigem confirmação humana.

```text
approvals
- id
- workspace_id
- tool_execution_id
- requested_by
- approver_id nullable
- status             -- pending, approved, rejected, expired
- reason
- expires_at
- decided_at
- created_at
```

## 5. Contratos de execução

### 5.1 Registro de ferramenta

```ts
export type ToolRisk = "read" | "write" | "destructive";

export type ToolDefinition = {
  key: string;
  name: string;
  description: string;
  connectorDefinitionId: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  risk: ToolRisk;
  timeoutMs: number;
  maxRetries: number;
};
```

### 5.2 Contexto de execução

```ts
export type ToolExecutionContext = {
  organizationId: string;
  workspaceId: string;
  agentId: string;
  agentVersionId: string;
  runId: string;
  conversationId?: string;
  actor: "model" | "workflow" | "user" | "system";
  traceId: string;
};
```

O contexto deve ser criado pelo backend. Nenhuma dessas propriedades deve ser confiada ao payload enviado pelo navegador ou pelo modelo.

### 5.3 Interface do conector

```ts
export interface ConnectorAdapter {
  readonly provider: string;

  validateConfig(config: unknown): Promise<void>;

  healthcheck(
    instance: ConnectorInstance,
    ctx: ConnectorContext,
  ): Promise<HealthcheckResult>;

  execute(
    tool: ToolDefinition,
    input: unknown,
    ctx: ConnectorContext,
  ): Promise<unknown>;
}
```

`ConnectorContext` deve conter uma função server-side para resolver o segredo, e não o segredo já exposto em uma propriedade serializável:

```ts
export type ConnectorContext = {
  workspaceId: string;
  connectorInstanceId: string;
  traceId: string;
  getSecret: (name: string) => Promise<string>;
};
```

### 5.4 Interface do Tool Gateway

```ts
export interface ToolGateway {
  listAllowedTools(input: {
    agentVersionId: string;
    workspaceId: string;
  }): Promise<ToolDefinition[]>;

  execute(input: {
    toolKey: string;
    args: unknown;
    context: ToolExecutionContext;
  }): Promise<ToolExecutionResult>;
}
```

## 6. Ciclo de uma chamada de ferramenta

### Etapa 1 — Carregar a versão do agente

O runtime deve carregar `agent_versions`, e não o registro editável de `agents`.

A versão contém:

- prompt;
- modelo;
- regras;
- ferramentas permitidas;
- permissões congeladas;
- limites;
- configuração de memória.

### Etapa 2 — Anunciar ferramentas ao modelo

O runtime consulta apenas as ferramentas autorizadas para aquela versão e converte cada uma para o formato de tool calling do provedor de modelo.

Exemplo conceitual:

```json
{
  "type": "function",
  "function": {
    "name": "crm_create_lead",
    "description": "Cria um lead qualificado no CRM",
    "parameters": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "phone": { "type": "string" },
        "interest": { "type": "string" }
      },
      "required": ["name", "phone", "interest"]
    }
  }
}
```

O modelo não deve receber ferramentas que não estejam na versão publicada.

### Etapa 3 — Validar a chamada

Quando o modelo solicitar uma ferramenta:

1. validar o nome contra uma allowlist;
2. validar os argumentos contra `input_schema`;
3. limitar tamanho de strings, arrays e objetos;
4. rejeitar campos desconhecidos quando apropriado;
5. verificar a permissão do agente;
6. verificar o risco;
7. decidir se exige aprovação;
8. verificar quota e rate limit;
9. criar `tool_executions` com status `requested`.

### Etapa 4 — Aprovar ou negar

Ferramentas de leitura podem executar automaticamente quando autorizadas.

Ferramentas de escrita podem executar automaticamente somente se a política do workspace permitir.

Ferramentas destrutivas ou com efeito financeiro devem exigir aprovação, por exemplo:

- alterar orçamento de campanha;
- publicar anúncio;
- cancelar pedido;
- apagar arquivo;
- criar compromisso em nome de outra pessoa;
- efetuar pagamento.

### Etapa 5 — Executar no conector

O Tool Gateway resolve o adapter correto, busca o segredo, executa a operação e aplica timeout.

A chamada deve possuir:

- `trace_id`;
- timeout absoluto;
- retry somente para erros transitórios;
- circuit breaker por instância;
- idempotency key para escrita;
- sanitização do resultado.

### Etapa 6 — Validar a resposta

O resultado do conector deve ser validado contra `output_schema` e reduzido ao necessário para o modelo.

Exemplo: em vez de retornar um objeto inteiro de campanha, retornar:

```json
{
  "campaign_id": "cmp_123",
  "name": "Campanha de leads",
  "status": "active",
  "spend_7d": 342.12,
  "leads_7d": 28,
  "cpl_7d": 12.22
}
```

Isso reduz custo, risco de vazamento e confusão do modelo.

### Etapa 7 — Continuar a conversa

O runtime adiciona o resultado sanitizado ao contexto do modelo. O modelo gera a resposta final ou solicita outra ferramenta, respeitando `max_tool_rounds`.

O limite inicial recomendado é de 3 chamadas de ferramenta por turno. Se o limite for atingido, a execução deve parar com uma resposta segura e um evento de diagnóstico.

## 7. Implementação de MCP

### 7.1 MCP como tipo de conector

MCP deve ser representado como um `connector_definition.kind = 'mcp'` e uma `connector_instance` por workspace.

Configuração conceitual:

```json
{
  "transport": "streamable-http",
  "server_url": "https://mcp.exemplo.com/mcp",
  "catalog_id": "agenda-prod",
  "allowed_tools": ["calendar_availability", "calendar_create_event"]
}
```

O servidor MCP pode estar:

- hospedado pelo Nexo;
- hospedado pelo cliente;
- fornecido por um parceiro;
- exposto por um serviço interno.

### 7.2 Descoberta controlada

A descoberta de ferramentas do MCP não deve publicar automaticamente tudo para todos os agentes.

O fluxo recomendado é:

```text
Administrador conecta servidor MCP
  → Nexo descobre ferramentas
  → ferramentas entram em estado review
  → administrador aprova ferramentas e escopos
  → ferramentas ficam disponíveis no workspace
  → builder associa ferramentas à versão do agente
  → publicação congela permissões
```

### 7.3 Segurança do MCP

Para cada servidor MCP, validar:

- URL HTTPS, salvo ambiente local explicitamente permitido;
- identidade do servidor;
- autenticação e rotação de token;
- lista de ferramentas permitidas;
- limites de resposta;
- timeout;
- tamanho máximo de input;
- política de rede;
- logs sem segredos;
- isolamento por workspace.

Não permitir que um agente escolha arbitrariamente uma URL MCP enviada pelo usuário final. A URL deve vir de uma `connector_instance` aprovada.

### 7.4 MCP remoto versus conector nativo

| Critério | Conector nativo | MCP |
|---|---|---|
| Controle | Máximo | Depende do servidor |
| Latência | Geralmente menor | Pode ser maior |
| Padronização | Interna ao Nexo | Interoperável |
| Segurança | Política própria | Exige validação do servidor |
| Melhor uso | Operações críticas e centrais | Extensões e parceiros |
| Evolução | Código mantido pelo Nexo | Ferramentas descobertas externamente |

A recomendação é usar conectores nativos para WhatsApp, billing, publicação, campanhas e operações críticas. Usar MCP para agenda, documentos, CRM especializado e ferramentas de parceiros.

## 8. Exemplo de execução: agente de vendas

```text
Cliente: Quero agendar uma demonstração amanhã à tarde.

1. Runtime carrega a versão publicada do agente.
2. Modelo identifica intenção de agendamento.
3. Modelo solicita `calendar_availability`.
4. Policy Engine confirma que a ferramenta é permitida.
5. MCP Runtime chama o servidor de agenda.
6. Resultado retorna com horários disponíveis.
7. Modelo apresenta opções ao cliente.
8. Cliente escolhe 15:00.
9. Modelo solicita `calendar_create_event`.
10. Policy Engine verifica que a operação exige confirmação.
11. Sistema executa ou solicita aprovação, conforme política.
12. Evento é criado.
13. CRM registra a oportunidade.
14. Resposta final é enviada no WhatsApp.
15. Todas as etapas ficam registradas no trace.
```

## 9. Exemplo de execução: agente de Ads

Para Ads, a primeira versão deve começar com ferramentas de leitura:

- `ads_list_campaigns`;
- `ads_get_campaign_metrics`;
- `ads_compare_periods`;
- `ads_list_creatives`;
- `analytics_get_conversions`.

Ações de escrita devem ser posteriores:

- `ads_update_budget`;
- `ads_pause_campaign`;
- `ads_create_campaign`;
- `ads_publish_creative`.

Essas ferramentas devem possuir `risk = write` ou `destructive`, `require_approval = true` e uma política explícita de limite financeiro.

## 10. Tratamento de erros

Os erros devem ser classificados para que o agente não invente respostas:

| Código | Significado | Comportamento |
|---|---|---|
| `TOOL_NOT_ALLOWED` | Ferramenta não autorizada | Não executar; informar limitação |
| `INVALID_ARGUMENTS` | Input não passou no schema | Pedir dado corrigido |
| `CREDENTIAL_EXPIRED` | Credencial expirada | Bloquear e alertar operador |
| `PROVIDER_UNAVAILABLE` | Serviço externo indisponível | Retry limitado e fallback |
| `RATE_LIMITED` | Limite do provedor atingido | Esperar, enfileirar ou informar |
| `APPROVAL_REQUIRED` | Ação exige humano | Criar aprovação pendente |
| `TOOL_TIMEOUT` | Execução excedeu tempo | Encerrar e registrar |
| `RESULT_INVALID` | Resposta não passou no schema | Não entregar ao modelo sem tratamento |
| `POLICY_DENIED` | Regra do workspace negou | Bloquear e auditar |

A resposta ao usuário deve ser baseada no estado real. Se a agenda falhou, o agente não pode afirmar que o horário foi reservado.

## 11. Idempotência, retries e filas

### Leitura

Leituras podem ter retry automático quando o erro for transitório:

- timeout;
- conexão recusada;
- HTTP 429;
- HTTP 502/503/504.

### Escrita

Toda escrita precisa de uma chave idempotente derivada de:

```text
workspace_id + tool_execution_id + operação
```

O conector deve reutilizar a mesma chave nos retries. Sem isso, uma falha de rede pode criar dois leads, dois eventos ou duas alterações de orçamento.

### Assíncrono

A execução deve ser colocada em fila quando:

- ultrapassar o timeout de uma requisição web;
- exigir aprovação;
- envolver várias ferramentas;
- processar lote de campanhas;
- gerar relatório extenso;
- depender de polling externo.

Webhooks e handlers periódicos podem rodar no ambiente web gerenciado. Um worker persistente deve ser usado quando houver fila contínua, execução em tempo real ou polling frequente.

## 12. Separação entre agente, ferramenta e workflow

Não misturar as responsabilidades:

- **Agente:** interpreta linguagem, decide e conversa.
- **Ferramenta:** executa uma operação concreta.
- **Conector:** sabe falar com um sistema externo.
- **Workflow:** orquestra uma sequência previsível.
- **MCP:** fornece um protocolo padronizado para ferramentas.

Exemplo:

```text
Agente de vendas
  → ferramenta consultar disponibilidade
      → conector Google Calendar
          → API do Google Calendar
```

Se a sequência for sempre igual, ela deve ser um workflow determinístico, não uma decisão aberta do modelo.

## 13. API interna recomendada

Rotas ou server functions mínimas:

```text
GET    /api/workspaces/:workspaceId/connectors
POST   /api/workspaces/:workspaceId/connectors
POST   /api/connectors/:id/healthcheck
POST   /api/connectors/:id/discover-tools
GET    /api/workspaces/:workspaceId/tools
POST   /api/agents/:agentId/tool-permissions
POST   /api/agent-versions/:versionId/publish
POST   /api/tool-executions/:id/approve
POST   /api/tool-executions/:id/reject
GET    /api/runs/:runId
GET    /api/tool-executions/:id
```

Todas devem usar autenticação, membership e autorização por workspace. Rotas de execução não devem aceitar `connector_instance_id` sem verificar que ele pertence ao mesmo workspace da versão do agente.

## 14. Ordem de implementação no Nexo atual

### Passo 1 — Criar domínio de ferramentas

Adicionar as tabelas `connector_definitions`, `connector_instances`, `tools`, `agent_tool_permissions` e `tool_executions`.

### Passo 2 — Criar o Tool Registry

Implementar cadastro de ferramentas nativas com schema e risco. Começar com duas ferramentas de leitura, por exemplo:

- consulta de catálogo;
- consulta de disponibilidade de agenda.

### Passo 3 — Criar o Policy Engine

Implementar:

- allowlist por versão;
- validação de schema;
- papéis e permissões;
- limite de chamadas;
- classificação de risco;
- aprovação.

### Passo 4 — Criar um conector nativo

Implementar um conector de agenda ou CRM com credencial server-side, healthcheck, timeout e logs.

### Passo 5 — Integrar o runtime de chat

Alterar o `use-agent-chat` para que o playground use o mesmo Tool Gateway do runtime real. O navegador deve chamar uma server function; nunca executar a API externa diretamente.

### Passo 6 — Adicionar MCP

Criar `McpConnectorAdapter`, descoberta controlada, aprovação de ferramentas e execução com timeout. Começar com um único servidor MCP de baixo risco.

### Passo 7 — Criar observabilidade

Exibir no painel:

- ferramenta chamada;
- agente e versão;
- status;
- latência;
- erro;
- aprovação;
- custo estimado;
- resultado resumido.

### Passo 8 — Adicionar ferramentas de Ads

Começar com leitura de campanhas e métricas. Somente depois implementar escrita com aprovação.

## 15. Relação com a implementação existente

O workspace já possui uma ponte genérica em `src/lib/app-data/client.server.ts`. Ela possui características úteis:

- execução server-side;
- validação de requisição same-site;
- token recebido no servidor;
- chamada para um host de conectores;
- distinção entre tipos de conector;
- suporte a `ConnectorType.Mcp`;
- exigência de `connectorCatalogId` para MCP;
- tratamento de token pendente e login;
- memoização de falhas.

Essa ponte pode inspirar ou atender a integração com conectores próprios do ambiente Grok, mas não deve ser confundida automaticamente com o gateway multi-tenant do Nexo. Para o produto, será necessário adicionar:

- `workspace_id` no contexto;
- resolução de credencial por `connector_instance_id`;
- permissões congeladas em `agent_version_id`;
- auditoria de execução;
- rate limits por workspace;
- políticas próprias para ferramentas nativas;
- isolamento entre clientes;
- catálogo controlado pelo Nexo.

A regra de arquitetura deve continuar sendo:

```text
frontend
  → server function autenticada
      → Tool Gateway
          → conector nativo ou MCP
```

## 16. Critérios de aceite

A camada estará pronta para MVP quando:

1. Um agente só enxerga ferramentas associadas à sua versão publicada.
2. Um usuário de outro workspace não consegue listar ou executar ferramentas.
3. O frontend nunca recebe credenciais.
4. Uma chamada com argumentos inválidos é rejeitada antes do conector.
5. Uma ferramenta de leitura funciona com timeout e retry limitado.
6. Uma ferramenta de escrita usa idempotência.
7. Uma ferramenta destrutiva exige aprovação.
8. Uma credencial expirada gera estado visível e não resposta inventada.
9. Cada execução tem `trace_id`, status, latência e erro auditável.
10. Um servidor MCP só expõe ferramentas previamente aprovadas.
11. O resultado entregue ao modelo é sanitizado e limitado.
12. O playground e o runtime real usam o mesmo Tool Gateway.

## 17. Recomendação final

A implementação deve começar com um **Tool Gateway central**, e não com chamadas MCP espalhadas pelo código dos agentes.

A sequência correta é:

```text
workspace
  → connector instance
      → tool registry
          → agent version permission
              → policy engine
                  → tool gateway
                      → conector nativo ou MCP
                          → execução auditável
```

A decisão mais importante é tratar ferramentas como recursos multi-tenant versionados e autorizados. O agente apenas solicita uma ferramenta. O Nexo decide se ela pode ser executada, com quais credenciais, sob quais limites e com qual nível de aprovação.

Essa estrutura permite adicionar atendimento, vendas, CRM, agenda, Ads, tráfego e operações sem duplicar a camada de segurança e execução.
