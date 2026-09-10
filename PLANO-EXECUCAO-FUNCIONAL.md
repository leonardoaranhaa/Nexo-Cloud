# Plano de execução para tornar o Nexo Studio funcional

**Data da análise:** 9 de setembro de 2026
**Escopo analisado:** `grok-workspace.zip`
**Objetivo:** transformar o protótipo visual do Nexo Studio em uma aplicação operacional para criar, testar, publicar e monitorar agentes de atendimento no WhatsApp.

## 1. Conclusão executiva

O workspace já contém uma experiência de produto bem definida: um estúdio em português para criar agentes de IA, associá-los a canais de WhatsApp, testar conversas, visualizar o fluxo interno e exportar implementações para n8n ou Python. A interface, os tipos de domínio, os templates, o pipeline local, a geração de código e a integração server-side com a API da xAI já estão parcialmente construídos.

Entretanto, a aplicação ainda é um **protótipo navegável**, não uma plataforma operacional. Os dados principais ficam em Zustand com `localStorage`; as conexões são criadas no navegador; o pareamento por QR e a confirmação da Meta apenas alteram o status local; o botão “publicar” não faz deploy; e não existe um endpoint de webhook da aplicação para receber mensagens reais, executar o agente e responder pelo WhatsApp.

A menor implementação funcional exige quatro blocos obrigatórios:

1. **Persistência e autenticação**, para que agentes, conexões, mensagens e eventos não dependam do navegador.
2. **Gateway de canal**, preferencialmente Meta Cloud API para o primeiro lançamento, ou Evolution API se o objetivo for começar com QR.
3. **Runtime de execução**, com webhook, normalização de eventos, memória, regras de horário, handoff, chamada à xAI e envio da resposta.
4. **Operação segura**, incluindo gestão de segredos, validação de webhooks, idempotência, logs, limites de custo e observabilidade.

**MCP não é necessário para o núcleo do atendimento.** MCP é um protocolo para conectar um modelo a ferramentas e fontes de dados. Ele deve entrar apenas quando o agente precisar consultar ou executar ações em sistemas externos, como CRM, agenda, catálogo, pedidos ou documentos. Os conectores são as autorizações e adaptadores que dão acesso a esses sistemas. Eles não substituem o webhook do WhatsApp nem o runtime do agente.

## 2. O que foi construído

| Área | Evidência no código | Estado atual |
|---|---|---|
| Interface | Rotas `/`, `/create`, `/connections`, `/guide` e `/agents/$id` | Construída e visualmente integrada |
| Modelo de domínio | `src/lib/types.ts` define `Agent`, `Connection`, `ChatMessage`, `TraceStep` e eventos | Bem definido para o protótipo |
| Criação assistida | `src/lib/ai.ts` chama `https://api.x.ai/v1/chat/completions` no servidor | Funciona somente com `XAI_API_KEY` configurada |
| Teste conversacional | `src/lib/use-agent-chat.ts` combina regras locais e chamada à xAI | Funciona no playground, não é runtime de produção |
| Regras do agente | `src/lib/pipeline.ts` implementa horário, FAQ e handoff | Implementação local e determinística |
| Persistência | `src/lib/store.ts` usa Zustand `persist` com `localStorage` | Somente por navegador/dispositivo |
| Conexões | `src/components/create-connection-dialog.tsx` cria objetos locais | Não autentica nem testa os provedores |
| Pareamento | `src/routes/connections.tsx` usa `QrPanel` e `simulatedPhone` | Simulação de QR; não pareia WhatsApp real |
| Webhooks | `src/lib/webhooks.ts` gera URLs e payloads de exemplo | Não há rota POST/GET para receber eventos |
| Publicação | `src/components/publish-panel.tsx` marca o agente como `live` | Não faz deploy nem ativa canal real |
| Exportação | `src/lib/codegen.ts` gera Python Flask e JSON n8n | Exportação útil, mas exige configuração manual |
| Banco | `src/lib/db.ts` possui Neon + fallback PGLite | A infraestrutura existe, mas não há tabelas da aplicação |
| Autenticação | `VITE_AUTH_ENABLED` está `false` | Desligada no estado atual |
| MCP/conectores | Há infraestrutura genérica em `src/lib/app-data`, mas sem uso no produto | Preparada, porém não integrada à jornada do agente |

## 3. Lacunas que impedem o funcionamento real

### 3.1 Persistência e isolamento de dados

O estado principal está em `useNexo`, com armazenamento em `localStorage`. Isso impede colaboração, recuperação em outro dispositivo, execução no servidor e isolamento entre clientes. Além disso, mensagens e eventos não podem ser consultados por um worker ou por uma rota de webhook.

É necessário migrar para tabelas persistentes e escolher explicitamente o modo de autenticação. Como a aplicação gerencia agentes e credenciais, a recomendação é ativar autenticação desde a primeira versão operacional e associar todos os registros a `user_id`.

### 3.2 Conexões falsas

O código guarda apenas metadados como `instance`, `phoneNumberId` e `baseUrl`. Ele não guarda credenciais de forma segura, não cria uma instância em Evolution, não consulta o estado da instância, não obtém QR real, não registra webhook no provedor e não valida token da Meta.

A interface deve deixar de tratar “status conectado” como uma decisão manual. O status precisa ser resultado de uma verificação real e periódica ou de um evento recebido do provedor.

### 3.3 Ausência do runtime de mensagens

Não há rota de entrada que faça o seguinte ciclo:

```text
WhatsApp → webhook → normalização → identificação da conexão/agente
         → idempotência → horário/handoff/memória/FAQ
         → xAI ou resposta determinística → envio pelo provedor
         → persistência → log e métricas
```

Esse é o principal trabalho de produto. O playground usa o mesmo conceito, mas executa dentro do navegador e não representa o caminho de produção.

### 3.4 Publicação apenas visual

`goLive()` atualiza `agent.status` e `lastEventAt`, mas não publica n8n, não sobe um serviço Flask, não configura um webhook e não cria credenciais. O texto “No ar” é, portanto, enganoso em ambiente operacional.

A publicação deve ser remodelada em duas modalidades claras:

- **Runtime gerenciado pelo Nexo:** a aplicação recebe webhooks e executa os agentes diretamente.
- **Exportação para infraestrutura do cliente:** o sistema gera um pacote validado e fornece instruções, sem afirmar que o agente está ativo antes de uma verificação externa.

### 3.5 Segurança e custo

A chamada à xAI já ocorre no servidor, o que é correto, mas ainda faltam limites por usuário, timeout e política de retry, registro de consumo, proteção contra prompt excessivo e tratamento consistente de respostas inválidas. As credenciais dos canais não devem ser armazenadas no Zustand, em props ou em variáveis `VITE_*`.

## 4. Definições práticas: integração, conector e MCP

### 4.1 Integração

**Integração** é a ligação funcional entre o Nexo e outro serviço. Ela define como os dados entram, como saem, como os erros são tratados e como a autorização funciona.

Exemplo: integrar a Meta Cloud API significa validar o webhook da Meta, interpretar o payload de mensagem, enviar respostas para o endpoint Graph API e armazenar o `phone_number_id` e o token de maneira segura.

### 4.2 Conector

**Conector** é o adaptador específico para um serviço ou categoria de serviço. Ele contém credenciais, endpoints, mapeamento de campos, testes de conectividade e operações permitidas.

No Nexo, um conector de WhatsApp deve expor operações como `verify`, `receive`, `send_text`, `send_media` e `healthcheck`. Um conector de CRM poderia expor `find_contact`, `create_lead` e `add_note`.

Um conector não deve ser apenas um formulário com URL e token. Ele precisa ter um contrato, validação, armazenamento seguro de segredo, rotação e logs sem dados sensíveis.

### 4.3 MCP

**MCP, ou Model Context Protocol,** é um protocolo que permite que um modelo descubra e invoque ferramentas padronizadas. No Nexo, ele pode transformar sistemas externos em ferramentas do agente, por exemplo:

- `consultar_agenda`;
- `criar_agendamento`;
- `consultar_pedido`;
- `criar_lead`;
- `buscar_produto`;
- `consultar_documentos`.

MCP é adequado para ferramentas escolhidas pelo modelo durante uma conversa. Ele não é a melhor camada para transportar mensagens do WhatsApp, armazenar sessões ou substituir um webhook. O webhook e o runtime devem continuar sendo código determinístico do produto.

### 4.4 Relação entre as camadas

```text
Canal WhatsApp
    ↓
Integração de entrada/saída
    ↓
Runtime do Nexo
    ├── regras determinísticas
    ├── memória e base de conhecimento
    ├── chamada ao modelo xAI
    └── ferramentas via conectores ou MCP
             ↓
       CRM, agenda, catálogo, ERP, documentos
```

## 5. Integrações necessárias e prioridade

### 5.1 Núcleo obrigatório do primeiro lançamento

| Integração | Necessidade | Implementação recomendada | Critério de aceite |
|---|---|---|---|
| Banco PostgreSQL/Neon | Obrigatória | Criar schema da aplicação e usar `DATABASE_URL` em produção | Usuário cria agente, sai, entra novamente e recupera os dados |
| Autenticação | Obrigatória para uso multiusuário | Ativar Better Auth já preparado no workspace | Cada consulta e mutação é filtrada pelo usuário autenticado |
| xAI | Obrigatória para respostas generativas | Manter chamada server-side, com timeout, retry limitado e limites de uso | Mensagem válida gera resposta; falha gera fallback e log |
| Meta Cloud API | Recomendada como primeiro canal oficial | OAuth/configuração manual de Business Account, token, `phone_number_id`, verify token e app secret | Webhook é validado e uma mensagem real recebe resposta |
| Webhook público HTTPS | Obrigatória | Criar rota para verificação GET e recebimento POST | Meta consegue verificar e entregar eventos sem duplicar respostas |
| Segredos | Obrigatória | Secret manager do ambiente de deploy; nunca `localStorage` ou `VITE_*` | Token não aparece no browser, logs ou exportações |
| Observabilidade | Obrigatória | Logs estruturados, tabela de eventos, correlação por mensagem e alertas de erro | É possível explicar por que uma mensagem não foi respondida |

### 5.2 Canais alternativos

| Canal | Quando usar | O que precisa ser implementado | Risco/limitação |
|---|---|---|---|
| Evolution API | Quando QR e auto-hospedagem forem prioridade | Criar/configurar instância, buscar QR real, healthcheck, webhook e `sendText` | Dependência operacional e maior risco de bloqueio do número |
| Z-API | Quando o cliente já possuir uma instância contratada | Token, instance ID, webhook, healthcheck e envio | Dependência de fornecedor e contrato externo |
| Meta Cloud API | Quando estabilidade, conformidade e operação oficial forem prioridade | App Meta, business verification, WABA, token permanente e templates quando aplicável | Configuração inicial mais burocrática |

A recomendação é lançar primeiro com **Meta Cloud API** e só depois adicionar Evolution e Z-API como conectores independentes. Isso reduz o número de formatos de webhook e de problemas de sessão na primeira entrega.

### 5.3 Integrações de negócio, depois do núcleo

Estas integrações não são necessárias para o agente responder mensagens básicas, mas são necessárias para transformar o produto em uma plataforma de atendimento real:

| Domínio | Sistema possível | Operações iniciais |
|---|---|---|
| CRM | HubSpot, Pipedrive ou CRM próprio | localizar contato, criar lead, registrar conversa |
| Agenda | Google Calendar ou sistema próprio | consultar disponibilidade, criar e cancelar horário |
| Catálogo | banco próprio, Shopify ou ERP | consultar produto, preço e estoque |
| Tickets | Zendesk, Intercom ou sistema próprio | abrir ticket, consultar status, transferir para humano |
| Documentos | Google Drive, Notion ou base vetorial | buscar conteúdo aprovado para respostas |
| Notificações | e-mail, Slack ou Microsoft Teams | avisar handoff, falha de integração e SLA |

Cada integração deve começar com uma operação de leitura e uma operação de escrita controlada. Ações com efeito financeiro, exclusão ou alteração irreversível devem exigir uma regra explícita e, quando aplicável, confirmação humana.

## 6. O que fazer com MCP e conectores

### Fase inicial: não bloquear o lançamento

O primeiro runtime deve usar interfaces internas determinísticas para WhatsApp, memória, xAI e banco. Isso torna o caminho de produção mais previsível e simples de testar. Não é necessário adicionar um servidor MCP apenas para “tornar o WhatsApp funcional”.

### Fase de ferramentas externas

Quando o agente precisar consultar agenda, CRM ou documentos, criar uma camada de ferramentas com este contrato conceitual:

```ts
type AgentTool = {
  id: string;
  name: string;
  description: string;
  inputSchema: unknown;
  risk: "read" | "write" | "destructive";
  execute: (input: unknown, context: ToolContext) => Promise<unknown>;
};
```

O runtime deve registrar quais ferramentas cada agente pode usar. O modelo não deve receber acesso automático a todos os conectores disponíveis no sistema.

Há duas formas válidas de implementar essas ferramentas:

1. **Conectores nativos do Nexo**, indicados para operações críticas, de baixa latência e com contrato estável.
2. **Servidores MCP**, indicados para conectar vários serviços de forma padronizada ou permitir extensibilidade por instalação/configuração.

A infraestrutura genérica de `src/lib/app-data` já sugere uma ponte de conectores no ambiente Grok, mas ela ainda não está ligada às telas nem às rotas do Nexo. Se for usada, o fluxo deve permanecer no servidor: navegador chama uma server function; a server function chama o cliente de conectores; tokens nunca chegam ao frontend.

## 7. Arquitetura alvo recomendada

### 7.1 Componentes

| Componente | Responsabilidade |
|---|---|
| Frontend TanStack Start | Configuração, agentes, testes, logs e administração |
| API server-side | CRUD, autenticação, webhooks e ações de publicação |
| PostgreSQL/Neon | Agentes, conexões, mensagens, sessões, eventos e auditoria |
| Secret manager | Tokens da Meta, Evolution/Z-API, xAI e conectores |
| Runtime de mensagens | Normalização, regras, memória, ferramentas, xAI e resposta |
| Worker/queue opcional | Processamento assíncrono, retries e mensagens longas |
| Adaptadores de canal | Meta, Evolution e Z-API com contrato comum |
| Camada de ferramentas | Conectores nativos e/ou MCP com permissões por agente |
| Observabilidade | Logs, métricas, tracing e alertas |

### 7.2 Entidades mínimas

Criar migrations novas, sem alterar `migrations/auth/0001_auth.sql`, para pelo menos estas tabelas:

| Tabela | Campos principais |
|---|---|
| `agents` | `id`, `user_id`, configuração do agente, status, versão publicada |
| `connections` | `id`, `user_id`, provedor, identificadores públicos, status, segredo referenciado |
| `agent_connections` | associação entre agente e canal, se houver mais de um canal por agente |
| `conversations` | agente, conexão, telefone externo, status, último evento |
| `messages` | conversa, direção, provider message ID, conteúdo, status, timestamps |
| `agent_events` | tipo, payload sanitizado, correlação, resultado e erro |
| `idempotency_keys` | provedor, event/message ID, primeira ocorrência e expiração |
| `tool_permissions` | agente, ferramenta, escopos e nível de risco |
| `deployments` | agente, alvo, versão, status, logs e data de publicação |

O conteúdo das credenciais deve ficar em um secret manager ou em uma referência segura a segredo. A tabela não deve armazenar tokens em texto puro quando o ambiente oferecer armazenamento de segredo.

## 8. Plano de execução por fases

### Fase 0 — Preparação e correção do ambiente

O workspace contém `package.json`, mas o `node_modules` não está presente no diretório extraído; por isso `npm run typecheck` e `npm run build` falharam com `tsc: not found` e `vite: ENOENT`. O `startup.sh` também aponta para `/workspace`, enquanto o pacote analisado está em `/home/ubuntu/work/grok-workspace`; isso é correto apenas no runtime original do Grok, mas precisa ser ajustado ao destino final se a aplicação for executada fora desse ambiente.

Entregáveis: instalar dependências com `npm ci`, confirmar Node 22, definir o destino de deploy, confirmar domínio HTTPS e escolher a primeira provedora de WhatsApp.

### Fase 1 — Persistência e autenticação

Ativar autenticação, criar migrations de domínio, implementar queries server-side e substituir gradualmente as ações do Zustand por procedures/handlers. O Zustand pode permanecer como cache otimista, mas não como fonte de verdade.

Entregáveis: CRUD de agentes e conexões, recuperação de dados após login, isolamento por usuário, migração dos templates para dados iniciais e testes de autorização.

### Fase 2 — Contrato de provedores

Definir uma interface comum para os canais:

```ts
interface WhatsAppProvider {
  verifyWebhook(request: Request): Promise<Response>;
  parseInbound(request: Request): Promise<InboundMessage | null>;
  sendText(input: SendTextInput): Promise<ProviderMessageResult>;
  healthcheck(connection: Connection): Promise<HealthResult>;
}
```

Implementar primeiro Meta. Adicionar Evolution e Z-API somente depois de o contrato estar coberto por testes com payloads reais e casos de erro.

Entregáveis: configuração segura, healthcheck, verificação de webhook, parsing, envio, normalização e atualização real de status.

### Fase 3 — Runtime de mensagens

Criar o endpoint de webhook, verificar assinatura/token, gravar o evento bruto sanitizado, aplicar idempotência e processar a conversa. A ordem recomendada é horário, handoff, recuperação de memória, FAQ/base, ferramentas permitidas, chamada à xAI e envio.

O processamento precisa aceitar reentrega do provedor sem duplicar resposta. Para chamadas lentas ou com retry, utilizar fila ou uma estratégia assíncrona compatível com o ambiente de deploy.

Entregáveis: conversa real de ponta a ponta, memória persistente por telefone, fallback determinístico, handoff registrado e histórico consultável.

### Fase 4 — Publicação real

Substituir “Marcar como no ar” por um fluxo que valide pré-condições: conexão saudável, credenciais presentes, webhook configurado, prompt publicado e teste de fumaça aprovado. O sistema deve criar uma versão imutável do agente e registrar um deployment.

Para o primeiro lançamento, a publicação gerenciada pelo próprio Nexo é preferível à criação automática de infraestrutura n8n/Python. A exportação continuará disponível, mas com status “exportado” e não “publicado”.

Entregáveis: versões, rollback, checklist de publicação, teste real com mensagem controlada e separação entre rascunho e versão ativa.

### Fase 5 — Operação e segurança

Adicionar limites de uso por usuário e agente, timeout, retry com backoff, circuit breaker por provedor, mascaramento de telefone e tokens em logs, auditoria de alterações e alertas de falha. Criar uma tela de diagnóstico que mostre estado do banco, xAI, webhook, provedor e últimas mensagens sem expor segredos.

Entregáveis: observabilidade mínima, política de retenção de mensagens, proteção contra abuso, painel de erros e documentação operacional.

### Fase 6 — Ferramentas, conectores e MCP

Após o canal e o runtime estarem estáveis, adicionar ferramentas de negócio. Começar por um conector de leitura, como consulta de catálogo ou agenda. Em seguida adicionar uma escrita controlada, como criação de lead, com permissões específicas por agente.

Entregáveis: catálogo de ferramentas, permissões por agente, logs de tool call, tratamento de timeout, aprovação para ações de risco e, se necessário, servidor MCP com autenticação e escopos.

## 9. Critérios de aceite do MVP funcional

O MVP deve ser considerado funcional somente quando todos os critérios abaixo forem demonstrados em ambiente implantado:

1. Um usuário consegue autenticar e criar um agente.
2. O agente permanece disponível após recarregar a página e entrar em outro dispositivo.
3. Uma conexão Meta é configurada sem expor o token no navegador.
4. A Meta valida o webhook HTTPS da aplicação.
5. Uma mensagem real é persistida uma única vez mesmo quando o provedor a reenvia.
6. O agente responde com a memória correta da conversa.
7. Horário, FAQ e handoff são executados antes da chamada ao modelo quando aplicável.
8. A resposta é enviada ao mesmo telefone pelo provedor.
9. Falha da xAI ou do provedor gera fallback, log e estado visível ao operador.
10. “Publicar” cria uma versão ativa verificável, e “despublicar” interrompe o processamento.
11. O painel mostra a mensagem, o status, a latência e o motivo de falha sem revelar credenciais.
12. `npm run typecheck`, `npm test` e `npm run build` passam no ambiente de CI/deploy.

## 10. Decisões recomendadas

| Decisão | Recomendação | Motivo |
|---|---|---|
| Primeiro canal | Meta Cloud API | Menor risco operacional e caminho oficial |
| Persistência | Neon/PostgreSQL | Já existe suporte no workspace e atende multiusuário |
| Runtime | Server-side gerenciado pelo Nexo | Evita depender de exportação manual para o MVP |
| n8n | Manter como exportação e integração posterior | Bom para clientes que já operam n8n, mas não deve ser requisito inicial |
| MCP | Adicionar após o runtime básico | Não é necessário para WhatsApp e aumenta superfície operacional |
| Conectores iniciais | Catálogo ou agenda, com leitura antes de escrita | Demonstra valor sem introduzir risco excessivo |
| Estado do frontend | Zustand como cache, banco como fonte de verdade | Permite UX responsiva sem perder consistência |
| IA | xAI server-side com limites e fallback | Preserva a intenção atual do produto e controla custo |

## 11. Ordem prática para a próxima sprint

A próxima sprint deve produzir uma fatia vertical real, em vez de implementar várias telas novas. A sequência recomendada é:

1. Instalar dependências e fazer o build passar.
2. Ativar autenticação e adicionar tabelas de agentes, conexões e mensagens.
3. Migrar criação e edição de agente para o backend.
4. Implementar Meta Cloud API com webhook GET/POST e envio de texto.
5. Criar o runtime mínimo com horário, memória, xAI e persistência.
6. Testar com uma conta Meta de desenvolvimento e um número controlado.
7. Corrigir idempotência, logs e tratamento de falhas.
8. Só então remodelar o botão de publicação e adicionar diagnóstico.
9. Depois do MVP, implementar Evolution/Z-API.
10. Por último, adicionar conectores de negócio e MCP onde houver uma necessidade concreta de ferramenta.

## Referências

[1]: `src/lib/types.ts` "Modelo de domínio do Nexo Studio"

[2]: `src/lib/store.ts` "Estado local e persistência Zustand"

[3]: `src/lib/ai.ts` "Integração server-side com a API da xAI"

[4]: `src/lib/pipeline.ts` "Pipeline local de horário, FAQ e handoff"

[5]: `src/lib/webhooks.ts` "Geradores de URLs e payloads de webhook"

[6]: `src/lib/codegen.ts` "Exportação para Python Flask e n8n"

[7]: `src/components/publish-panel.tsx` "Fluxo atual de publicação"

[8]: `src/routes/connections.tsx` "Fluxo atual de conexões e pareamento simulado"

[9]: `.grok/references/data-and-auth.md` "Diretrizes de dados, autenticação e conectores server-side"

[10]: `.grok/references/deploy-target.md` "Contrato de build e deploy do workspace"
