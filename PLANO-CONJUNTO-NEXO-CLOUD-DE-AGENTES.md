# Plano conjunto de execução — Nexo Cloud de Agentes

**Objetivo:** transformar o Nexo Studio em uma plataforma de nuvem direcionada a agentes de atendimento, vendas, marketing, gestão de anúncios, tráfego e operações.

## 1. Visão do produto

A aplicação deve evoluir de um estúdio para criar agentes individuais para uma **plataforma de agentes como serviço**. A referência conceitual é a AWS, mas o produto não deve tentar copiar a quantidade de serviços da AWS. A semelhança deve estar na organização:

- uma conta e um espaço de trabalho;
- recursos provisionáveis;
- serviços independentes, mas integrados;
- permissões e credenciais centralizadas;
- execução escalável;
- logs, métricas e auditoria;
- cobrança por uso;
- catálogo de agentes e ferramentas;
- APIs e automações para operar tudo programaticamente.

A proposta do Nexo é oferecer uma camada especializada para pessoas e empresas que querem criar agentes sem montar toda a infraestrutura de modelos, canais, integrações, memória, automações e monitoramento.

> **Posicionamento:** o Nexo não será apenas um chatbot builder. Será uma plataforma para criar, conectar, executar, supervisionar e medir agentes especializados em tarefas de negócio.

## 2. Tradução da analogia com a AWS

| Conceito de nuvem | Equivalente no Nexo |
|---|---|
| Conta | Organização ou cliente |
| Região/ambiente | Workspace, ambiente de teste e produção |
| IAM | Usuários, equipes, papéis e permissões |
| Compute | Runtime que executa agentes e workflows |
| Lambda | Ação ou ferramenta executada sob demanda |
| ECS/EKS | Workers e agentes persistentes, quando necessário |
| API Gateway | Gateway de webhooks e APIs dos agentes |
| SQS/EventBridge | Fila, eventos, retries e gatilhos |
| RDS | Banco operacional de agentes, conversas e eventos |
| S3 | Arquivos, documentos, criativos e bases de conhecimento |
| CloudWatch | Logs, métricas, alertas e tracing |
| Secrets Manager | Tokens, chaves e credenciais dos conectores |
| Marketplace | Catálogo de agentes, templates, ferramentas e integrações |
| CloudFormation/Terraform | Configuração declarativa e versionamento dos agentes |
| Billing | Medição de mensagens, tokens, execuções, ferramentas e campanhas |

Essa analogia deve orientar a arquitetura, mas não deve aparecer de forma excessivamente técnica para o usuário final. A interface precisa falar em **agentes, canais, ferramentas, campanhas, tarefas, receitas e resultados**.

## 3. Estrutura da plataforma

A plataforma deve ser dividida em quatro camadas.

### 3.1 Control Plane

É a camada administrativa. Ela permite criar e governar recursos, sem executar diretamente cada mensagem.

Inclui:

- organizações e workspaces;
- usuários e equipes;
- agentes;
- versões e ambientes;
- conexões e credenciais;
- ferramentas e permissões;
- workflows;
- canais;
- políticas de uso;
- métricas e faturamento.

### 3.2 Agent Runtime

É a camada que executa os agentes. Ela recebe eventos, carrega o contexto, escolhe ferramentas, chama modelos e produz ações.

Inclui:

- roteamento de eventos;
- memória de conversa;
- regras determinísticas;
- execução de prompts;
- chamadas à xAI e outros modelos;
- tool calling;
- MCP;
- filas e retries;
- handoff para humanos;
- controle de versão do agente.

### 3.3 Integration Layer

É a camada de conexão com o mundo externo.

Inclui:

- WhatsApp Meta Cloud API;
- Evolution API;
- Z-API;
- Instagram e Messenger, posteriormente;
- CRM;
- agenda;
- e-mail;
- plataformas de anúncios;
- Google Ads;
- Meta Ads;
- TikTok Ads;
- Google Analytics;
- planilhas, bancos e ERPs;
- servidores MCP;
- n8n e webhooks genéricos.

### 3.4 Experience Layer

É a experiência de uso da plataforma.

Inclui:

- console web;
- construtor visual de agentes;
- copiloto de configuração;
- inbox omnichannel;
- painel de campanhas;
- construtor de workflows;
- observabilidade;
- marketplace;
- API pública;
- CLI e configurações declarativas, em fase posterior.

## 4. Famílias de agentes

A plataforma não deve começar tentando entregar agentes completamente genéricos. O produto deve possuir famílias com contratos, ferramentas e indicadores próprios.

| Família | Primeira função | Dados e ferramentas necessários | Indicadores |
|---|---|---|---|
| Atendimento | Responder dúvidas e resolver solicitações | FAQ, base de conhecimento, WhatsApp, handoff, tickets | tempo de resposta, resolução, satisfação |
| Vendas | Qualificar leads e conduzir oportunidades | CRM, catálogo, agenda, WhatsApp | leads qualificados, reuniões, conversão |
| Suporte | Diagnosticar e encaminhar problemas | base técnica, tickets, histórico do cliente | resolução, reabertura, SLA |
| Gestão de anúncios | Criar, revisar e acompanhar campanhas | Meta Ads, Google Ads, dados de conversão | custo por lead, ROAS, CPA |
| Tráfego e análise | Interpretar dados e recomendar ações | Analytics, Search Console, planilhas, BI | sessões, conversão, CAC, receita |
| Operações | Executar rotinas repetitivas | ERP, planilhas, e-mail, webhooks | tarefas concluídas, erros, tempo economizado |
| Marketing | Criar conteúdo e distribuir campanhas | calendário editorial, CMS, redes sociais | alcance, engajamento, leads |

A primeira família deve ser **Atendimento + Vendas**, porque reutiliza o que já existe no protótipo: WhatsApp, memória, FAQ, handoff, agente e conexão de canal. Gestão de anúncios e tráfego devem entrar depois, quando houver identidade de workspace, conectores, permissões, auditoria e medição de uso.

## 5. Produto mínimo correto

O MVP da plataforma não deve tentar entregar todos os agentes. Ele deve provar a infraestrutura comum com dois agentes de alto valor:

1. **Agente de Atendimento:** responde no WhatsApp, usa base de conhecimento, reconhece horário e transfere para humano.
2. **Agente de Vendas:** qualifica o lead, coleta informações, registra o contato no CRM e agenda uma reunião.

O MVP precisa permitir:

- criar um workspace;
- convidar membros;
- criar agentes a partir de templates;
- conectar Meta Cloud API;
- carregar FAQs e documentos;
- configurar ferramentas permitidas;
- publicar uma versão;
- receber mensagens reais;
- registrar conversa e eventos;
- encaminhar para humano;
- medir conversão e custo;
- desligar ou reverter um agente.

## 6. Arquitetura alvo

```text
                    ┌─────────────────────────────┐
                    │ Console Nexo                 │
                    │ Agentes · Workspaces · Ops   │
                    └──────────────┬──────────────┘
                                   │ API / Auth
                    ┌──────────────▼──────────────┐
                    │ Control Plane                │
                    │ Configuração · IAM · Billing │
                    │ Versões · Secrets · Catalog  │
                    └──────┬─────────┬────────────┘
                           │         │
                ┌──────────▼───┐ ┌───▼─────────────┐
                │ Event Gateway │ │ Agent Runtime    │
                │ Webhooks/API  │ │ Memória · LLM    │
                │ Idempotência  │ │ Tools · MCP      │
                └──────┬────────┘ │ Policies · Queue │
                       │          └──────┬──────────┘
                       │                 │
          ┌────────────▼──────┐   ┌──────▼──────────┐
          │ Channel Adapters   │   │ Integration Hub │
          │ Meta · Evolution   │   │ CRM · Ads · ERP │
          │ Z-API · E-mail     │   │ Agenda · Docs   │
          └────────────────────┘   └─────────────────┘
                       │                 │
                 ┌─────▼─────┐    ┌──────▼─────────┐
                 │ PostgreSQL │    │ Object Storage │
                 │ Dados       │    │ Docs · Mídia   │
                 └────────────┘    └────────────────┘
```

## 7. Modelo de domínio

A base atual precisa evoluir de `Agent` e `Connection` locais para recursos multi-tenant.

| Entidade | Finalidade |
|---|---|
| `organizations` | Empresa ou conta principal |
| `workspaces` | Ambientes de trabalho, como teste e produção |
| `memberships` | Relação entre usuários, equipes e papéis |
| `agents` | Configuração lógica do agente |
| `agent_versions` | Snapshots imutáveis publicados |
| `channels` | WhatsApp, Instagram, e-mail e outros canais |
| `connections` | Credenciais e configuração do canal |
| `conversations` | Sessões com contatos externos |
| `messages` | Mensagens recebidas e enviadas |
| `knowledge_sources` | FAQs, documentos, URLs e bases vetoriais |
| `tools` | Ferramentas nativas ou MCP |
| `agent_tool_permissions` | Ferramentas permitidas para cada agente |
| `workflows` | Sequências de ações e gatilhos |
| `campaigns` | Campanhas de marketing e anúncios |
| `ad_accounts` | Contas Meta Ads, Google Ads e TikTok Ads |
| `tasks` | Ações agendadas ou pendentes de aprovação |
| `runs` | Execuções de agentes e workflows |
| `audit_events` | Histórico de alterações e ações sensíveis |
| `usage_records` | Tokens, mensagens, execuções, ferramentas e custos |
| `deployments` | Estado de publicação de cada versão |

Toda entidade de negócio deve possuir `workspace_id`. Os dados não podem ser identificados apenas por IDs enviados pelo frontend. O backend deve resolver o workspace pelo usuário autenticado e verificar a permissão antes de cada operação.

## 8. Integrações, conectores e MCP na plataforma

### 8.1 Conectores de infraestrutura

São necessários para o funcionamento básico:

- provedor de modelo, inicialmente xAI;
- banco PostgreSQL/Neon;
- armazenamento de arquivos;
- provedor de autenticação;
- sistema de e-mail e notificações;
- secret manager;
- observabilidade;
- fila ou mecanismo de eventos.

### 8.2 Conectores de canais

São responsáveis por entrada e saída de comunicação:

- Meta Cloud API;
- Evolution API;
- Z-API;
- e-mail;
- Instagram/Messenger em etapa posterior;
- telefone e voz somente após estabilizar texto.

### 8.3 Conectores de negócio

São responsáveis por ações que geram valor:

- CRM;
- Google Calendar;
- catálogo e estoque;
- ERP;
- help desk;
- Google Sheets;
- plataformas de pagamento;
- plataformas de anúncios;
- Analytics e BI.

### 8.4 MCP

MCP deve ser tratado como um **formato de extensão de ferramentas**, não como a espinha dorsal da plataforma.

O Nexo deve possuir um catálogo de ferramentas com:

- nome e descrição;
- esquema de entrada;
- origem da ferramenta;
- permissões necessárias;
- risco da operação;
- timeout;
- limite de uso;
- política de aprovação;
- logs de execução;
- versão.

Uma ferramenta MCP de consulta de agenda pode ser liberada automaticamente. Uma ferramenta MCP que altera uma campanha ou realiza uma ação financeira deve exigir aprovação ou uma política explícita de automação.

O fluxo seguro deve ser:

```text
Mensagem do usuário
    ↓
Runtime identifica intenção
    ↓
Modelo solicita ferramenta permitida
    ↓
Nexo valida política, escopo e risco
    ↓
Conector/MCP executa no servidor
    ↓
Resultado sanitizado retorna ao agente
    ↓
Ação e resultado são auditados
```

Tokens e credenciais nunca devem passar pelo frontend, pelo prompt ou pelo estado do navegador.

## 9. Roadmap conjunto de execução

### Fase 1 — Fundamento multi-tenant

**Objetivo:** converter o protótipo local em um produto com conta, workspace e persistência.

**Entregas:**

- autenticação real;
- organizações, workspaces e membros;
- papéis `owner`, `admin`, `operator` e `viewer`;
- banco de agentes, conexões, conversas e eventos;
- migração do Zustand para backend;
- ambiente de teste e produção;
- auditoria básica;
- build e deploy reproduzíveis.

**Resultado:** o usuário consegue criar recursos que pertencem à sua empresa e não apenas ao navegador.

### Fase 2 — Agent Runtime e Atendimento

**Objetivo:** colocar o primeiro agente real em operação.

**Entregas:**

- webhook público;
- Meta Cloud API;
- normalização de mensagens;
- idempotência;
- memória persistente;
- FAQ e base de conhecimento;
- horário de atendimento;
- handoff;
- fallback;
- logs por execução;
- inbox básico;
- publicação e rollback.

**Resultado:** um agente de atendimento responde a mensagens reais com controle operacional.

### Fase 3 — Agente de Vendas

**Objetivo:** transformar atendimento em aquisição e conversão.

**Entregas:**

- formulário de qualificação configurável;
- estágios de lead;
- conector CRM;
- criação e atualização de contato;
- agenda;
- follow-up automático com limites;
- identificação de intenção de compra;
- painel de conversão;
- aprovação humana para ações críticas.

**Resultado:** o agente coleta, qualifica, registra e encaminha oportunidades.

### Fase 4 — Hub de ferramentas e MCP

**Objetivo:** permitir que os agentes executem tarefas externas com segurança.

**Entregas:**

- catálogo de ferramentas;
- permissões por agente;
- conectores nativos;
- suporte a MCP;
- schemas de entrada e saída;
- classificação de risco;
- aprovação humana;
- tracing de tool calls;
- limites e circuit breaker.

**Resultado:** cada agente passa a ser capaz de executar processos, não apenas conversar.

### Fase 5 — Workflows e automação

**Objetivo:** conectar agentes a eventos e rotinas.

**Entregas:**

- gatilhos por webhook, horário, evento e mudança de status;
- editor visual de workflows;
- filas e retries;
- nós de condição, agente, ferramenta, espera e aprovação;
- integração com n8n;
- execução manual e agendada;
- histórico de runs.

**Resultado:** o Nexo se torna uma plataforma de automação orientada por agentes.

### Fase 6 — Agentes de Ads e tráfego

**Objetivo:** criar agentes especializados em aquisição e performance.

**Entregas:**

- conexão com Meta Ads;
- conexão com Google Ads;
- conexão com TikTok Ads;
- leitura de campanhas, grupos e anúncios;
- análise de métricas;
- recomendações de orçamento e criativos;
- geração de relatórios;
- aprovação antes de alterar ou publicar campanhas;
- integração com Analytics e conversões.

**Importante:** a primeira versão deve ser somente de **leitura e recomendação**. Alterações automáticas de orçamento, segmentação ou publicação devem entrar depois de auditoria e aprovação.

### Fase 7 — Marketplace e plataforma aberta

**Objetivo:** permitir que terceiros criem e distribuam agentes e ferramentas.

**Entregas:**

- templates públicos e privados;
- catálogo de agentes;
- pacotes de ferramentas;
- marketplace de conectores;
- API pública;
- SDK;
- webhooks de saída;
- configuração declarativa;
- CLI;
- versionamento e compatibilidade.

**Resultado:** o Nexo deixa de ser apenas um produto fechado e passa a operar como ecossistema.

## 10. Backlog priorizado

### P0 — Sem isso não existe plataforma funcional

| Item | Resultado esperado |
|---|---|
| Auth e workspace | Usuário e empresa isolados |
| Banco de domínio | Dados persistentes |
| API server-side | Nenhuma regra crítica no frontend |
| Secret manager | Tokens protegidos |
| Meta Cloud API | Primeiro canal real |
| Webhook | Entrada de eventos |
| Runtime | Agente responde e executa regras |
| Idempotência | Sem mensagens duplicadas |
| Logs e auditoria | Diagnóstico e rastreabilidade |
| Publicação real | Versão ativa verificável |

### P1 — Cria valor comercial rapidamente

| Item | Resultado esperado |
|---|---|
| CRM | Agente de vendas útil |
| Agenda | Conversão em reunião |
| Inbox humano | Operação híbrida |
| Base de conhecimento | Respostas com conteúdo próprio |
| Templates por vertical | Menor tempo de configuração |
| Métricas de conversão | Prova de valor |
| Evolution e Z-API | Mais opções de canal |
| Workflows | Automação além do chat |

### P2 — Expande a plataforma

| Item | Resultado esperado |
|---|---|
| MCP | Extensibilidade de ferramentas |
| Ads read-only | Agente de performance seguro |
| Aprovação de ações | Automação controlada |
| Marketplace | Ecossistema |
| API e CLI | Integração empresarial |
| Billing por uso | Modelo SaaS escalável |
| Multi-modelo | Redundância e escolha de custo |

## 11. Modelo de execução em conjunto

O trabalho deve ser organizado por **fatias verticais**, e não por telas isoladas. Cada fatia deve atravessar interface, backend, banco, integração, segurança e teste.

### Trilha A — Plataforma

Responsável por auth, workspaces, permissões, banco, secrets, billing, auditoria e deploy.

### Trilha B — Runtime

Responsável por eventos, filas, memória, prompts, ferramentas, MCP, retries e versões do agente.

### Trilha C — Canais

Responsável por Meta, Evolution, Z-API, webhooks, status de conexão e envio de mensagens.

### Trilha D — Verticais de negócio

Responsável por templates e ferramentas para atendimento, vendas, CRM, agenda, ads e tráfego.

### Trilha E — Experiência

Responsável pelo console, criação de agentes, inbox, workflows, métricas e diagnóstico.

Cada entrega deve passar por um contrato comum:

1. modelo de dados definido;
2. API server-side definida;
3. permissão definida;
4. segredo definido;
5. integração testada;
6. logs e erros definidos;
7. tela de operação criada;
8. teste automatizado e teste de fumaça;
9. documentação atualizada.

## 12. Primeira entrega conjunta recomendada

A primeira entrega não deve ser “AWS para agentes” completa. Deve ser uma demonstração operacional chamada **Nexo Atendimento + Vendas**.

### Jornada demonstrável

1. Usuário cria uma empresa e um workspace.
2. Conecta uma conta Meta Cloud API.
3. Cria um agente de atendimento a partir de um template.
4. Adiciona FAQ e horário de funcionamento.
5. Publica a versão do agente.
6. Um cliente envia mensagem pelo WhatsApp.
7. O agente responde usando a base configurada.
8. Um lead demonstra intenção de compra.
9. O agente coleta nome, necessidade e telefone.
10. O agente cria o lead no CRM.
11. O agente oferece horário disponível.
12. O operador acompanha conversa, execução e conversão no console.
13. O operador pode pausar, editar ou reverter o agente.

Essa jornada comprova a infraestrutura de atendimento, vendas, integração, runtime, ferramentas e observabilidade. Depois, os mesmos blocos podem ser reutilizados para marketing, ads e tráfego.

## 13. Critérios de sucesso

### Produto

- Um novo cliente cria o primeiro agente em menos de 15 minutos.
- O agente responde a mensagens reais sem intervenção técnica diária.
- O operador entende por que o agente respondeu, recusou ou transferiu.
- Uma alteração pode ser testada antes de entrar em produção.
- O cliente consegue reutilizar um agente em mais de um canal.

### Plataforma

- Todos os recursos possuem workspace e autorização.
- Todas as execuções possuem logs e correlação.
- Conectores podem ser revogados sem alterar o agente.
- Ferramentas possuem permissões e risco configuráveis.
- Falhas de provedor não derrubam o restante da plataforma.
- O sistema mede tokens, mensagens, execuções e custos.

### Negócio

- Atendimento reduz volume repetitivo.
- Vendas aumenta leads qualificados ou reuniões.
- O cliente percebe valor antes de contratar integrações avançadas.
- Templates por vertical reduzem o tempo de implantação.
- A plataforma pode cobrar por workspace, execução e consumo.

## 14. Decisões que devem ser tomadas agora

| Decisão | Recomendação inicial |
|---|---|
| Público inicial | Pequenas e médias empresas com atendimento e vendas via WhatsApp |
| Primeiro canal | Meta Cloud API |
| Primeiro modelo | xAI, mantendo abstração para múltiplos modelos |
| Primeiro vertical | Atendimento + vendas |
| Runtime inicial | Gerenciado pelo Nexo |
| MCP | Fase 4, depois do runtime básico |
| Ads/tráfego | Fase 6, inicialmente somente leitura e recomendação |
| Deploy | Aplicação web com banco, storage e workers separados quando necessário |
| Multi-tenancy | Workspace obrigatório em todas as entidades |
| Controle de ações | Aprovação humana para ações de alto risco |
| Billing | Medir desde o primeiro runtime, cobrar depois da validação do produto |

## 15. Próximos 10 passos

1. Confirmar o nome, público inicial e modelo comercial da plataforma.
2. Renomear o conceito de “Nexo Studio” para “Nexo Cloud” ou manter Studio como módulo de criação.
3. Definir o contrato de workspace, usuário, agente, versão, canal, ferramenta e execução.
4. Implementar autenticação, workspaces e persistência.
5. Criar o runtime mínimo com Meta Cloud API.
6. Migrar o playground para usar o mesmo pipeline do runtime real.
7. Implementar o agente de atendimento com FAQ, horário e handoff.
8. Implementar CRM e agenda para o agente de vendas.
9. Criar observabilidade, publicação e rollback.
10. Abrir a camada de ferramentas e MCP somente depois de a fatia Atendimento + Vendas estar funcionando ponta a ponta.

## 16. Síntese final

A transformação correta não é adicionar dezenas de integrações à aplicação atual. É criar uma **plataforma central de execução de agentes** e, sobre ela, adicionar famílias de agentes e conectores especializados.

A ordem deve ser:

```text
Workspace e identidade
    → persistência e permissões
    → runtime e webhooks
    → atendimento real
    → vendas e CRM
    → ferramentas e MCP
    → workflows
    → ads e tráfego
    → marketplace e API aberta
```

O protótipo já fornece uma boa camada de experiência e uma linguagem de produto coerente. O próximo passo é transformar essa experiência em um control plane persistente e ligar o fluxo a um runtime real. Se essa base for construída corretamente, agentes de atendimento, vendas, marketing, anúncios e tráfego poderão compartilhar a mesma infraestrutura, em vez de serem produtos separados.

## Referências do workspace

[1]: `src/lib/types.ts` "Tipos atuais de agentes, conexões e mensagens"

[2]: `src/lib/store.ts` "Estado local atual do protótipo"

[3]: `src/lib/ai.ts` "Integração server-side atual com xAI"

[4]: `src/lib/pipeline.ts` "Regras atuais de execução local"

[5]: `src/lib/codegen.ts` "Exportação atual para Python e n8n"

[6]: `src/components/publish-panel.tsx` "Fluxo atual de publicação"

[7]: `src/routes/connections.tsx` "Fluxo atual de conexões"

[8]: `.grok/references/data-and-auth.md` "Diretrizes de autenticação, dados e conectores"
