# Plano conjunto de execução — Nexo Cloud de Agentes

**Status do documento:** fonte de verdade operacional do repositório.

**Última consolidação:** 2026-09-13 — skill `agent-development` adotada; B4 backend + painel concluídos; confrontação agressiva reabriu o gate de promoção e produção.

**Regra principal:** toda IA, agente de código ou pessoa que iniciar uma sessão de desenvolvimento deve ler este arquivo antes de analisar, planejar, editar ou executar qualquer alteração. Depois da leitura, deve subdividir a próxima etapa em uma menor fatia vertical, comparar o plano com o estado real do repositório e somente então continuar. A partir da B4 e em qualquer fatia posterior, também deve executar `APLICAR_FONTES_RECOMENDADAS NEXO_CLOUD` conforme `FONTES-RECOMENDADAS-DESENVOLVIMENTO-NEXO.md`.

**Plano especializado vinculante:** `PLANO-EXECUCAO-AGENT-ENGINEERING-PLANE.md` detalha a evolução do Agent Engineering Plane. Após ler este plano mestre e o comando interno, toda sessão que atuar nessa frente deve ler o plano especializado integralmente, respeitar a ordem da Fase 0, aplicar as fontes recomendadas a partir da B4, aplicar a skill local `agent-development` ao criar ou alterar agentes e atualizar ambos os documentos ao concluir cada fatia.

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

Os agentes próprios do Nexo devem ser tratados como produtos de alto valor, não como exemplos descartáveis. Cada produto deve possuir contrato de capacidade, manifesto, versão, oferta, entitlement, instalação, customização, métricas, política de atualização e mecanismo de rollback. Nenhum produto deve ser vendido como pronto enquanto os gates P0/P1 da seção 8.3 permanecerem abertos.

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

A área **Publicação** deve funcionar como uma superfície de readiness operacional. Canal, cenários de teste, handoff e versão candidata são cards independentes, com estados, dependências, escopo, risco e ações próprias. A publicação deve ser bloqueada quando os requisitos mínimos — canal conectado, cenários estruturados, avaliação aprovada para o snapshot exato e ausência de regressão crítica — não estiverem atendidos.

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

**Estado: fundação, execução multi-round e hardening parcial concluídos; autorização de agentes ainda bloqueada por achados adversariais.**

Existem catálogo, schemas, risco, permissões por versão publicada, Tool Gateway, Secret Resolver, MCP Runtime, aprovações, idempotência do runtime nativo, auditoria e integração de tool calling no runtime. O hardening pré-B4 agora exige workflow publicado, agente publicado, permissão ativa da tool na versão publicada, snapshot imutável de tool/version/schema/adapter, conexão saudável e aprovação persistida quando requerida; também aplica output schema, redaction recursiva, idempotência estável e vínculo workspace-scoped antes do adapter.

A ferramenta `lead.create_or_update` possui caminho multi-round e idempotência quando efetivamente autorizada, mas a auditoria confirmou que writes comerciais determinísticos em `runtime.ts` ainda podem ocorrer fora dessa fronteira, que `allowedScopes` não é aplicado e que `riskLevel` não torna aprovação obrigatória por padrão. O Gateway também precisa congelar a versão do agente no workflow, governar risco por ferramenta MCP e invalidar health quando o endpoint da conexão mudar. A fundação continua válida para local/preview, mas não sustenta ainda uma alegação de least privilege ou produção segura.

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

**Estado: fundação, avaliação, casos, laboratório, harness comparável e painel operacional implementados; promoção bloqueada por dois P0 confirmados.**

Existem eventos sanitizados, consentimento, mascaramento, avaliações, casos, chunks de engenharia, recuperação interna, candidatos versionados, revisão e a primeira harness offline comparável. Dados privados de clientes não entram no aprendizado global por padrão.

A primeira Evaluation Harness offline agora compara duas versões do mesmo agente, calcula `success_rate`, tokens médios, latência média, taxa de erro de tool, taxa de handoff e violações de guardrail, persiste snapshots sanitizados e marca regressões por cenário. O painel operacional na área Testes do Studio permite seleção contextual de versões, execução offline, histórico de runs e inspeção de métricas, contratos de prompt/modelo/tools, guardrails e diferenças por cenário. A confrontação confirmou que o Harness não chama o modelo/provider real, aceita cenários vacuous e não é consultado pelo publish; portanto o gate formal de promoção permanece bloqueado até existir avaliação obrigatória, não manipulável e ligada ao snapshot exato.

### 5.9 Experiência principal

**Estado: funcional.**

A Home, a busca global, o contexto de workspace, a navegação de serviços, o Marketplace, Minhas Instalações, Inbox, Metrics e `/settings` estão implementados. A linguagem antiga do estúdio foi reduzida.

Ainda faltam configurações server-side completas, governança por papel, configuração por ambiente, onboarding guiado e refinamento operacional de estados vazios e saúde da plataforma.

### 5.10 Ambiente de desenvolvimento assistido por IA

**Estado: blueprint persistido, avaliações offline, propostas governadas de tools e geração de workflows draft implementados; padrão de engenharia adotado, porém contratos críticos ainda não são todos enforced.**

O wizard `/create` agora transforma o briefing do usuário em um blueprint inicial revisável, contendo tipo de agente, persona, prompt, objetivos, capacidades, limites, FAQs, notas e cenários de teste. O blueprint é persistido por workspace e pode ser editado na configuração do agente, com autosave dos objetivos, capacidades e guardrails. A fatia B1 adicionou cenários estruturados, endpoint server-side autenticado, execução offline reutilizando decisão e RAG, expectativas de resposta/handoff/tools, persistência de resultados em tabelas próprias e snapshots sanitizados no Learning RAG. A fatia B2 adicionou geração determinística de propostas de tools nativas confirmadas, schemas preservados do Tool Registry, risco e aprovação derivados server-side, tools workspace-scoped em `review`, propostas `draft`, idempotência e endpoint de listagem. A fatia B3 adicionou vínculo idempotente entre blueprint e workflow, geração de grafo compilável em `draft`, preservação de versões publicadas, capacidades pendentes e materialização condicional de tools aprovadas, autorizadas e compatíveis com adapters do executor.

As avaliações B1, a geração B2, a geração B3 e a harness B4 não criam jobs de produção, mensagens, deliveries, chamadas externas ou publicação automática. Tools B2 não recebem permissões de agente e não podem ser resolvidas pelo runtime enquanto estiverem em `review`. Workflows B3 não criam runs e somente incluem tools quando há proposta aprovada, tool ativa, permissão habilitada na versão draft e adapter de workflow confirmado. A B4 agora compara versões no backend e no console, persiste métricas, snapshots sanitizados e regressões por cenário; ainda faltam indexação de documentos e sistemas, gate formal de promoção e testes automatizados de qualidade antes da publicação.

Toda evolução de agente deve aplicar a matriz da skill `agent-development`: identidade, propósito e condições de acionamento, prompt estruturado, modelo, tools mínimas, guardrails, formato de saída, casos-limite e cenários de avaliação. A confrontação agressiva confirmou lacunas em cada contrato: `modelProvider/modelName` persistidos não governam o provider efetivo, `objectives/capabilities/guardrails` não chegam como políticas executáveis ao runtime, o formato de saída do agente não é validado e cenários textuais sem assertions podem habilitar publicação. A skill é adaptada aos blueprints, manifestos, versões publicadas, Tool Gateway e Evaluation Harness do Nexo; não cria um runtime de plugin paralelo nem autoriza acesso amplo a ferramentas.

### 5.11 Nexo Bot

**Estado: integração LLM, protocolo de ações e auditoria operacional implementados.**

O Nexo Bot está disponível na Home como assistente contextual. Ele consulta o Claude server-side com contexto mínimo do workspace, responde em linguagem natural e pode propor navegação, criação de agente ou provisionamento de horário. Escritas exigem confirmação explícita e passam por nova autorização server-side antes da execução. A rota `/nexo-bot/audit` registra consultas, propostas, confirmações, sucessos e falhas com sanitização, filtros por workspace e timeline operacional.

Ainda faltam memória persistente do assistente, streaming, quotas próprias, mais ações com políticas de aprovação, retenção configurável e integração com o Learning RAG. A auditoria encontrou que a confirmação server-side ainda aceita uma ação client-supplied sem exigir ID/hash de uma proposta persistida; até corrigir isso, criação e provisionamento via Nexo Bot devem permanecer tratados como superfície de risco. Eventos de chat e ações agora possuem `trace_id` correlacionável. Publicação, exclusão, credenciais, permissões, billing e chamadas externas permanecem bloqueados nesta fase.

### 5.12 AWS, billing e produção

**Estado: billing conceitualmente modelado; infraestrutura AWS e cobrança automática postergadas.**

A documentação IaC e AWS existe, mas a implantação permanente não está ativa. O preview local utiliza PGlite e assets empacotados. Não existe ainda infraestrutura permanente com banco gerenciado, workers, filas, storage, secrets, alertas, custo por uso e billing. O modelo de precificação v1 separa plano base, consumo medido, capacidades provisionadas, quotas operacionais, budgets, entitlements, custos de terceiros e ofertas de compromisso; nenhum preço provisório foi codificado como preço de produção.

A postergação é temporária e não remove AWS do roadmap. Ela não deve bloquear o fechamento do núcleo funcional local. Como primeira fatia de readiness operacional, o Agent Runtime agora aplica quotas diárias server-side por workspace e por agente, com consumo persistido e isolamento por workspace.

## 6. Migrations, rotas e validação atual

O repositório possui migrations até `0050_agent_evaluation_harness.sql`, cobrindo Marketplace, protocolo de decisão, RAG, CRM, Learning, Improvement Lab, domínio de execuções de ferramentas, blueprints persistidos, avaliações offline, disponibilidade e reserva de agenda, contratos de ferramentas comerciais, revisões de instalação, quotas diárias do runtime, auditoria correlacionável do Nexo Bot, workflows de erro, produtos próprios do Nexo, propostas governadas de tools, vínculos de workflows gerados, snapshots de avaliação, integridade multi-tenant em banco e comparação de versões.

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

A validação técnica consolidada inclui typecheck, lint sem erros e sem warnings, build, preview local e suíte automatizada com **186 testes aprovados e 0 falhas**. A confrontação mostrou que essa suíte não cobre concorrência, provider/modelo efetivo, autorização negativa de writes, publicação sem versão, gate de Harness, handoff/approval de ponta a ponta, prompt injection ou efeitos externos. A matriz Playwright e o smoke não substituem testes autenticados, adversariais nem validação de canal real.

Commit de referência desta consolidação de código:

```text
e0ac5bd feat: enforce published workflow tool authorization
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

**Status: fundação, primeira harness comparável, laboratório e painel operacional implementados; promoção bloqueada por dois P0 confirmados.**

Retomar depois do fechamento do núcleo de vendas, ferramentas e Marketplace interno.

O hardening pré-B4 e o painel foram concluídos localmente, mas a confrontação agressiva reabriu o gate. A Evaluation Harness compara versões offline sem efeitos externos e a superfície de comparação está disponível na área Testes do Studio, mantendo Tool Gateway único, snapshots sanitizados, validação runtime, isolamento e gates de lint, testes e Playwright. Antes do gate formal de promoção, a próxima fatia deve corrigir os dois P0: impedir `active` sem versão publicada e impedir publish/rollback sem Harness aprovada para o snapshot exato.

### AWS e infraestrutura permanente

**Status: postergada.**

Retomar após o núcleo demonstrável estar fechado e validado com canal real.

### Billing

**Status: não iniciado.**

Não simular compra, assinatura ou locação. Implementar após definir entitlement, limites, uso e contrato comercial.

## 8. Próximo ponto de partida obrigatório

A próxima execução deve seguir esta ordem, sem iniciar Ads, billing, Marketplace aberto ou AWS permanente antes de concluir o ciclo abaixo:

1. completar o ciclo multi-round de tool calling; **concluído para o núcleo nativo, mas sujeito ao hardening de autorização reaberto**;
2. expor CRM, handoff e follow-up como ferramentas nativas autorizáveis; **concluído para o núcleo nativo**;
3. implementar agenda e disponibilidade como conector ou ferramenta controlada;
4. fechar atualização e rollback de instalações do Marketplace;
5. criar `marketplace/installed` e a operação de Minhas Instalações;
6. criar e validar templates prontos de Atendimento e Vendas; **concluído e revalidado com os produtos próprios, manifestos, permissões, instalação, customização, isolamento, atualização e rollback**;
7. executar validação com conexão Meta ou Evolution real;
8. revisar observabilidade, quotas e readiness de produção; **relatório server-side, painel visual em `/metrics` e checklist explícita de aprovação para produção implementados no preview, mas a confrontação abriu correções P0/P1 de publicação, fila, quota, health e autorização antes da aprovação**;
9. retomar AWS somente após o núcleo demonstrável passar pelos critérios de aceite.

### 8.1 Prioridade interna durante a postergação de conexões reais

Enquanto host, Docker e credenciais reais não estiverem disponíveis, a execução deve concentrar-se na construção da plataforma em local/preview. As fatias B1, B2 e B3 estão concluídas e a B4 backend + painel está concluída em modo offline/evaluation. A próxima execução interna deve tratar primeiro do hardening P0/P1 identificado na confrontação `agent-development`, aplicando `APLICAR_FONTES_RECOMENDADAS NEXO_CLOUD` antes de planejar cada fatia. Só depois desse hardening deve ser implementado o gate formal de promoção. Essas fatias não podem disparar chamadas externas reais, publicar versões automaticamente ou transformar fixtures em evidência de produção.

A validação real de Meta/Evolution permanece registrada como pendência operacional e deverá ser retomada quando o host estiver preparado. Nenhuma sessão deve tentar contornar essa dependência criando credenciais no repositório, simulando healthcheck saudável ou tratando o preview como canal de produção.

### 8.2 Gate de refatoração identificado pela auditoria

**Status: reaberto em 2026-09-13 após confrontação agressiva da skill `agent-development`.**

A varredura inicial com as fontes recomendadas foi convertida em fatias verticais e entregou hardening pré-B4, B4 backend e painel. A confrontação agressiva posterior encontrou dois bloqueadores P0 confirmados: `updateAgent` pode converter `live` em `active` sem versão publicada, e `publishAgent` aceita apenas canal saudável + texto de cenário, sem executar ou exigir uma Evaluation Harness aprovada. O Tool Gateway possui controles importantes, mas ainda não é uma fronteira completa porque o runtime conversacional executa writes comerciais fora dele, `allowedScopes` não é aplicado, aprovação não retoma o job, workflows resolvem a versão publicada atual e MCP não carrega risco por ferramenta remota.

Também permanecem válidos: B1 seleciona versão/contexto e persiste snapshots; server functions críticas usam schemas Zod; o banco possui integrity guards multi-tenant; o store limpa estado contextual; o wizard persiste vínculo de conexão; duplicação e runs usam ações server-side idempotentes; o lint está limpo; a matriz Playwright está integrada ao projeto; quota disabled bloqueia runtime; webhook Meta somente ingere/enfileira; delivery Meta é monotônico e reconciliável; MCP bloqueia hosts privados por padrão; e auditoria do Nexo Bot possui `trace_id`. Esses controles não anulam os bloqueadores novos, pois os testes atuais não exercitam suas condições de falha.

Os gates técnicos locais passaram: 186 testes, typecheck, lint sem erros/warnings, build, preview e smoke desktop/mobile. Eles não autorizam publicação comercial. A instrução `INSTRUCAO-AUDITORIA-FONTES-RECOMENDADAS-NEXO.md` permanece aplicável; a próxima execução deve corrigir primeiro o bloqueio de `active` sem published e o gate de publish sem Harness, depois revalidar least privilege, handoff, approval e snapshots. Não declarar conexão real Meta/Evolution, MCP real ou produção validados.

### 8.3 Confrontação agressiva `agent-development` — 2026-09-13

**Veredito:** o Nexo Cloud não está pronto para vender ou operar agentes com efeitos comerciais. Pode ser utilizado somente em sandbox/local/preview controlado, sem tráfego de clientes e sem alegação de prontidão de produção.

| Severidade | Achado confirmado | Evidência principal | Impacto operacional |
|---|---|---|---|
| P0 | Agente `active` sem versão `published` | `src/lib/multitenancy/server.ts:400-463` aceita `status=live`; `src/lib/agent-runtime/runtime.ts:205-216` faz join opcional e `toAgent` usa fallback dos campos editáveis. | Draft ou configuração mutável pode atender tráfego real. |
| P0 | Publicação não depende de avaliação aprovada | `src/lib/multitenancy/server.ts:606-627` exige canal saudável e uma string não vazia em `test_scenarios`; não consulta Harness nem threshold. | Um placeholder pode liberar uma versão não testada, com regressão ou guardrail violado. |
| P1 | Writes CRM fora da autorização da versão | `src/lib/agent-runtime/runtime.ts:616-665` executa lead, qualificação, atribuição e follow-up após decisão, sem gate por `authorizedTools`. | Agente sem tool publicada pode produzir efeitos comerciais. |
| P1 | `allowedScopes` e approval de risco não são enforced no runtime | `src/lib/connectors/tools-server.ts:22-29,101-125` persiste/omite escopos; `runtime.ts:375-409` valida key/schema e só usa `requireApproval` configurado. | Tool pode atingir recurso fora do escopo ou escrever sem aprovação obrigatória. |
| P1 | Provider/modelo configurado pode divergir do efetivo | `src/lib/multitenancy/server.ts:636-650` persiste provider/modelo; `src/lib/agent-runtime/runtime.ts:235-283` usa xAI e `NEXO_AGENT_MODEL` globais. | Conteúdo, custo e comportamento podem ir para um provider diferente do declarado. |
| P1 | Handoff e approval não completam a transição | `runtime.ts:293-298` responde handoff sem persistir a transição; `tools-server.ts:85-90` altera approval, mas não retoma job; `evolution-handler.ts:140-163` ignora conversas `pending`. | Cliente pode não chegar ao humano; nova mensagem pode reativar o bot; ação aprovada pode nunca ocorrer. |
| P1 | Workflow/MCP não têm autorização remanescente estável | `tool-gateway.ts:65-71` resolve a versão publicada atual; `:101-106` trata MCP por allowlist nominal. | Nova publicação pode alterar workflow antigo; mutação MCP pode passar como leitura. |
| P1 | Conector saudável pode ser redirecionado sem invalidar health | `src/lib/multitenancy/server.ts:1093-1118` permite mudar endpoint/status sem limpar health; dispatcher resolve o segredo no endpoint atual. | Segredo pode ser enviado a endpoint controlado por atacante. |
| P1 | Fila, quota e triggers aceitam condições de replay/concorrência | `queue.ts:48-65`, `quota.ts:67-98` e `server/routes/api/hooks/workflows/[workspaceSlug]/[triggerToken].ts:14-27`. | Workers podem duplicar efeitos; webhook token pode gerar runs sem idempotência/rate limit; quota pode ser subcontada. |
| P1 | Harness não observa modelo real nem prova grounding | `src/lib/agent-runtime/runtime.ts:327-363` usa `model.generate` fake; `harness.ts:102-126` mede médias simples; RAG desbloqueia resposta com evidência lexical fraca. | Agente pode parecer aprovado e falhar em provider, tool calling, citação, prompt injection ou custo reais. |
| P1 | Marketplace/blueprint/Nexo Bot possuem contratos declarativos parcialmente decorativos | `marketplace/server.ts:411-428`, `server.ts:472-515` e `nexo-bot/server.ts:87-99`. | Protected components, guardrails e confirmation podem ser contornados por chamadas server-side válidas. |

**Próxima ordem obrigatória:** (1) state machine e fail-closed para `active/published`; (2) Policy Engine único para capability, scope, risco, approval e writes; (3) gate transacional de publish/rollback ligado ao snapshot e Harness aprovado; (4) handoff/approval com resume idempotente; (5) snapshots de workflow/MCP/provider e health fingerprint; (6) concorrência, quota, webhook e produção fail-closed; (7) grounding, guardrails, dados sintéticos e testes adversariais. Nenhuma nova integração ou feature comercial deve ultrapassar essa fila.

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
10. quando a sessão alterar agentes, aplicar a matriz de identidade, acionamento, prompt, modelo, tools, guardrails, saída e edge cases da skill `agent-development`;
11. registrar objetivo, arquivos afetados, riscos, dependências, critério de aceite e classificação de alinhamento;
12. implementar, testar, revisar o diff e atualizar este documento quando o estado do roadmap mudar.

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
- `B4-PAINEL-COMPARACAO-AVALIACOES.md`
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
| 2026-09-12 | Hardening pré-B4 concluído: idempotência estável, snapshots imutáveis de tools e B1, output schema/redaction, readiness saudável, integridade multi-tenant, schemas runtime, ações persistentes do console, quota fail-closed, webhook Meta assíncrono, delivery monotônico/reconciliável, MCP com bloqueio de hosts privados e traceId do Nexo Bot. Migrations chegaram a `0049`; gates finais passaram com 180 testes, typecheck, lint sem warnings, build, preview, smoke desktop/mobile e `check:auth`. B4 está liberada para a próxima sessão; Meta/Evolution real continua postergado. |
| 2026-09-12 | Primeira fatia B4 implementada: `0050_agent_evaluation_harness.sql`, comparação backend de duas versões por workspace, métricas de sucesso/tokens/latência/tools/handoff/guardrails, snapshots sanitizados de configuração e tools, regressões por cenário, endpoints autenticados e guards SQL. A harness não cria jobs, deliveries, Learning Events, chamadas externas, publicação ou promoção. Testes B4 cobrem regressão, sanitização, versões distintas, isolamento e efeitos nulos. Próxima fatia: painel de comparação na área Testes do agente. |
| 2026-09-13 | Skill `agent-development` adotada como referência obrigatória para criação e evolução de agentes: identidade, acionamento, prompt, modelo, tools least-privilege, guardrails, formato de saída, edge cases e cenários de avaliação. A adaptação usa blueprints, manifestos, versões publicadas, Tool Gateway e Evaluation Harness; não cria runtime de plugin paralelo nem libera permissões ou publicação automática. |
| 2026-09-13 | Painel B4 concluído na área Testes do Studio: `developmentBlueprintId` persistido no carregamento de agentes, seleção contextual de baseline/candidata, execução offline, histórico e detalhe por cenário com métricas, contratos sanitizados de prompt/modelo/tools e guardrails do blueprint. Nenhuma migration nova ou ação externa foi introduzida. Suíte passou com 186 testes, typecheck, lint, build, preview e smoke Playwright. Próxima fatia: gate formal de promoção. |
| 2026-09-13 | Confrontação agressiva com a matriz `agent-development` em cinco domínios confirmou dois P0: `active` pode existir sem versão `published` e publish não exige Harness aprovada. Também foram confirmados riscos P1 em writes CRM fora da autorização, scopes/approval, provider/modelo, handoff, snapshots de workflows/MCP, health de conectores, concorrência, webhooks e qualidade do Harness. A próxima fatia foi reordenada para hardening P0/P1 antes do gate formal de promoção; nenhum código foi alterado pela auditoria. |
| 2026-09-14 | Hardening P0/P1 iniciado: a migration `0051_promotion_hardening.sql` impede `active` sem versão `published` no banco; o backend rejeita a mesma transição, versiona alterações como draft, valida provider/modelo e exige Harness sucedida, sem regressões e aprovada por workspace antes de republicação. Foi criado endpoint autenticado de aprovação do Harness, com aprovação humana persistida, e scopes CRM passaram a ser propagados ao runtime com bloqueio explícito quando declarados sem `crm.write`. Validação incremental aprovada: 47 testes de scripts/migrations, 12 de publicação/Harness, 17 de Tool Gateway, typecheck, lint e build. A suíte integral foi interrompida por duração de integrações e não é declarada como gate concluído. Permanecem P1: autorização CRM completa por operação, handoff, snapshots de workflows/MCP, health de conectores, concorrência, webhooks e revisão de qualidade/critério do Harness. |
| 2026-09-14 | Sequência P1 avançada: handoff agora usa transições condicionais e fail-closed (`HANDOFF_INVALID_TRANSITION`), evitando reabrir conversas fechadas ou aceitar corridas de estado; Harness só pode ser aprovado quando success rate não piora e violações de guardrail não aumentam. A lentidão aparente da validação foi diagnosticada como corrupção acidental de fixtures por substituição textual ampla de status; os fixtures foram restaurados, a alteração reaplicada de modo localizado e os testes isolados passaram: handoff 2/2 e runtime handoff 1/1. Snapshot de workflows/MCP, idempotência de webhooks e readiness/health de conectores já possuem guards e testes existentes; permanecem como próxima revisão específica os locks de publicação concorrente e autorização CRM por operação. |
| 2026-09-14 | Onboarding WhatsApp simplificado para o MVP: Evolution permanece como gateway QR (o Nexo não emula WhatsApp diretamente), mas agora o backend inicia/cria a instância, consulta o estado, devolve QR temporário e acompanha o pareamento sem expor a API key. A tela de Conexões substitui o QR simulado por QR real, orienta o usuário em uma jornada curta e gera automaticamente o nome da instância quando omitido. Foram adicionados endpoints autenticados, Secret Resolver server-side e testes de QR/estado (2/2); typecheck e lint passaram. Meta Cloud continua disponível como caminho oficial separado. |
| 2026-09-14 | Proteção anti-banimento Evolution configurada server-side: intervalo mínimo padrão de 3s entre mensagens, limite de burst de 20 mensagens/5min, limite diário de 200 mensagens por conexão e pausa de 30min após handoff humano. A reserva é atômica no banco, registra tentativas bloqueadas como `unknown` com `next_attempt_at`, e `assign` pausa o agente; `release`/`resume` removem a pausa. Migration `0052_whatsapp_safety_limits.sql`, regressão do limite diário no inbound e validações de typecheck/lint/handoff/inbound passaram. |
| 2026-09-14 | Monitoramento de conexões WhatsApp adicionado ao `AppShell`: cada workspace consulta o estado das instâncias Evolution a cada 15s, atualiza o status local em tempo real, persiste healthcheck no backend e emite toast de desconexão/reconexão. O cabeçalho exibe alerta persistente com a quantidade de WhatsApps desconectados e link direto para Conexões. O polling usa permissão de leitura; o início do QR continua exigindo escrita. Typecheck, lint, onboarding e inbound e2e passaram. |
| 2026-09-14 | Canais sociais Meta adicionados como providers de primeira classe: `instagram` (Instagram Messaging API) e `messenger` (Messenger Platform), com migration `0053_meta_social_connectors.sql`, IDs de conta separados, credenciais Access Token/App Secret/Verify Token no cofre, healthcheck, monitoramento periódico, alertas globais, dispatch textual oficial e limites de texto conforme a API. O dispatch preserva o contrato WhatsApp Cloud existente e usa payload social `{ recipient: { id }, message: { text } }`. Documentação oficial de webhooks e envio registrada em `docs/meta-social-channel-notes.md`; typecheck, lint, adapters e plano de migrations passaram. |
