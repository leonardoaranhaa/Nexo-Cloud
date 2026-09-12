# PLANO-EXECUCAO-AGENT-ENGINEERING-PLANE.md

**Status do documento:** plano de execução detalhado e operacional  
**Última consolidação:** 2026-09-12
**Fonte de verdade superior:** `PLANO-CONJUNTO-NEXO-CLOUD-DE-AGENTES.md`  
**Contrato operacional:** `COMANDO-INTERNO-DESENVOLVIMENTO-NEXO-CLOUD.md`

---

## 0. Regra de entrada obrigatória

Antes de qualquer planejamento, edição de código, migration ou declaração de conclusão, a IA ou pessoa responsável deve:

1. Ler integralmente `PLANO-CONJUNTO-NEXO-CLOUD-DE-AGENTES.md`
2. Ler integralmente `COMANDO-INTERNO-DESENVOLVIMENTO-NEXO-CLOUD.md`
3. Ler integralmente este arquivo
4. Verificar `git status`, último commit, migrations existentes e estado real do código
5. Confrontar o estado real com o “Próximo ponto de partida obrigatório” do plano mestre
6. Só então subdividir a próxima fatia vertical deste documento

Nenhuma IA deve iniciar uma fatia deste plano se o “Próximo ponto de partida obrigatório” do plano mestre ainda não estiver concluído ou explicitamente liberado pelo usuário.

---

## 1. Objetivo final deste plano

Elevar o Nexo Cloud de uma plataforma que **executa** agentes para uma plataforma que **engenheira** agentes de alta complexidade de forma assistida, governada, versionada e multi-tenant.

O resultado final é o **Agent Engineering Plane**: um conjunto de capacidades internas que permite:

- Partir de um briefing de negócio
- Gerar e refinar blueprints
- Propor arquiteturas (single e multi-agente)
- Gerar tools, workflows, políticas e guardrails
- Avaliar de forma multi-dimensional
- Iterar com candidatos versionados
- Aplicar gate formal de promoção
- Publicar e operar a versão resultante

Tudo isso reutilizando exclusivamente os contratos já existentes (Tool Gateway, Workflow Engine, Runtime, Learning/Improvement Lab, versões publicadas, isolamento por workspace).

---

## 2. Arquitetura-alvo do Agent Engineering Plane

| Componente                    | Responsabilidade                                                                 | Base existente                          | Status alvo |
|-------------------------------|----------------------------------------------------------------------------------|-----------------------------------------|-------------|
| Briefing → Blueprint Engine   | Transforma objetivo de negócio em blueprint estruturado e revisável             | `/create` + blueprints                  | Evoluir     |
| Architecture Planner          | Propõe topologias, roles, tools e workflows                                     | Novo (usa Runtime + Tool Registry)      | Construir   |
| Artifact Generator            | Gera/refina prompts, schemas de tools, workflows, guardrails e cenários         | Novo (usa Tool Gateway + Workflows)     | Construir   |
| Evaluation Harness            | Executa cenários, mede qualidade, custo, robustez e isolamento                  | Estende Improvement Lab + Runtime       | Construir   |
| Improvement Loop              | Analisa falhas → gera candidatos versionados                                    | Já existe (Improvement Lab)             | Completar   |
| Promotion Gate                | Decide promoção com critérios objetivos + aprovação humana quando necessário    | Novo (usa versões + Marketplace)        | Construir   |

Todas as operações ocorrem dentro do workspace do usuário. O Learning global permanece sanitizado e opt-in.

---

## 3. Pré-requisitos absolutos (Fase 0)

Estas etapas pertencem ao “Próximo ponto de partida obrigatório” do plano mestre. A validação real de Meta/Evolution permanece um gate para produção, mas foi explicitamente postergada pelo usuário; por isso, as fatias de engenharia offline da Fase B podem avançar em local/preview sem chamadas externas reais.

### 3.1 Ordem obrigatória de conclusão

1. Completar agenda e disponibilidade como ferramenta/conector controlado — concluído no núcleo local/preview, com console operacional `/calendar`
2. Fechar atualização e rollback de instalações do Marketplace — concluído com migration `0037`
3. Criar rota e operação de `/marketplace/installed` (Minhas Instalações) — concluído
4. Criar e validar templates prontos de Atendimento e Vendas — concluído com persistência multi-tenant e testes contratuais
5. Executar validação ponta a ponta com conexão real Meta ou Evolution — handshake, POST assinado e execução do agente validados; envio real bloqueado pela lista de destinatários da Meta; **postergado até host persistente e credenciais reais**
6. Revisar observabilidade, quotas e readiness de produção — relatório server-side, painel visual em `/metrics`, checklist de aprovação e gate server-side de publicação implementados; observabilidade externa, quotas de tokens/custo e alertas seguem pendentes

**Critério de saída da Fase 0:**  
O núcleo de Atendimento + Vendas + Marketplace interno está estável, testado localmente e documentado no plano mestre. A saída operacional para produção permanece pendente pela ausência da validação real de Meta/Evolution e da revisão de readiness. Enquanto essa dependência estiver postergada, a Fase B pode avançar somente em modo offline/evaluation, sem efeitos externos.

---

## 4. Fase B — Blueprint Executável e Avaliável

**Objetivo da fase:** transformar o blueprint de documento estático em artefato central e executável da engenharia de agentes.

### Fatia B1 — Execução de cenários de teste do blueprint

**Status: concluída em modo offline/evaluation no local/preview.**

Foram implementados cenários estruturados retrocompatíveis com textos legados, endpoint server-side autenticado, execução isolada reutilizando decisão e recuperação RAG, expectativas de resposta/handoff/tools/tokens, persistência de runs e resultados, snapshots sanitizados no Learning RAG e testes de isolamento. A execução não cria jobs de produção, mensagens, deliveries, chamadas externas ou publicação.

**Objetivo**  
Permitir que o Runtime execute os cenários de teste definidos no blueprint em ambiente isolado do workspace e grave os resultados no Improvement Lab.

**Instruções de construção para a IA**

1. Localizar o schema e a persistência atual de blueprints (`migrations/0031_agent_development_blueprints.sql` e código relacionado).
2. Estender o modelo de blueprint para incluir um array de `test_scenarios` com a seguinte estrutura mínima:
   ```ts
   {
     id: string
     name: string
     description?: string
     input: {
       channel?: string
       message: string
       context?: Record<string, unknown>
     }
     expected: {
       contains?: string[]
       not_contains?: string[]
       tools_called?: string[]
       handoff?: boolean
       max_tokens?: number
     }
   }
   ```
3. Criar endpoint server-side autenticado e isolado por workspace:
   - `POST /api/workspaces/:workspaceId/agents/:agentId/blueprints/:blueprintId/run-scenarios`
4. O endpoint deve:
   - Carregar a versão de blueprint
   - Executar cada cenário no Runtime em modo `evaluation` (não publica, não dispara canais reais)
   - Usar o mesmo pipeline de decisão + tools + RAG do Runtime de produção
   - Gravar resultado completo (sucesso/falha, tokens, tools chamadas, latência, logs) na tabela de avaliações do Improvement Lab
5. Garantir isolamento total: nenhum dado de outro workspace pode ser lido ou escrito.
6. Adicionar testes:
   - Teste de isolamento multi-tenant
   - Teste de execução de cenário simples com sucesso e falha esperada
   - Teste de que o modo evaluation não dispara webhooks externos

**Critérios de aceite**
- Cenários definidos no blueprint são executáveis via API
- Resultados aparecem no Improvement Lab
- Typecheck + testes + build passam
- Nenhum side-effect externo ocorre

**Riscos**
- Contaminação de estado entre avaliações → usar contexto de avaliação isolado
- Custo de tokens elevado → limitar número de cenários por execução e aplicar timeout

**Atualização documental**  
Após conclusão, atualizar o plano mestre na seção 5.10 e neste arquivo marcar B1 como concluída.

---

### Fatia B2 — Geração assistida de tools a partir do blueprint

**Status: concluída em modo governado no local/preview.**

Foram implementados o contrato persistente de propostas por workspace, mapeamento determinístico apenas para tools nativas confirmadas, validação estrutural dos schemas, derivação server-side de risco e aprovação, materialização de tools workspace-scoped em `review`, propostas `draft`, idempotência, endpoints autenticados de geração/listagem e testes de isolamento. Nenhuma proposta recebe permissão de agente ou execução automática.

**Objetivo**  
A partir das “capacidades” declaradas no blueprint, gerar propostas de tools (schemas) que passam pelo Tool Registry e Tool Gateway.

**Instruções de construção para a IA**

1. Estender o blueprint com campo `capabilities: string[]` (já parcialmente existente).
2. Criar serviço server-side `generateToolProposalsFromBlueprint(blueprintId)`.
3. O serviço deve:
   - Analisar as capacidades
   - Gerar propostas de tools no formato exato do Tool Registry (name, description, input_schema, output_schema, risk_level, requires_approval)
   - Nunca inventar endpoints externos não existentes
   - Toda proposta nasce como `draft` e precisa de aprovação humana ou política automática
4. Criar endpoint:
   - `POST /api/workspaces/:workspaceId/agents/:agentId/blueprints/:blueprintId/generate-tools`
5. Integrar com o fluxo de aprovação já existente no Tool Gateway.
6. Após aprovação, a tool pode ser vinculada à versão do agente.

**Critérios de aceite**
- Propostas de tools são geradas e aparecem no Tool Registry como draft
- Nenhuma tool é executável sem passar pelo Tool Gateway
- Testes de schema validation e isolamento

**Riscos**
- Alucinação de schemas → validar rigorosamente com Zod/JSON Schema antes de persistir
- Ferramentas de alto risco geradas sem aprovação → forçar `requires_approval = true` para risco médio/alto

**Próxima fatia:** B4 — Evaluation Harness offline básico, comparando cenários e versões antes de promoção.

---

### Fatia B3 — Geração assistida de workflows a partir do blueprint

**Status: concluída em modo draft no local/preview.**

Foram implementados o vínculo idempotente entre blueprint e workflow, geração de grafo compilável, preservação de snapshot publicado, registro de capacidades pendentes, materialização condicional de tools aprovadas/autorizadas e endpoints server-side autenticados. A geração não publica, não cria runs e não executa chamadas externas. Tools nativas sem handler de workflow permanecem pendentes.

**Objetivo**  
Transformar capacidades complexas do blueprint em grafos de workflow versionados.

**Instruções de construção para a IA**

1. Reutilizar o motor de workflows já existente (migrations 0010–0016).
2. Criar serviço `generateWorkflowFromBlueprint(blueprintId)`.
3. O serviço deve produzir um grafo válido (nós `agent`, `tool`, `condition`, `wait`, etc.) compatível com o compilador de workflows atual.
4. O workflow gerado nasce como versão draft e precisa de publicação explícita.
5. Endpoint:
   - `POST /api/workspaces/:workspaceId/agents/:agentId/blueprints/:blueprintId/generate-workflow`
6. Garantir que o workflow gerado só possa chamar tools autorizadas para aquele agente/versão.

**Critérios de aceite**
- Workflow gerado é compilável e executável no motor existente
- Isolamento e versionamento preservados
- Testes de compilação e execução de grafo simples

**Resultado da primeira fatia:** o grafo gerado é compilável e permanece em `draft`; execução e publicação continuam operações explícitas do console. A próxima fatia é B4 — Evaluation Harness offline básico.

---

### Fatia B4 — Evaluation Harness offline básico

**Entrada obrigatória da próxima execução:** executar `APLICAR_FONTES_RECOMENDADAS NEXO_CLOUD` e aplicar a matriz de fontes de `FONTES-RECOMENDADAS-DESENVOLVIMENTO-NEXO.md` antes de criar o contrato, a migration ou os testes da harness.

**Status: primeira fatia backend concluída em local/preview; painel de comparação ainda pendente.**

**Gate pré-B4:** concluído em 2026-09-12. Foram corrigidos e testados idempotência estável, autorização por versão publicada, snapshots de tool/version/schema/adapter, validação de output, redaction recursiva, readiness de conexões, snapshots de B1, schemas runtime, integridade multi-tenant, ações contextuais do frontend, quota fail-closed, ingestão assíncrona de webhook, monotonicidade/reconciliação de delivery, bloqueio de hosts privados no MCP e tracing de auditoria do Nexo Bot. Os gates finais passaram com 180 testes, typecheck, lint, build, preview, smoke Playwright e `check:auth`. A próxima execução pode iniciar diretamente a B4, aplicando `APLICAR_FONTES_RECOMENDADAS NEXO_CLOUD`.

**Objetivo**  
Criar suite de avaliação reutilizável que combina cenários do blueprint + métricas de qualidade, custo e robustez.

**Primeira fatia implementada:** `runEvaluationHarness` compara duas versões draft/publicadas do mesmo agente usando o mesmo conjunto de cenários, o pipeline determinístico de decisão e a recuperação RAG somente leitura. A migration `0050_agent_evaluation_harness.sql` persiste snapshots sanitizados de configuração e tools, métricas por versão e diferenças/regressões por cenário, com guards de integridade multi-tenant. Endpoints autenticados permitem executar, listar e consultar runs. A harness não grava Learning Events, não cria jobs, não envia mensagens, não chama adapters, não publica e não promove candidatos.

**Instruções de construção para a IA**

1. Estender o Improvement Lab com tabela ou campos para `evaluation_runs` e `evaluation_metrics`.
2. Métricas mínimas obrigatórias:
   - success_rate
   - avg_tokens
   - avg_latency_ms
   - tool_error_rate
   - handoff_rate
   - guardrail_violation_count
3. Criar comando/job que executa a suite completa de um blueprint/versão e grava snapshot comparável.
4. Expor no console (rota futura `/agents/:id/evaluations`) os resultados e comparação entre versões.

**Próxima fatia B4:** expor a consulta de runs na área **Testes** do agente, com seleção contextual de versões, estados vazio/carregando/erro, comparação legível e smoke Playwright. O painel não poderá publicar, promover ou executar efeitos externos.

**Critérios de aceite**
- Uma execução de avaliação produz snapshot completo e versionado
- É possível comparar duas versões lado a lado
- Testes de regressão da harness

---

## 5. Fase C — Architecture Planner (Alta Complexidade)

**Pré-requisito:** Fase B concluída e validada.

### Fatia C1 — Meta-Planner de Arquitetura

**Objetivo**  
Dado um blueprint + restrições, propor 1–N arquiteturas candidatas (single-agent, hierárquica, multi-agente).

**Instruções de construção para a IA**

1. Criar entidade `architecture_proposal` vinculada ao blueprint e ao workspace.
2. Schema mínimo:
   ```ts
   {
     id: string
     topology: "single" | "hierarchical" | "multi_agent" | "workflow_heavy"
     agents: Array<{
       role: string
       responsibilities: string[]
       tools: string[]
       model_hint?: string
     }>
     orchestration: "runtime" | "workflow" | "hybrid"
     estimated_cost_class: "low" | "medium" | "high"
     risks: string[]
   }
   ```
3. Serviço `proposeArchitectures(blueprintId, constraints)`.
4. As propostas são apenas documentos estruturados — a materialização (criação real de agentes e workflows) ocorre em fatia posterior.
5. Endpoint de geração e listagem de propostas.

**Critérios de aceite**
- Propostas são geradas, persistidas e revisáveis
- Nenhuma execução real ocorre nesta fatia
- Testes de isolamento e de schema

---

### Fatia C2 — Materialização de arquitetura escolhida

**Objetivo**  
Transformar uma `architecture_proposal` aprovada em agentes, tools e workflows reais versionados.

**Instruções de construção para a IA**

1. Criar serviço `materializeArchitecture(proposalId)`.
2. O serviço deve:
   - Criar os agentes necessários (ou reutilizar existentes)
   - Gerar/associar tools
   - Gerar workflows de orquestração
   - Criar uma versão de agente “pai” ou de orquestração que referencia os demais
3. Tudo nasce como draft e exige publicação explícita.
4. Garantir que a materialização é atômica ou claramente reversível.

**Critérios de aceite**
- Uma proposta aprovada vira conjunto coerente de artefatos versionados
- Rollback da materialização é possível
- Testes de ponta a ponta da materialização

---

## 6. Fase D — Loop de Engenharia Fechado + Promotion Gate

### Fatia D1 — Improvement Loop completo

**Objetivo**  
Fechar o ciclo: falha → análise → candidato de melhoria versionado.

**Instruções de construção para a IA**

1. Estender o Improvement Lab para gerar automaticamente candidatos a partir de evaluation_runs com falhas.
2. Tipos de candidatos suportados inicialmente:
   - prompt_patch
   - tool_schema_adjustment
   - workflow_adjustment
   - guardrail_addition
3. Cada candidato é versionado e vinculado à versão de origem.
4. Interface de revisão humana obrigatória antes de qualquer aplicação.

---

### Fatia D2 — Promotion Gate

**Objetivo**  
Só permitir publicação de uma versão se critérios objetivos forem atendidos.

**Instruções de construção para a IA**

1. Criar entidade `promotion_gate_result`.
2. Critérios mínimos configuráveis por workspace:
   - success_rate >= X
   - guardrail_violations == 0
   - max_avg_tokens
   - aprovação humana (opcional por política)
3. O endpoint de publicação de versão de agente deve consultar o gate e bloquear se não passar.
4. Registrar auditoria completa da decisão do gate.

**Critérios de aceite**
- Publicação é bloqueada quando o gate falha
- É possível forçar publicação apenas com papel administrativo e justificativa
- Testes de bloqueio e de passagem

---

## 7. Fase E — Capacidades avançadas (após D)

Somente após o ciclo completo das Fases B–D estar estável:

- Agentes de longa duração com estado complexo
- Orquestração de dezenas de sub-agentes
- Geração de conectores/MCP a partir de especificação
- Learning cross-workspace (sempre sanitizado)
- Preparação para Agent-as-a-Service (já previsto no plano mestre)

Estas fatias devem ser detalhadas somente quando as fases anteriores estiverem concluídas e o plano mestre for atualizado.

---

## 8. Protocolo de sessão para qualquer IA que assumir este plano

```text
ASSUMIR_AGENT_ENGINEERING_PLANE

1. Ler PLANO-CONJUNTO-NEXO-CLOUD-DE-AGENTES.md
2. Ler COMANDO-INTERNO-DESENVOLVIMENTO-NEXO-CLOUD.md
3. Ler este arquivo integralmente
4. Verificar git status + último commit + migrations
5. Confirmar que a Fase 0 (próximo ponto de partida obrigatório) está concluída
6. Identificar a primeira fatia incompleta deste plano
7. Subdividir a fatia em trabalho reversível de no máximo 1 dia de implementação
8. Declarar:
   - Objetivo da fatia
   - Arquivos que serão tocados
   - Migrations necessárias (se houver)
   - Riscos
   - Critérios de aceite
   - Classificação de alinhamento (ALINHADA / ALINHADA_COM_RISCO / DESVIO...)
9. Implementar
10. Executar typecheck + testes relevantes + build
11. Revisar diff
12. Atualizar este documento e o plano mestre
13. Reportar resultado de forma concisa
