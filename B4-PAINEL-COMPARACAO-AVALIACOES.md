# B4 — Painel de comparação de avaliações no agente

**Status:** implementada no console local/preview; gate formal de promoção permanece futuro.

## Objetivo

Expor na área **Testes** de cada agente a Evaluation Harness offline já persistida no backend. O usuário deve selecionar duas versões do mesmo agente, executar uma comparação sem efeitos externos, visualizar o histórico do workspace e inspecionar métricas, snapshots sanitizados e diferenças por cenário.

## Limite operacional

Esta fatia é uma superfície de leitura e avaliação offline. Ela não publica versões, não promove candidatos, não executa tools, não chama conectores, não cria jobs de produção, não envia mensagens e não grava Learning Events. A execução continua protegida pelo endpoint server-side autenticado e pelo `requireWorkspaceAccess`.

## Contrato de UX

1. O painel pertence ao agente e recebe o `workspaceId` do contexto global, sem aceitar tenant escolhido pelo usuário fora do store/contexto atual.
2. As versões são carregadas pelo endpoint persistente `listWorkspaceAgentVersions`.
3. O botão de comparação usa `runWorkspaceAgentEvaluationHarness` com duas versões diferentes e o blueprint do próprio agente.
4. O histórico usa `listWorkspaceAgentEvaluationHarnessRuns`; a inspeção detalhada usa `getWorkspaceAgentEvaluationHarnessRun`.
5. Estados de backend indisponível, carregamento, erro, ausência de blueprint, ausência de versões e menos de duas versões devem ser explícitos e seguros.
6. Métricas devem ser mostradas lado a lado para baseline e candidata: sucesso, tokens médios, latência média, erro de tool, handoff e violações de guardrail.
7. Cada cenário deve mostrar status, regressão, resposta sanitizada, tools chamadas e diferenças. O painel não pode exibir secrets, tokens ou payloads externos.
8. O contrato visual deve reforçar a matriz `agent-development`: identidade do agente, propósito/acionamento via cenários, versão de prompt/modelo, tools autorizadas, guardrails e formato de saída observado.

## Critérios de aceite

- Área Testes exibe a Evaluation Harness sem duplicar o chat conversacional existente.
- É possível selecionar duas versões distintas e iniciar uma execução offline.
- Runs anteriores aparecem isolados pelo workspace atual.
- O detalhe de uma run apresenta comparação de métricas e cenários com regressões legíveis.
- Estados vazio, carregando e erro são operacionais e não deixam ações inválidas disponíveis.
- O painel não inclui confirmação de publicação/promoção e não cria chamada externa.
- Testes unitários cobrem parsing/formatação de dados não confiáveis e seleção de versões; typecheck, lint, suíte completa, build, preview e smoke Playwright passam.

## Fora de escopo

Gate formal de promoção, publicação gradual, A/B testing, indexação adicional, Learning RAG global, execução autenticada de cenários via browser, integração real Meta/Evolution, Google Calendar ou qualquer novo conector.

## Referências

- `PLANO-CONJUNTO-NEXO-CLOUD-DE-AGENTES.md`
- `PLANO-EXECUCAO-AGENT-ENGINEERING-PLANE.md`
- `INSTRUCAO-AUDITORIA-FONTES-RECOMENDADAS-NEXO.md`
- `COMANDO-INTERNO-DESENVOLVIMENTO-NEXO-CLOUD.md`
- `src/lib/agent-engineering/harness.ts`
- `src/lib/multitenancy/api.ts`
- `src/routes/agents/$id.tsx`

## Resultado da fatia

O Studio agora transporta o `developmentBlueprintId` persistido, carrega versões e runs pelo backend autenticado, permite selecionar baseline/candidata, executa a comparação offline, mostra histórico contextual e detalha métricas, snapshots sanitizados, contrato de prompt/modelo/tools, guardrails do blueprint e diferenças por cenário. A fatia foi validada com 186 testes, typecheck, lint, build, preview e smoke Playwright. Não houve migration nova nem alteração de comportamento externo.
