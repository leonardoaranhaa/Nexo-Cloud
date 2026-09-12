# Plano conjunto de execução — Nexo Cloud de Agentes

**Status do documento:** fonte de verdade operacional do repositório.

**Última consolidação:** 2026-09-12.

**Regra principal:** toda IA, agente de código ou pessoa que iniciar uma sessão de desenvolvimento deve ler este arquivo antes de analisar, planejar, editar ou executar qualquer alteração. Depois da leitura, deve subdividir a próxima etapa em uma menor fatia vertical, comparar o plano com o estado real do repositório e somente então continuar. A partir da próxima execução da B4, também deve executar `APLICAR_FONTES_RECOMENDADAS NEXO_CLOUD` conforme `FONTES-RECOMENDADAS-DESENVOLVIMENTO-NEXO.md`.

**Plano especializado vinculante:** `PLANO-EXECUCAO-AGENT-ENGINEERING-PLANE.md` detalha a evolução do Agent Engineering Plane. Após ler este plano mestre e o comando interno, toda sessão que atuar nessa frente deve ler o plano especializado integralmente, respeitar a ordem da Fase 0, aplicar as fontes recomendadas a partir da B4 e atualizar ambos os documentos ao concluir cada fatia.

## 1. Visão do produto

O Nexo Cloud é a **AWS dos agentes**: uma plataforma multi-tenant que fornece a infraestrutura, o ambiente de desenvolvimento, o runtime, as ferramentas, o conhecimento, as integrações, a governança e o catálogo necessários para criar, testar, indexar, publicar, operar, alugar, vender e evoluir agentes de inteligência artificial.

Assim como a AWS fornece infraestrutura para empresas construírem e executarem sistemas, o Nexo Cloud fornece infraestrutura especializada para pessoas e organizações construírem e executarem agentes. O produto não é apenas um chatbot builder ou um catálogo de automações. Ele é o ambiente de referência para o ciclo de vida completo de agentes comandados por inteligência artificial.

O Nexo terá duas frentes complementares:

1. **Infraestrutura de agentes:** control plane, workspaces, ambientes, desenvolvimento, runtime, memória, RAG, ferramentas, MCP, conectores, workflows, observabilidade, segurança e métricas.
2. **Ecossistema de agentes:** agentes próprios de alto nível criados pelo Nexo, agentes de usuários, templates, produtos prontos, agentes para uso interno, locação, venda, instalação, customização, teste e publicação.

A referência da AWS é arquitetural: organização por serviços, recursos provisionáveis, permissões, credenciais, execução, logs, métricas e automações. O Nexo não deve copiar indiscriminadamente a quantidade de serviços da AWS; deve traduzir a utilidade da nuvem para o domínio dos agentes.

A plataforma deve começar por agentes de **Atendimento + Vendas**, com canais, conhecimento, CRM, handoff, workflows, ferramentas e métricas. Outras famílias, como suporte, marketing, anúncios, tráfego e operações, entram depois que os contratos multi-tenant, runtime, conectores, permissões, auditoria e medição estiverem estáveis. A prioridade inicial não limita a visão final: o Nexo deve suportar agentes de qualquer tipo de negócio que possa ser modelado, conectado e governado.

**Diretriz de conectividade:** WhatsApp é somente o primeiro canal operacional do MVP, não o nicho do produto. Evolution e Meta são os primeiros adapters de mensageria; a camada de conectores deve permanecer provider-agnostic e crescer para APIs HTTP, CRM, agenda, e-mail, voz, anúncios, tráfego, analytics, pagamentos, storage, bancos, sistemas internos, webhooks, workflows e servidores MCP. Cada novo conector deve reutilizar o mesmo contrato de workspace, Secret Resolver, healthcheck, Tool Gateway, permissões, auditoria, quotas e readiness, sem transformar um fornecedor em fonte de verdade da plataforma.

> O MVP EARLY não é uma aplicação separada nem uma demo descartável. Ele é o primeiro núcleo funcional permanente do próprio Nexo Cloud e deve continuar sendo ampliado sobre os mesmos contratos.

### 1.1 Definição estratégica permanente

O Nexo Cloud deve permitir que um usuário:

- crie um agente com assistência de inteligência artificial;
- configure persona, políticas, objetivos, ferramentas e limites;
- carregue e indexe sistemas, documentos, bases e conhecimento próprio;
- teste o agente em ambiente seguro antes da publicação;
- conecte canais e sistemas externos;
- publique, monitore, reverta e atualize versões;
- instale agentes próprios do catálogo do Nexo;
- alugue, compre ou utilize agentes prontos conforme a oferta;
- crie agentes privados para sua organização;
- disponibilize agentes para outras pessoas quando o modelo comercial e a governança permitirem;
- acompanhar qualidade, conversão, custo, uso, segurança e evolução.

Os agentes próprios do Nexo devem ser tratados como produtos de alto valor, não como exemplos descartáveis. Cada produto deve possuir contrato de capacidade, manifesto, versão, oferta, entitlement, instalação, customização, métricas, política de atualização e mecanismo de rollback.

## 2. Camadas do produto

| Camada | Responsabilidade | Estado atual |
|---|---|---|
| Control Plane | organizações, workspaces, membros, agentes, versões, conexões, permissões e catálogo | Implementado para o núcleo local/preview |
| Agent Runtime | filas, contexto, decisão, RAG, ferramentas, dispatch, handoff e observabilidade | Implementado para o núcleo local/preview |
| Integration Layer | canais, APIs, CRM, MCP, webhooks e adapters server-side | Evolution e Meta fundacionais implementados; arquitetura preparada para expansão multi-provider |
| Experience Layer | console, Home, Settings, Inbox, Marketplace, Runs, Metrics e Workflows | Implementado em nível funcional; experiências avançadas ainda evoluem |
| Learning Layer | eventos sanitizados, avaliação, casos, chunks e candidatos de melhoria | Fundação e laboratório implementados; gate de promoção ainda pendente |
| Infrastructure Layer | PostgreSQL gerenciado, storage, secrets, filas, workers, observabilidade e deploy | Preparada localmente; AWS permanentemente postergada |

## 3. Modelo AWS-like do Nexo

| Conceito de nuvem | Equivalente no Nexo |
|---|---|
| Conta | Organização |
| Região ou ambiente | Workspace e ambiente |
| IAM | Memberships, papéis e permissões |
| Compute | Agent Runtime e workers |
| Lambda | Ferramenta ou ação sob demanda |
| API Gateway | Webhooks e APIs dos agentes |
| SQS/EventBridge | Filas, eventos, retries e gatilhos |
| RDS | Banco operacional de agentes, conversas e eventos |
| S3 | Arquivos, documentos e mídia |
| CloudWatch | Logs, métricas, alertas e tracing |
| Secrets Manager | Secret Resolver e secrets por conexão |
| Marketplace | Catálogo de agentes próprios, agentes de usuários, produtos, ferramentas e integrações |
| Billing | Medição de mensagens, tokens, execuções e ferramentas |

A interface deve falar em agentes, canais, ferramentas, tarefas, automações, conhecimento, métricas e resultados. A analogia com a AWS não deve dominar a linguagem do usuário final.

## 4. Produto mínimo correto

O MVP funcional deve provar dois fluxos de alto valor:

1. **Agente de Atendimento:** responde em um canal conectado, usa conhecimento publicado, respeita horário, registra a conversa e transfere para uma pessoa quando necessário.
2. **Agente de Vendas:** identifica intenção, coleta critérios, cria ou atualiza o lead, qualifica, atribui responsável, agenda follow-up e exibe métricas.

O núcleo deve permitir criar um workspace, criar agentes a partir de templates, configurar canais, publicar versões, receber mensagens, registrar eventos, operar o Inbox, usar ferramentas autorizadas, acompanhar runs e reverter uma publicação.

### 4.1 Disponibilidade contextual de capacidades

O Nexo Cloud é uma plataforma de engenharia de agentes, não um produto em que todas as capacidades aparecem indistintamente em todas as telas ou para todos os recursos. Cada capacidade deve estar disponível somente no contexto em que faz sentido, conforme o tipo de agente, workspace, ambiente, versão publicada, conexão, permissões, produto instalado e contrato da ferramenta. A experiência deve seguir a lógica de uma nuvem de engenharia, como na AWS: serviços, APIs, recursos e operações possuem escopo, pré-requisitos e políticas próprias; não devem ser expostos globalmente apenas para preencher a interface.

Consequentemente, ferramentas de CRM, agenda, MCP, workflows, Marketplace, canais e operações sensíveis devem ser descobertas e autorizadas por contexto. O frontend pode explicar disponibilidade e pré-requisitos, mas a decisão efetiva deve ocorrer server-side, no workspace, na versão publicada e no Tool Gateway. Capacidades não aplicáveis devem permanecer ocultas ou explicitamente indisponíveis, sem mocks que sugiram que estão ativas.

### 4.2 Próximos passos de experiência

Depois da explicitação do contexto no shell, a evolução da experiência deve seguir esta ordem: separar Integrate de Build na navegação; dividir a tela do agente em configuração, conhecimento, ferramentas, testes, versões e publicação; apresentar disponibilidade, dependências, risco e escopo para cada capacidade; separar catálogo, instalações e atualizações no Marketplace; e distinguir configuração, saúde e operações destrutivas dos conectores. Cada etapa deve preservar a regra de que o recurso só aparece ou fica acionável quando o workspace, ambiente, versão e permissões o tornam aplicável.

A navegação agora materializa a primeira etapa: **Build** concentra Agentes e Marketplace, enquanto **Integrate** concentra Conectores. A seção deve crescer com Conhecimento, Ferramentas e MCP somente quando esses recursos possuírem contratos próprios de instalação, escopo e autorização.

A tela de cada agente agora materializa o ciclo de vida em áreas persistentes: **Configuração**, **Conhecimento**, **Ferramentas**, **Testes**, **Versões** e **Publicação**. Os aliases antigos `create`, `test` e `publish` continuam sendo aceitos nos links existentes e são normalizados para as novas áreas, evitando quebra de navegação durante a migração.

Na área **Ferramentas**, cada capacidade deve ser apresentada como recurso contextual, não como toggle isolado. O contrato mínimo de apresentação é: estado atual, dependências, escopo de atuação, risco operacional e ação de configuração. O estado deve derivar do contexto efetivo do agente e workspace — por exemplo, canal conectado, palavras-chave de handoff e base de conhecimento disponível — e não de uma disponibilidade global presumida.

A área **Conhecimento** segue o mesmo contrato para suas fontes: notas internas e FAQ publicada possuem estado próprio, dependências explícitas, escopo de consumo pelo runtime, risco e ação de configuração. FAQs incompletas ficam em `Configuração pendente` e não devem ser tratadas como fonte pronta para uso.

A área **Publicação** deve funcionar como uma superfície de readiness operacional. Canal, cenários de teste, handoff e versão candidata são cards independentes, com estados, dependências, escopo, risco e ações próprias. A publicação deve ser bloqueada quando os requisitos mínimos — canal conectado e cenário de teste configurado — não estiverem atendidos.

O fluxo ponta a ponta deve possuir um único gate de publicação: ações globais do agente levam à área **Publicação** para revisão contextual, e somente o comando de publicação dessa área executa a criação da versão. Nenhum atalho deve contornar os requisitos ou criar uma publicação silenciosamente.

O contexto de workspace deve ser orientado ao usuário: quando houver um único workspace, ele deve ser selecionado automaticamente; quando houver múltiplos, o seletor deve explicar que se trata do projeto ou operação onde vivem agentes, conexões, testes e publicações. A ausência de contexto deve orientar a escolha sem exibir recursos de outro workspace.

## 5. Estado real consolidado

### 5.1 Fundamento multi-tenant e Control Plane

**Estado: concluído para o MVP local/preview.**

Já existem organizações, workspaces, memberships, papéis, autorização server-side, agentes, conexões, conversas, mensagens, eventos, versões, publicação, rollback, contexto global de organização/workspace/ambiente e isolamento por workspace.

Ainda faltam para produção: ambientes reais Development/Staging/Production, banco gerenciado, storage, observabilidade externa, deploy permanente, configuração definitiva de secrets, quotas e alertas operacionais. A readiness de conexões agora diferencia configuração preenchida, healthcheck pendente, healthcheck saudável e healthcheck degradado/indisponível.

### 5.2 Atendimento, canais e Agent Runtime

**Estado: núcleo funcional concluído.**

O runtime possui fila durável, leases, retries, carregamento de contexto, memória de conversa, decisão estruturada, fallback, horário, handoff, RAG, dispatch outbound, logs e integração com CRM.

Evolution possui onboarding, Secret Resolver, adapter, inbound, delivery status, deduplicação e dispatch. Meta possui onboarding administrativo, verificação de webhook, HMAC-SHA256 e handler persistente. A validação ponta a ponta inbound → runtime → outbound existe em teste local.

Ainda faltam validações com credenciais reais em produção, operação permanente de webhooks, rotação real de secrets e monitoramento externo.

### 5.3 Vendas e CRM

**Estado: núcleo comercial implementado; conversão completa parcial.**

Estão implementados `lead.create_or_update`, `lead.update_qualification`, política de qualificação por produto, `lead.assign_owner`, distribuição round-robin, `lead.create_follow_up`, cancelamento, proteção de campos, estados comerciais e painel de métricas.

 A agenda possui provisionamento de slots, consulta nativa `calendar.list_availability`, reserva idempotente `calendar.book_slot` e console operacional em `/calendar`, com isolamento por workspace, filtros por status, bloqueio manual e operação de reservas. Ainda faltam ingestão automática de disponibilidade externa, aprovação configurável para escritas, CRM externo e catálogo/disponibilidade conectado.

### 5.4 RAG operacional

**Estado: fundação persistente implementada.**

Existem documentos, chunks, fontes, publicação, snapshots, recuperação lexical, filtros multi-tenant e bloqueio de resposta sem evidência suficiente.

Ainda faltam ingestão assíncrona completa, upload de arquivos pela interface, extração de documentos, embeddings reais, índice vetorial, recuperação híbrida semântica, reranking e avaliação de cobertura.

### 5.5 Tool Registry, conectores e MCP

**Estado: governança e execução multi-round do núcleo nativo implementadas; primeiro hardening do Tool Gateway concluído; demais endurecimentos operacionais pendentes.**

Existem catálogo, schemas, risco, permissões por versão publicada, Tool Gateway, Secret Resolver, MCP Runtime, aprovações, idempotência do runtime nativo, auditoria e integração de tool calling no runtime. O primeiro hardening pré-B4 agora exige workflow publicado, agente publicado, permissão ativa da tool na versão publicada e aprovação persistida para escritas aprovadas; a decisão ocorre antes do adapter e permanece workspace-scoped.

A ferramenta `lead.create_or_update` já é executável pelo runtime quando autorizada. O ciclo multi-round foi fechado para o núcleo nativo com protocolo estruturado: o primeiro round recebe as ferramentas publicadas, o servidor executa chamadas autorizadas, e o segundo round recebe a mensagem assistant com `tool_calls` e resultados `tool`, sem novas ferramentas disponíveis. Cada resultado retorna estado sanitizado de sucesso, aprovação, falha ou bloqueio; retries reutilizam a execução idempotente; falhas do segundo round preservam a resposta inicial segura. CRM, handoff, follow-up e agenda possuem registros nativos no Tool Registry, incluindo `calendar.book_slot`, contratos de entrada/saída versionados e validação dos resultados antes do retorno ao modelo. Ainda faltam adapters externos, circuit breaker, quota/rate limit de tokens/custo e tracing completo.

### 5.6 Workflows e automação

**Estado: motor durável e editor visual orientado a nós implementados; experiência completa em evolução.**

Existem versões, compilação de grafos, condições, eventos internos, webhooks, execução manual, scheduler, filas, leases, retries, espera, retomada, aprovações, histórico e follow-ups agendados.

O editor `/workflows` agora segue o padrão de automação visual por nós: configuração explícita de agentes, ferramentas, condições e aprovações; conexões visíveis; validação de ponto de entrada único, conectividade, duplicidades e configurações obrigatórias; e bloqueio de publicação quando a definição não é executável. Os testes de integração do motor usam caminhos portáveis e cobrem eventos, scheduler, retries, espera, retomada, publicação e isolamento multi-tenant.

O motor agora também suporta mapeamento por caminhos `$.campo.subcampo`, nós dedicados de transformação com atribuições, configuração server-side de workflow de erro para falhas terminais (com payload sanitizado e limite anti-loop), telemetria persistida por nó e replay preservando a versão original. A integração oficial com n8n deve permanecer opcional: o contrato nativo do Nexo é a fonte de verdade, enquanto uma ponte futura poderá importar/exportar apenas definições compatíveis e sanitizadas. Ainda faltam circuit breaker, tracing distribuído e painel avançado de comparação de reprocessamentos.

### 5.7 Marketplace interno

**Estado: ciclo de instalação, atualização e rollback implementado para MVP local/preview.**

Existem produtos, versões, ofertas, entitlements, instalações, manifestos, catálogo, detalhe, instalação, agente draft, customização, publicação e vínculo por workspace. O catálogo próprio agora contém **Nexo Atendimento + Qualificação** e **Nexo Vendas + Conversão**, com manifestos operacionais versionados, capacidades, objetivos, guardrails, canais compatíveis e ferramentas nativas declaradas.

As instalações agora possuem lista geral em `/marketplace/installed`, revisão persistida de configuração, detecção de versão disponível, plano de impacto, preservação de customizações editáveis, atualização explícita em staging, rollback determinístico por workspace, health status contextual e métricas reais de uso dos últimos sete dias. A instalação valida as ferramentas globais declaradas pelo manifesto e cria permissões iniciais no draft; a publicação copia essas permissões para a nova versão, preservando as capacidades do produto no runtime. A publicação do agente sincroniza a instalação para `active`. Saúde e uso são calculados server-side a partir de canais, conversas, mensagens, jobs, execuções e deliveries do próprio workspace, com atualização automática no painel. Ainda faltam pausa, alertas configuráveis, custo por uso, checkout, assinatura, compra, locação, billing e marketplace de terceiros. Essas funções comerciais não devem ser simuladas antes de existir entitlement persistido e contrato de billing. O contrato comercial está documentado em `MODELO-PRECIFICACAO-NEXO-CLOUD.md`, inspirado em plano base, consumo medido, franquias, budgets, commitments e ofertas Marketplace.

### 5.8 Nexo Learning RAG e Improvement Lab

**Estado: fundação, avaliação, casos e laboratório implementados; promoção pendente.**

Existem eventos sanitizados, consentimento, mascaramento, avaliações, casos, chunks de engenharia, recuperação interna, candidatos versionados e revisão. Dados privados de clientes não entram no aprendizado global por padrão.

Ainda faltam avaliação offline contra regressões, gate formal de promoção, publicação gradual, comparação entre versões, A/B testing, painel operacional e eventual separação física do Learning Store.

### 5.9 Experiência principal

**Estado: funcional.**

A Home, a busca global, o contexto de workspace, a navegação de serviços, o Marketplace, Minhas Instalações, Inbox, Metrics e `/settings` estão implementados. A linguagem antiga do estúdio foi reduzida.

Ainda faltam configurações server-side completas, governança por papel, configuração por ambiente, onboarding guiado e refinamento operacional de estados vazios e saúde da plataforma.

### 5.10 Ambiente de desenvolvimento assistido por IA

**Estado: blueprint persistido, avaliações offline, propostas governadas de tools e geração de workflows draft implementados.**

O wizard `/create` agora transforma o briefing do usuário em um blueprint inicial revisável, contendo tipo de agente, persona, prompt, objetivos, capacidades, limites, FAQs, notas e cenários de teste. O blueprint é persistido por workspace e pode ser editado na configuração do agente, com autosave dos objetivos, capacidades e guardrails. A fatia B1 adicionou cenários estruturados, endpoint server-side autenticado, execução offline reutilizando decisão e RAG, expectativas de resposta/handoff/tools, persistência de resultados em tabelas próprias e snapshots sanitizados no Learning RAG. A fatia B2 adicionou geração determinística de propostas de tools nativas confirmadas, schemas preservados do Tool Registry, risco e aprovação derivados server-side, tools workspace-scoped em `review`, propostas `draft`, idempotência e endpoint de listagem. A fatia B3 adicionou vínculo idempotente entre blueprint e workflow, geração de grafo compilável em `draft`, preservação de versões publicadas, capacidades pendentes e materialização condicional de tools aprovadas, autorizadas e compatíveis com adapters do executor.

As avaliações B1, a geração B2 e a geração B3 não criam jobs de produção, mensagens, deliveries, chamadas externas ou publicação automática. Tools B2 não recebem permissões de agente e não podem ser resolvidas pelo runtime enquanto estiverem em `review`. Workflows B3 não criam runs e somente incluem tools quando há proposta aprovada, tool ativa, permissão habilitada na versão draft e adapter de workflow confirmado. Ainda faltam Evaluation Harness comparável entre versões, indexação de documentos e sistemas e testes automatizados de qualidade antes da publicação.

### 5.11 Nexo Bot

**Estado: integração LLM, protocolo de ações e auditoria operacional implementados.**

O Nexo Bot está disponível na Home como assistente contextual. Ele consulta o Claude server-side com contexto mínimo do workspace, responde em linguagem natural e pode propor navegação, criação de agente ou provisionamento de horário. Escritas exigem confirmação explícita e passam por nova autorização server-side antes da execução. A rota `/nexo-bot/audit` registra consultas, propostas, confirmações, sucessos e falhas com sanitização, filtros por workspace e timeline operacional.

Ainda faltam memória persistente do assistente, streaming, quotas próprias, mais ações com políticas de aprovação, correlação de `trace_id`, retenção configurável e integração com o Learning RAG. Publicação, exclusão, credenciais, permissões, billing e chamadas externas permanecem bloqueados nesta fase.

### 5.12 AWS, billing e produção

**Estado: billing conceitualmente modelado; infraestrutura AWS e cobrança automática postergadas.**

A documentação IaC e AWS existe, mas a implantação permanente não está ativa. O preview local utiliza PGlite e assets empacotados. Não existe ainda infraestrutura permanente com banco gerenciado, workers, filas, storage, secrets, alertas, custo por uso e billing. O modelo de precificação v1 separa plano base, consumo medido, capacidades provisionadas, quotas operacionais, budgets, entitlements, custos de terceiros e ofertas de compromisso; nenhum preço provisório foi codificado como preço de produção.

A postergação é temporária e não remove AWS do roadmap. Ela não deve bloquear o fechamento do núcleo funcional local. Como primeira fatia de readiness operacional, o Agent Runtime agora aplica quotas diárias server-side por workspace e por agente, com consumo persistido e isolamento por workspace.

## 6. Migrations, rotas e validação atual

O repositório possui migrations até `0045_agent_blueprint_workflows.sql`, cobrindo Marketplace, protocolo de decisão, RAG, CRM, Learning, Improvement Lab, domínio de execuções de ferramentas, blueprints persistidos, avaliações offline, disponibilidade e reserva de agenda, contratos de ferramentas comerciais, revisões de instalação, quotas diárias do runtime, auditoria do Nexo Bot, workflows de erro, produtos próprios do Nexo, propostas governadas de tools e vínculos de workflows gerados.

As rotas principais são:

```text
/
/agents
/create
/connections
/inbox
/runs
/workflows
/metrics
/settings
/marketplace
/marketplace/installed
/marketplace/agents/:productId
/marketplace/installed/:installationId
```

A validação técnica consolidada inclui typecheck, lint sem erros, build, preview local e suíte automatizada com **165 testes aprovados e 0 falhas** no último ciclo validado. O lint ainda emite sete warnings preexistentes fora desta fatia.

Commit de referência desta consolidação de código:

```text
2dc9f0f feat: generate governed workflow drafts from blueprints
```

## 7. Roadmap oficial atualizado

### Fase 1 — Fundamento multi-tenant

**Status: concluída para MVP local/preview.**

Manter compatibilidade e fechar produção apenas depois do núcleo funcional.

### Fase 2 — Agent Runtime e Atendimento

**Status: concluída para MVP local/preview.**

Próximas ações: validação real de canal, healthchecks, operação de webhook e melhoria de Inbox/handoff. A validação com host persistente, Docker e credenciais reais está **postergada por decisão do usuário**; o desenvolvimento interno em local/preview continua com fixtures e contratos, sem declarar canal real validado.

### Fase 3 — Agente de Vendas

**Status: núcleo CRM e ferramentas conversacionais concluído; fechamento pendente.**

Próximas ações: aprovação configurável para escritas de agenda, ingestão e reconciliação de disponibilidade externa, integração com CRM externo opcional e fechamento da operação comercial com critérios de aceite.

### Fase 4 — Hub de ferramentas e MCP

**Status: fundação e ciclo multi-round concluídos para o núcleo nativo; execução completa pendente.**

Próximas ações: completar Tool Gateway para adapters externos necessários, validar output schemas, circuit breaker, quota/rate limit e tracing completo.

### Fase 5 — Workflows e automação

**Status: núcleo durável concluído; experiência completa pendente.**

Próximas ações: executor de nós `agent` e `tool`, editor visual, mapeamento de dados, transformações, n8n e painel de runs.

### Fase 6 — Agentes de Ads e tráfego

**Status: não iniciada.**

Começar somente depois de estabilizar Fases 3–5. A primeira versão deve ser somente leitura e recomendação. Alterações de orçamento ou publicação exigem aprovação.

### Fase 7 — Marketplace e plataforma aberta

**Status: Marketplace interno parcial; plataforma aberta não iniciada.**

Completar instalações, atualizações e operação do catálogo interno antes de abrir para terceiros.

### Sequência futura de conectores e validação de Agents as a Service

Esta sequência é roadmap futuro e não altera a prioridade do próximo ponto de partida obrigatório. Cada conector deverá usar `connector_definition` versionada, instância por workspace, Secret Resolver, healthcheck, Tool Registry, Tool Gateway, permissões congeladas, auditoria, idempotência, quotas e readiness.

1. **Meta Cloud API:** consolidar o segundo adapter de canal sem duplicar o runtime de mensageria. A validação deve cobrir autenticação, webhook, assinatura, envio e status de entrega.
2. **Google Calendar:** conectar a agenda externa com OAuth, disponibilidade, reservas idempotentes, timezone, renovação de token, aprovação para escrita e reconciliação.
3. **REST/OpenAPI genérico:** permitir APIs empresariais configuradas por contrato publicado, com schema de entrada e saída, autenticação server-side, timeout, retries, rate limit e risco por operação. O modelo não poderá inventar endpoints.
4. **MCP Connector governado:** registrar servidores por workspace, descobrir ferramentas em revisão, aprovar allowlists, validar schemas, controlar transporte, autenticação, limites, timeout e auditoria. MCP será fonte de tools, não substituto do Tool Gateway.
5. **HubSpot ou CRM externo equivalente:** validar OAuth, contatos, propriedades, estágios, owners, deduplicação, idempotência, sincronização e conflitos com o CRM interno.
6. **E-mail transacional:** adicionar envio, templates, anexos controlados, entrega, bounce, replies e threads sob consentimento, limites e auditoria.
7. **Ads e Analytics somente leitura:** iniciar com campanhas, métricas, conversões e recomendações. Alterações de orçamento, publicação ou pausa exigirão aprovação explícita e política de alto risco.

Z-API não é prioridade desta sequência, porque acrescenta principalmente outro provider de WhatsApp sem ampliar tanto a cobertura de capacidades empresariais. Ads e Analytics permanecem subordinados à Fase 6 e não devem iniciar antes da estabilização das Fases 3–5.

**Escopo futuro — Agent as a Service:** depois do fechamento do Marketplace interno, avaliar uma API pública versionada (`/v1`) para que plataformas externas consumam agentes publicados. O escopo inclui API keys/OAuth, escopos por workspace e ambiente, execução síncrona e assíncrona, idempotência, quotas, medição de uso, webhooks assinados, OpenAPI e SDKs. Não implementar nesta etapa nem expor rotas internas diretamente.

### Learning RAG

**Status: fundação e laboratório implementados; gate de promoção pendente.**

Retomar depois do fechamento do núcleo de vendas, ferramentas e Marketplace interno.

O Evaluation Harness não deve iniciar antes do hardening pré-B4 identificado na auditoria de 2026-09-12: Tool Gateway único com autorização da versão publicada, idempotência estável, tool/version congelada, output schema e redaction recursiva; validação runtime de entradas; snapshots coerentes de B1; e gates de lint, testes e Playwright verdes.

### AWS e infraestrutura permanente

**Status: postergada.**

Retomar após o núcleo demonstrável estar fechado e validado com canal real.

### Billing

**Status: não iniciado.**

Não simular compra, assinatura ou locação. Implementar após definir entitlement, limites, uso e contrato comercial.

## 8. Próximo ponto de partida obrigatório

A próxima execução deve seguir esta ordem, sem iniciar Ads, billing, Marketplace aberto ou AWS permanente antes de concluir o ciclo abaixo:

1. completar o ciclo multi-round de tool calling; **concluído para o núcleo nativo**;
2. expor CRM, handoff e follow-up como ferramentas nativas autorizáveis; **concluído para o núcleo nativo**;
3. implementar agenda e disponibilidade como conector ou ferramenta controlada;
4. fechar atualização e rollback de instalações do Marketplace;
5. criar `marketplace/installed` e a operação de Minhas Instalações;
6. criar e validar templates prontos de Atendimento e Vendas; **concluído e revalidado com os produtos próprios, manifestos, permissões, instalação, customização, isolamento, atualização e rollback**;
7. executar validação com conexão Meta ou Evolution real;
8. revisar observabilidade, quotas e readiness de produção; **relatório server-side, painel visual em `/metrics` e checklist explícita de aprovação para produção implementados no preview, agregando conexões, jobs, quotas, logs e critérios manuais; observabilidade externa e alertas seguem pendentes**;
9. retomar AWS somente após o núcleo demonstrável passar pelos critérios de aceite.

### 8.1 Prioridade interna durante a postergação de conexões reais

Enquanto host, Docker e credenciais reais não estiverem disponíveis, a execução deve concentrar-se na construção da plataforma em local/preview. As fatias B1, B2 e B3 estão concluídas em modo offline/evaluation; a próxima frente interna é o Evaluation Harness comparável (`B4`). A próxima sessão que iniciar B4 deve executar `APLICAR_FONTES_RECOMENDADAS NEXO_CLOUD` antes de planejar a implementação. Essas fatias não podem disparar chamadas externas reais, publicar versões automaticamente ou transformar fixtures em evidência de produção.

A validação real de Meta/Evolution permanece registrada como pendência operacional e deverá ser retomada quando o host estiver preparado. Nenhuma sessão deve tentar contornar essa dependência criando credenciais no repositório, simulando healthcheck saudável ou tratando o preview como canal de produção.

### 8.2 Gate de refatoração identificado pela auditoria

**Status: obrigatório antes da B4; ainda não implementado.**

A varredura completa com as fontes recomendadas confirmou necessidade de hardening compartilhado antes do Evaluation Harness. O primeiro item foi concluído: o Tool Gateway de workflows não aceita mais `node.config.approved` como autoridade; exige workflow publicado, agente publicado, permissão ativa da tool na versão publicada e aprovação persistida quando requerida, antes do adapter. A execução grava `agent_id`, `agent_version_id`, `approval_id` e `approved_by`. Permanecem pendentes idempotência externa estável, congelamento de tool/version no snapshot, output schema/redaction recursiva, bloqueio de conexões não saudáveis e convergência com o dispatcher nativo.

Também foram confirmados: B1 avalia configuração draft/publicada com tools publicadas sem snapshot imutável conjunto; validators server-side ainda são identidade TypeScript sem validação runtime uniforme; o store frontend persiste inbox/events sem escopo de workspace; o wizard não persiste o `connectionId` selecionado no vínculo backend; o lint falha em duas regex do Evolution; e a matriz Playwright mostrou overflow mobile em `/agents`, `/connections` e `/create`.

Antes de iniciar B4, a próxima fatia deve criar testes de falha e corrigir, nesta ordem: (1) idempotência estável de efeitos externos; (2) congelamento de tool/version, output, redaction e readiness do Tool Gateway; (3) snapshots coerentes de B1; (4) isolamento/ações local-only do frontend e smoke Playwright integrado. O documento `INSTRUCAO-AUDITORIA-FONTES-RECOMENDADAS-NEXO.md` contém a matriz completa de evidências; `INSTRUCAO-HARDENING-TOOL-GATEWAY-VERSAO-PUBLICADA.md` registra a execução concluída do item 1. Nenhuma sessão deve declarar a B4 iniciada enquanto os gates restantes estiverem pendentes.

Cada item deve ser executado como uma fatia vertical independente, com migration apenas quando necessária, contrato server-side, teste de isolamento, teste de integração, typecheck, build e preview.

## 9. Protocolo obrigatório de cada sessão

Ao iniciar qualquer sessão, a IA deve:

1. localizar a raiz do repositório;
2. ler este arquivo integralmente;
3. ler `COMANDO-INTERNO-DESENVOLVIMENTO-NEXO-CLOUD.md`;
4. ler os documentos especializados relacionados ao próximo item;
5. executar `APLICAR_FONTES_RECOMENDADAS NEXO_CLOUD` quando a sessão iniciar B4 ou qualquer fatia posterior;
6. verificar `git status`, último commit, migrations, rotas, scripts e testes;
7. confrontar o estado real do código com este documento;
8. identificar a primeira etapa incompleta do próximo ponto de partida;
9. subdividir essa etapa em uma menor fatia vertical reversível;
10. registrar objetivo, arquivos afetados, riscos, dependências, critério de aceite e classificação de alinhamento;
11. implementar, testar, revisar o diff e atualizar este documento quando o estado do roadmap mudar.

Nenhuma IA deve iniciar uma nova frente apenas porque ela aparece em uma documentação antiga. A prioridade é sempre o **Próximo ponto de partida obrigatório** deste arquivo, salvo decisão explícita do usuário.

## 10. Critérios permanentes de segurança e arquitetura

Toda entidade de negócio deve possuir `workspace_id` ou vínculo equivalente validado no backend. Nenhuma regra crítica deve depender do frontend. O modelo não recebe secrets e não executa funções diretamente. Ferramentas passam pelo Tool Gateway, Connector Runtime ou MCP Runtime autorizado. Agentes de produção executam versões publicadas. Alterações sensíveis possuem aprovação, idempotência, timeout, sanitização e auditoria. O runtime não deve bloquear atendimento por falha best-effort do Learning.

A plataforma não deve inventar endpoints externos, payloads, credenciais, tabelas ou capacidades não confirmadas. Toda integração deve ter contrato verificável, tratamento de erro, teste ou fixture e documentação da suposição restante.

## 11. Documentos relacionados no repositório

- `COMANDO-INTERNO-DESENVOLVIMENTO-NEXO-CLOUD.md`
- `ARQUITETURA-EXECUCAO-FERRAMENTAS-MCP-CONECTORES.md`
- `PLANO-WORKFLOWS-AUTOMACAO-NEXO.md`
- `MODELO-DADOS-MULTI-TENANT.md`
- `PLANO-EXECUCAO-FUNCIONAL.md`
- `docs/CONNECTOR-RUNTIME-SECRET-RESOLVER.md`
- `B2-GERACAO-GOVERNADA-DE-TOOLS.md`
- `B3-GERACAO-ASSISTIDA-DE-WORKFLOWS.md`
- `FONTES-RECOMENDADAS-DESENVOLVIMENTO-NEXO.md`
- `INSTRUCAO-AUDITORIA-FONTES-RECOMENDADAS-NEXO.md`
- `INSTRUCAO-HARDENING-TOOL-GATEWAY-VERSAO-PUBLICADA.md`
- `README.md`

Os documentos especializados complementam este plano. Em caso de conflito, este plano define a prioridade de produto e o comando interno define o método obrigatório de execução.

## 12. Histórico de consolidação

| Data | Consolidação |
|---|---|
| 2026-09-10 | Estado confrontado com código, migrations, rotas, testes e documentos compartilhados. Registrados os módulos implementados, as lacunas e a ordem obrigatória de continuidade. |
| 2026-09-11 | Validação Meta executada no preview: handshake e POST assinado processados pelo agente; envio real permaneceu bloqueado pela lista de destinatários da Meta. Implementada a primeira fatia de readiness server-side (`getWorkspaceReadiness`) com teste, typecheck e build aprovados. |
| 2026-09-11 | Painel visual de readiness operacional integrado à página `/metrics`, com status, conexões, fila, quota diária, execuções e blockers; typecheck, testes e build aprovados. |
| 2026-09-11 | Checklist de publicação em produção adicionada ao painel, separando critérios automáticos aprovados/bloqueados e validações manuais de cenários, handoff, permissões e rollback. |
| 2026-09-11 | Gate de publicação efetivo: botão desabilitado para canal sem healthcheck saudável, cenários ausentes ou backend indisponível; `publishAgent` também bloqueia server-side e possui teste de isolamento. |
| 2026-09-12 | Plano mestre revisado contra o repositório: migrations atualizadas até `0042`, Tool Registry alinhado ao multi-round nativo concluído, agenda removida da lista de pendências já entregues e sequência futura de conectores registrada sem iniciar nova implementação. |
| 2026-09-12 | Por decisão do usuário, host persistente, Docker, credenciais e validação real de Meta/Evolution foram postergados. A continuidade interna foi liberada em local/preview pelo Agent Engineering Plane, começando pela fatia B1 de cenários isolados. |
| 2026-09-12 | Fatia B2 concluída em local/preview: propostas determinísticas de tools nativas, schemas validados, risco/aprovação server-side, tools em `review`, propostas `draft`, isolamento, idempotência e endpoints autenticados. Suíte passou com 155 testes, typecheck e build aprovados. Próxima prioridade interna: B3. |
| 2026-09-12 | Fatia B3 concluída em local/preview: workflow draft compilável por blueprint, vínculo idempotente, tools condicionadas a aprovação/permissão/adapter, preservação de snapshot publicado, nenhum run automático e isolamento. Suíte passou com 158 testes, typecheck, build e preview aprovados. Próxima prioridade interna: B4. |
| 2026-09-12 | Descoberta de fontes externas de engenharia documentada em `FONTES-RECOMENDADAS-DESENVOLVIMENTO-NEXO.md`. O comando raiz `APLICAR_FONTES_RECOMENDADAS NEXO_CLOUD` passa a ser obrigatório a partir da próxima execução da B4, sem substituir os contratos internos de segurança, workspace e Tool Gateway. |
| 2026-09-12 | Varredura completa aplicada às fontes recomendadas em cinco domínios. Typecheck, testes declarados e build passaram; lint falhou em duas regex Evolution; Playwright smoke validou 10 rotas sem erros de console/page, mas encontrou overflow mobile em `/agents`, `/connections` e `/create`. Confirmadas refatorações obrigatórias antes da B4 no Tool Gateway, idempotência, snapshots, validação runtime, estado contextual do frontend e gate de qualidade. Nenhum código de produto foi alterado. |
| 2026-09-12 | Item 1 do hardening pré-B4 concluído: testes TDD e enforcement server-side de autorização por workflow publicado, agente publicado, permissão ativa na versão publicada e aprovação persistida para escritas. B3 passou a persistir `agentId`/`approvalNodeId` nos nós tool. Suíte passou com 165 testes, typecheck, lint sem erros, build e preview aprovados. Próxima fatia: idempotência estável de efeitos externos. |
