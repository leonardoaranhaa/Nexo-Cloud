# Instrução de auditoria com fontes recomendadas — Nexo Cloud

**Status:** auditoria em execução; documento metodológico da varredura completa iniciada em 2026-09-12.

## Objetivo

Verificar se o projeto precisa de refatoração após a adoção das fontes externas recomendadas no GitHub. A auditoria deve distinguir falhas observáveis, riscos arquiteturais, refatorações necessárias e melhorias futuras.

## Comando de entrada

```text
APLICAR_FONTES_RECOMENDADAS NEXO_CLOUD
```

Antes da análise, ler o plano mestre, o comando interno, este documento, `FONTES-RECOMENDADAS-DESENVOLVIMENTO-NEXO.md` e os planos especializados do domínio analisado.

## Escopo

A varredura cobre cinco domínios: arquitetura e isolamento multi-tenant; Agent Engineering, RAG e Tool Gateway; conectores, MCP e execução externa; React, UX contextual e testes web; testes, processo e readiness operacional.

A auditoria é somente leitura. Nenhum agente auditor pode editar código, criar migration, alterar configuração, publicar workflow, executar ferramenta externa ou fazer commit.

## Fontes aplicáveis

A auditoria aplica TDD para verificar ausência de comportamento sem teste; Systematic Debugging para exigir causa-raiz antes de classificar uma falha; Verification Before Completion para exigir evidência recente; Webapp Testing e React Best Practices para o console; MCP Builder para contratos de tools; OWASP e Agent Guard para segurança de agentes, prompt injection, secrets e auditoria; Postgres read-only para segurança de diagnóstico; e Subagent-Driven Development para separar análise independente de síntese.

O plano mestre, o comando interno e os contratos server-side do Nexo prevalecem sobre qualquer fonte externa. Nenhuma recomendação externa pode justificar secret no browser, acesso sem workspace, tool fora do gateway, MCP direto do navegador, publicação implícita, endpoint inventado ou validação fictícia de canal real.

## Critérios de evidência

Cada achado deve conter domínio, severidade, categoria, arquivo e linha ou símbolo, evidência observável, impacto, recomendação, necessidade de refatoração e prioridade. Achados hipotéticos sem evidência ficam em `unknowns` e não entram automaticamente no backlog de correção.

| Severidade | Significado | Ação |
|---|---|---|
| Critical | Falha que pode causar exposição de dados, execução indevida, perda de isolamento ou corrupção grave. | Bloquear avanço e corrigir antes de qualquer nova feature. |
| High | Risco concreto de segurança, regressão, contrato quebrado ou operação incorreta. | Corrigir antes da B4 ou antes de publicar a próxima fatia. |
| Medium | Dívida que pode degradar qualidade, observabilidade, performance ou manutenção. | Planejar dentro da B4 quando tocar o mesmo domínio. |
| Low | Melhoria localizada sem impacto imediato no contrato. | Registrar para refatoração futura. |
| Info | Prática confirmada, limitação documentada ou observação sem ação corretiva. | Manter como evidência ou contexto. |

## Resultado esperado

A síntese deve responder de forma objetiva:

1. Há refatoração obrigatória antes da B4?
2. Quais achados são bloqueadores?
3. Quais refatorações podem ser incorporadas à B4 sem desviar o plano?
4. Quais melhorias ficam para fases futuras?
5. Quais áreas já estão alinhadas às fontes recomendadas?

Nenhuma refatoração será implementada automaticamente pela auditoria. Correções devem ser convertidas em fatias verticais com teste primeiro, escopo, risco, aceite e atualização do plano mestre.

## Resultado da varredura de 2026-09-12

A auditoria foi concluída em cinco domínios: core multi-tenant; Agent Engineering, RAG e Tool Gateway; conectores/MCP; React e experiência; testes e readiness. Nenhum código de produto foi alterado pela auditoria.

### Conclusão executiva

**Há necessidade de refatoração antes de iniciar a B4.** O projeto não apresenta evidência de falha geral no caminho normal: a suíte declarada passou com 158 testes, o typecheck passou e o build independente passou. Entretanto, o lint falha com dois erros reais em `src/lib/connectors/evolution.ts:33` e `:42`. Além disso, foram confirmadas lacunas de segurança e consistência no caminho de workflows, tools externas, avaliações offline e estado do console.

A B4 não deve ser iniciada diretamente. Primeiro deve ser executada uma fatia de hardening pré-B4 com teste primeiro. Essa decisão não invalida B1, B2 ou B3; ela corrige contratos compartilhados que a B4 usará.

### Refatorações prioritárias

| Prioridade | Refatoração | Evidência | Fonte aplicada |
|---|---|---|---|
| P0 | Centralizar execução no Tool Gateway e exigir autorização real da versão publicada. | `executeWorkflowTool` aceita `node.config.approved`, não recebe `agent_version_id` e não consulta a permissão congelada antes da execução. O runtime conversacional possui dispatcher próprio em `src/lib/agent-runtime/runtime.ts:363-527`. | OWASP, MCP Builder, Verification Before Completion |
| P0 | Tornar idempotentes os efeitos externos de workflows. | `src/lib/connectors/tool-gateway.ts:43-46` cria UUID novo e deriva a chave idempotente dele; um retry lógico recebe outra chave. | TDD, Systematic Debugging, Verification Before Completion |
| P0 | Congelar `tool_id`, versão, schema e adapter no snapshot do workflow publicado. | B3 persiste `toolKey` e o Gateway resolve a tool active mais recente. Uma nova versão pode alterar um workflow já publicado. | TDD, MCP Builder, Verification Before Completion |
| P0 | Corrigir a validação de saída e a redaction recursiva. | `validateToolOutput` não é aplicado pelo Gateway; `redacted` filtra somente o primeiro nível do objeto. | OWASP, MCP Builder |
| P0 | Bloquear execução externa em conexão `pending`, `degraded` ou sem healthcheck saudável. | B3 materializa conexão `pending`; o Gateway consulta status `connected` ou `pending` e pode despachar. | OWASP, Verification Before Completion |
| P0 | Corrigir lint e recompor o gate de conclusão. | `npm run lint` falha por `no-control-regex` nas validações de Evolution. `npm run build` passa quando executado independentemente; portanto lint não pode ser omitido. | Verification Before Completion, Systematic Debugging |
| P1 | Tornar B1 reprodutível por versão e contexto. | `runBlueprintScenarios` carrega draft/publicada em `loadBlueprint`, mas usa `listPublishedAgentTools`; `scenario.input.context` e `channel` não chegam ao runtime; não há snapshot imutável do blueprint, cenários, tools e RAG. | TDD, Verification Before Completion |
| P1 | Implementar aprovação server-side das propostas B2. | Existem geração e listagem, mas não foi encontrado fluxo de revisão/aprovação/rejeição das `agent_tool_proposals` com auditoria e materialização governada. | TDD, OWASP, MCP Builder |
| P1 | Adicionar defesa de integridade multi-tenant no banco. | Existem `workspace_id` e FKs individuais, mas faltam constraints compostas/triggers/RLS para impedir referências cruzadas em `tool_executions`, permissões, avaliações e proposals. | OWASP, Postgres Skill |
| P1 | Introduzir schemas runtime nas server functions. | Validators de `createServerFn` são funções identidade tipadas; TypeScript não valida payload enviado pelo navegador em runtime. `zod` está disponível no projeto. | OWASP, TDD |
| P1 | Corrigir estado contextual do frontend. | Zustand persiste `inbox` e `events` numa chave global sem escopo; a troca de workspace não os limpa. O wizard seleciona `connectionId`, mas `persistBlueprint` não chama `bindWorkspaceAgentConnection`. | React Best Practices, Webapp Testing, OWASP |
| P1 | Corrigir ações UI inertes/local-only e runs duplicáveis. | `/runs` usa `onClick={() => void load}` sem invocar `load`; duplicação na página do agente usa apenas `duplicateAgent`; execução de workflow não envia chave estável nem busy state. | React Best Practices, TDD, Webapp Testing |
| P1 | Implementar matriz Playwright no gate. | Após instalar Chromium, as dez rotas principais responderam HTTP 200 sem console/page errors no desktop e mobile. Porém `/agents`, `/connections` e `/create` apresentaram overflow horizontal no mobile. Não há suíte E2E integrada ao `npm test`. | Webapp Testing, Verification Before Completion |
| P2 | Alinhar readiness e quota. | `reserveRuntimeQuota` permite execução quando `enabled=false`, enquanto `readiness-report.ts` consulta limite/uso sem considerar `enabled` e pode reportar quota esgotada. | TDD, Verification Before Completion |
| P2 | Separar webhook de ingestão e execução. | A rota Meta chama `runNextAgentRuntimeJob` antes de responder ao webhook. | OWASP, Systematic Debugging |
| P2 | Corrigir monotonicidade/reconciliação de delivery Meta. | Meta atualiza status incondicionalmente; não há worker confirmado para consumir `next_attempt_at` e reconciliar `unknown`. | TDD, Systematic Debugging |
| P2 | Endurecer MCP Connector antes de torná-lo executável. | URL HTTPS aceita host arbitrário, inclusive loopback; descoberta, allowlist persistida, schemas remotos versionados, egress policy e lifecycle completo ainda não existem. | MCP Builder, OWASP |
| P3 | Unificar auditoria e tracing de tools, aprovações e adapters. | Existem registros separados de Nexo Bot e `tool_executions`, mas não há correlação completa e uniforme de ator, aprovação, versão, provider request id e trace distribuído. | Verification Before Completion, OWASP |

### Verificação fresca da sessão

| Gate | Resultado | Interpretação |
|---|---|---|
| `npm test` | **158 pass, 0 fail** | A suíte declarada está verde, mas não inclui `src/lib/webhooks/evolution-handler.test.ts`. |
| `npm run typecheck` | **pass** | Não há erro TypeScript atual. |
| `npm run build` | **pass** | Compilação e cópia de assets passaram; `db:migrate` pulou porque `DATABASE_URL` não está configurada. |
| `npm run lint` | **falha** | Dois erros `no-control-regex` em `evolution.ts`; há também oito warnings de variáveis não usadas. |
| `npm run check:auth` | **falha de ambiente** | O script não conseguiu ler `VITE_AUTH_ENABLED` resolvido pelo servidor dev; não foi tratado como falha confirmada do produto. |
| Preview | **pass** | Reiniciado em `http://127.0.0.1:8081/`. |
| Playwright smoke | **pass parcial** | Dez rotas responderam 200, sem console/page errors. Overflow mobile confirmado em `/agents`, `/connections` e `/create`. |

A validação Playwright executada foi smoke, não substitui testes de interação autenticada. Não houve credencial real nem chamada externa real.

### Ordem recomendada antes da B4

1. Criar testes que reproduzam autorização bypass, retry duplicado, tool version drift, output inválido, segredo aninhado e conexão pending.
2. Corrigir o contrato compartilhado do Tool Gateway, incluindo autorização publicada, snapshots de tool, output schema, redaction recursiva, readiness e idempotência estável.
3. Corrigir lint e incluir todos os testes existentes no gate; adicionar cobertura explícita do handler Evolution.
4. Corrigir B1 para usar a mesma versão/permissões/contexto do cenário e persistir snapshots comparáveis.
5. Corrigir o isolamento do store e as ações local-only do console; adicionar matriz Playwright com troca de workspace e estados loading/error/empty.
6. Executar novamente typecheck, lint, suíte completa, build, preview, smoke Playwright e `check:auth` com a configuração de servidor disponível.
7. Somente após todos os gates verdes, iniciar a implementação da B4 conforme o plano especializado.

### Limitações conhecidas

Não houve conexão com PostgreSQL gerenciado, AWS Secrets Manager, host persistente, Meta real, Evolution real, MCP real ou worker de produção. RLS, egress, IAM, rotação de secrets, retenção, alertas e tracing externo permanecem não verificados. A auditoria não transforma fixtures ou preview em evidência de produção.
