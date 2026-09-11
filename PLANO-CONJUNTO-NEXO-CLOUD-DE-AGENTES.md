# Plano conjunto de execução — Nexo Cloud de Agentes

**Status do documento:** fonte de verdade operacional do repositório.

**Última consolidação:** 2026-09-10.

**Regra principal:** toda IA, agente de código ou pessoa que iniciar uma sessão de desenvolvimento deve ler este arquivo antes de analisar, planejar, editar ou executar qualquer alteração. Depois da leitura, deve subdividir a próxima etapa em uma menor fatia vertical, comparar o plano com o estado real do repositório e somente então continuar.

**Plano especializado vinculante:** `PLANO-EXECUCAO-AGENT-ENGINEERING-PLANE.md` detalha a evolução do Agent Engineering Plane. Após ler este plano mestre e o comando interno, toda sessão que atuar nessa frente deve ler o plano especializado integralmente, respeitar a ordem da Fase 0 e atualizar ambos os documentos ao concluir cada fatia.

## 1. Visão do produto

O Nexo Cloud é a **AWS dos agentes**: uma plataforma multi-tenant que fornece a infraestrutura, o ambiente de desenvolvimento, o runtime, as ferramentas, o conhecimento, as integrações, a governança e o catálogo necessários para criar, testar, indexar, publicar, operar, alugar, vender e evoluir agentes de inteligência artificial.

Assim como a AWS fornece infraestrutura para empresas construírem e executarem sistemas, o Nexo Cloud fornece infraestrutura especializada para pessoas e organizações construírem e executarem agentes. O produto não é apenas um chatbot builder ou um catálogo de automações. Ele é o ambiente de referência para o ciclo de vida completo de agentes comandados por inteligência artificial.

O Nexo terá duas frentes complementares:

1. **Infraestrutura de agentes:** control plane, workspaces, ambientes, desenvolvimento, runtime, memória, RAG, ferramentas, MCP, conectores, workflows, observabilidade, segurança e métricas.
2. **Ecossistema de agentes:** agentes próprios de alto nível criados pelo Nexo, agentes de usuários, templates, produtos prontos, agentes para uso interno, locação, venda, instalação, customização, teste e publicação.

A referência da AWS é arquitetural: organização por serviços, recursos provisionáveis, permissões, credenciais, execução, logs, métricas e automações. O Nexo não deve copiar indiscriminadamente a quantidade de serviços da AWS; deve traduzir a utilidade da nuvem para o domínio dos agentes.

A plataforma deve começar por agentes de **Atendimento + Vendas**, com canais, conhecimento, CRM, handoff, workflows, ferramentas e métricas. Outras famílias, como suporte, marketing, anúncios, tráfego e operações, entram depois que os contratos multi-tenant, runtime, conectores, permissões, auditoria e medição estiverem estáveis. A prioridade inicial não limita a visão final: o Nexo deve suportar agentes de qualquer tipo de negócio que possa ser modelado, conectado e governado.

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
| Integration Layer | Meta, Evolution, CRM interno, MCP e adapters server-side | Evolution e Meta fundacionais implementados; adapters de negócio ainda incompletos |
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

 A agenda foi iniciada como fatia parcial: existe a migration `0033_calendar_availability.sql` e a ferramenta nativa read-only `calendar.list_availability`, com isolamento por workspace e dispatch no Agent Runtime. Ainda faltam provisionamento/ingestão de slots, busca e reserva de horários, aprovação para escritas, CRM externo, catálogo/disponibilidade conectado e ferramentas conversacionais completas para todas as operações comerciais.

### 5.4 RAG operacional

**Estado: fundação persistente implementada.**

Existem documentos, chunks, fontes, publicação, snapshots, recuperação lexical, filtros multi-tenant e bloqueio de resposta sem evidência suficiente.

Ainda faltam ingestão assíncrona completa, upload de arquivos pela interface, extração de documentos, embeddings reais, índice vetorial, recuperação híbrida semântica, reranking e avaliação de cobertura.

### 5.5 Tool Registry, conectores e MCP

**Estado: governança implementada; adapters e execução multi-round incompletos.**

Existem catálogo, schemas, risco, permissões por versão publicada, congelamento, Tool Gateway, Secret Resolver, MCP Runtime, aprovações, idempotência, auditoria e integração de tool calling no runtime.

A ferramenta `lead.create_or_update` já é executável pelo runtime quando autorizada. O ciclo multi-round foi fechado para o núcleo nativo: resultados sanitizados retornam ao modelo para gerar a resposta final. CRM, handoff e follow-up possuem registros nativos no Tool Registry e adapters conversacionais autorizáveis, com isolamento por workspace, idempotência e auditoria. Ainda faltam agenda, disponibilidade, adapters externos, validação de `output_schema` de todos os adapters, circuit breaker, quota/rate limit e tracing completo.

### 5.6 Workflows e automação

**Estado: motor durável implementado; experiência completa parcial.**

Existem versões, compilação de grafos, condições, eventos internos, webhooks, execução manual, scheduler, filas, leases, retries, espera, retomada, aprovações, histórico e follow-ups agendados.

Ainda faltam executor universal de nós `agent` e `tool`, editor visual completo, mapeamento de dados, transformações, integração oficial com n8n, observabilidade por nó e reprocessamento operacional avançado.

### 5.7 Marketplace interno

**Estado: ciclo de instalação, atualização e rollback implementado para MVP local/preview.**

Existem produtos, versões, ofertas, entitlements, instalações, manifestos, catálogo, detalhe, instalação, agente draft, customização, publicação e vínculo por workspace. O produto inicial é **Nexo Atendimento + Qualificação**.

As instalações agora possuem lista geral em `/marketplace/installed`, revisão persistida de configuração, atualização explícita e rollback por workspace. Ainda faltam pausa, saúde, uso por instalação, checkout, assinatura, compra, locação, billing e marketplace de terceiros. Essas funções comerciais não devem ser simuladas antes de existir entitlement persistido e contrato de billing.

### 5.8 Nexo Learning RAG e Improvement Lab

**Estado: fundação, avaliação, casos e laboratório implementados; promoção pendente.**

Existem eventos sanitizados, consentimento, mascaramento, avaliações, casos, chunks de engenharia, recuperação interna, candidatos versionados e revisão. Dados privados de clientes não entram no aprendizado global por padrão.

Ainda faltam avaliação offline contra regressões, gate formal de promoção, publicação gradual, comparação entre versões, A/B testing, painel operacional e eventual separação física do Learning Store.

### 5.9 Experiência principal

**Estado: funcional.**

A Home, a busca global, o contexto de workspace, a navegação de serviços, o Marketplace, Minhas Instalações, Inbox, Metrics e `/settings` estão implementados. A linguagem antiga do estúdio foi reduzida.

Ainda faltam configurações server-side completas, governança por papel, configuração por ambiente, onboarding guiado e refinamento operacional de estados vazios e saúde da plataforma.

### 5.10 Ambiente de desenvolvimento assistido por IA

**Estado: primeira fatia implementada e persistida.**

O wizard `/create` agora transforma o briefing do usuário em um blueprint inicial revisável, contendo tipo de agente, persona, prompt, objetivos, capacidades, limites, FAQs, notas e cenários de teste. O blueprint é persistido por workspace e pode ser editado na configuração do agente, com autosave dos objetivos, capacidades e guardrails.

Ainda faltam execução dos cenários de teste, indexação de documentos e sistemas, geração assistida de workflows e ferramentas, comparação de versões e testes automatizados de qualidade antes da publicação.

### 5.11 AWS, billing e produção

**Estado: postergado.**

A documentação IaC e AWS existe, mas a implantação permanente não está ativa. O preview local utiliza PGlite e assets empacotados. Não existe ainda infraestrutura permanente com banco gerenciado, workers, filas, storage, secrets, alertas, quotas, custo por uso e billing.

A postergação é temporária e não remove AWS do roadmap. Ela não deve bloquear o fechamento do núcleo funcional local. Como primeira fatia de readiness operacional, o Agent Runtime agora aplica quotas diárias server-side por workspace e por agente, com consumo persistido e isolamento por workspace.

## 6. Migrations, rotas e validação atual

O repositório possui migrations até `0037_marketplace_installation_revisions.sql`, cobrindo Marketplace, protocolo de decisão, RAG, CRM, Learning, Improvement Lab, domínio de execuções de ferramentas, blueprints persistidos, disponibilidade de agenda e revisões de instalação.

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

A validação técnica consolidada inclui typecheck, build, preview público e suíte automatizada com **119 testes aprovados e 0 falhas** no último ciclo validado.

Commit de referência desta consolidação de código:

```text
3d6cc57 feat: implement agent cloud marketplace runtime and tool governance
```

## 7. Roadmap oficial atualizado

### Fase 1 — Fundamento multi-tenant

**Status: concluída para MVP local/preview.**

Manter compatibilidade e fechar produção apenas depois do núcleo funcional.

### Fase 2 — Agent Runtime e Atendimento

**Status: concluída para MVP local/preview.**

Próximas ações: validação real de canal, healthchecks, operação de webhook e melhoria de Inbox/handoff.

### Fase 3 — Agente de Vendas

**Status: núcleo CRM e ferramentas conversacionais concluído; fechamento pendente.**

Próximas ações: agenda, ferramenta de disponibilidade, reserva com aprovação quando necessário e CRM externo opcional.

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

**Escopo futuro — Agent as a Service:** depois do fechamento do Marketplace interno, avaliar uma API pública versionada (`/v1`) para que plataformas externas consumam agentes publicados. O escopo inclui API keys/OAuth, escopos por workspace e ambiente, execução síncrona e assíncrona, idempotência, quotas, medição de uso, webhooks assinados, OpenAPI e SDKs. Não implementar nesta etapa nem expor rotas internas diretamente.

### Learning RAG

**Status: fundação e laboratório implementados; gate de promoção pendente.**

Retomar depois do fechamento do núcleo de vendas, ferramentas e Marketplace interno.

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
6. criar e validar templates prontos de Atendimento e Vendas;
7. executar validação com conexão Meta ou Evolution real;
8. revisar observabilidade, quotas e readiness de produção;
9. retomar AWS somente após o núcleo demonstrável passar pelos critérios de aceite.

Cada item deve ser executado como uma fatia vertical independente, com migration apenas quando necessária, contrato server-side, teste de isolamento, teste de integração, typecheck, build e preview.

## 9. Protocolo obrigatório de cada sessão

Ao iniciar qualquer sessão, a IA deve:

1. localizar a raiz do repositório;
2. ler este arquivo integralmente;
3. ler `COMANDO-INTERNO-DESENVOLVIMENTO-NEXO-CLOUD.md`;
4. ler os documentos especializados relacionados ao próximo item;
5. verificar `git status`, último commit, migrations, rotas, scripts e testes;
6. confrontar o estado real do código com este documento;
7. identificar a primeira etapa incompleta do próximo ponto de partida;
8. subdividir essa etapa em uma menor fatia vertical reversível;
9. registrar objetivo, arquivos afetados, riscos, dependências, critério de aceite e classificação de alinhamento;
10. implementar, testar, revisar o diff e atualizar este documento quando o estado do roadmap mudar.

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
- `README.md`

Os documentos especializados complementam este plano. Em caso de conflito, este plano define a prioridade de produto e o comando interno define o método obrigatório de execução.

## 12. Histórico de consolidação

| Data | Consolidação |
|---|---|
| 2026-09-10 | Estado confrontado com código, migrations, rotas, testes e documentos compartilhados. Registrados os módulos implementados, as lacunas e a ordem obrigatória de continuidade. |
