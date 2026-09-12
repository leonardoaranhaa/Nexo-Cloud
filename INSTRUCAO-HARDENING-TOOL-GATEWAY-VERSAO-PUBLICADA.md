# Instrução técnica — Hardening do Tool Gateway e autorização por versão publicada

**Status:** concluída em 2026-09-12.

**Fatia:** pré-B4, item 1.

**Objetivo:** fechar, com testes de falha primeiro, o enforcement server-side de autorização para tools executadas por workflows, exigindo vínculo com a versão publicada do agente e removendo a possibilidade de aprovação implícita apenas por configuração do nó.

## Escopo desta fatia

Esta fatia cobre somente:

1. contrato de autorização por workspace, workflow publicado, versão publicada do agente e tool;
2. rejeição de execução quando a permissão da versão publicada estiver ausente, desabilitada, revogada ou vinculada a outro workspace;
3. rejeição de execução quando a aprovação obrigatória não estiver registrada e vigente;
4. preservação da compatibilidade dos workflows existentes sem permitir bypass server-side;
5. testes unitários/integrados de falha e isolamento.

Esta fatia **não** implementa ainda idempotência estável, congelamento de versão da tool, validação de output, redaction recursiva, circuit breaker, MCP governado, RLS ou refatoração do dispatcher nativo. Esses itens permanecem no backlog pré-B4 e devem ser executados em fatias próprias.

## Princípios obrigatórios

O frontend e a configuração persistida do nó não são autoridade de segurança. `node.config.approved` pode ser uma indicação de que o grafo possui um nó de aprovação, mas nunca substitui uma aprovação persistida nem a permissão efetiva da versão publicada.

Toda execução deve validar server-side, no mesmo workspace:

- o `workflow_run` e sua versão publicada;
- o agente e a versão publicada associada ao workflow ou ao contexto de execução;
- a tool exata e o contrato ativo permitido;
- a conexão vinculada ao workspace;
- a permissão `agent_tool_permissions` da versão publicada;
- a aprovação persistida, quando `require_approval` estiver ativa;
- o prazo e o estado da aprovação.

A resolução deve falhar fechada. Ausência de contexto de agente ou versão publicada não pode ser convertida em permissão ampla.

## Método TDD

Antes da implementação, criar testes que falhem para:

1. workflow com `approved: true`, mas sem `agent_tool_permissions`, deve ser rejeitado;
2. permissão de outro workspace não deve autorizar a execução;
3. permissão desabilitada deve ser rejeitada;
4. tool de leitura pode executar somente quando a versão publicada a possui;
5. tool de escrita com aprovação obrigatória deve exigir aprovação persistida;
6. aprovação expirada, rejeitada ou consumida não deve autorizar execução;
7. workflow/run sem versão publicada do agente deve ser rejeitado;
8. todos os casos acima não devem chamar o adapter externo nem criar execução marcada como sucesso.

Os testes devem usar fixtures reais das migrations e um adapter fake observável. Não devem depender de credenciais ou chamadas de Evolution, Meta, MCP ou qualquer serviço externo.

## Contrato recomendado

O executor deve receber ou resolver um contexto explícito, por exemplo:

```ts
{
  workspaceId: string;
  workflowId: string;
  workflowVersionId: string;
  agentId: string;
  agentVersionId: string;
  toolId: string;
  connectionId: string;
  toolExecutionId: string;
  approvalId?: string;
}
```

O nome exato pode seguir os contratos existentes, mas a implementação não deve usar `any`, confiar no frontend ou inferir uma versão arbitrária pelo último registro disponível.

## Critérios de aceite

- Testes de bypass e cross-workspace falham antes da implementação e passam depois dela.
- `executeWorkflowTool` ou uma função de autorização compartilhada consulta a permissão da versão publicada antes do adapter.
- `node.config.approved` isoladamente nunca autoriza uma tool de escrita.
- Uma execução rejeitada não produz chamada de adapter externo.
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` e `git diff --check` passam, salvo falha previamente documentada.
- O plano mestre registra a fatia como concluída somente com evidência dos gates.

## Riscos e compatibilidade

Workflows antigos podem não possuir `agentVersionId` explícito no nó. A compatibilidade deve ser resolvida por uma relação server-side inequívoca, nunca por fallback permissivo. Se o schema não permitir resolver essa relação com segurança, o workflow deve ser marcado como não executável até ser revisado e republicado.

A mudança deve preservar o runtime nativo de agentes, que possui um caminho próprio de autorização, e preparar a convergência futura para um Gateway único sem duplicar regras de negócio nesta fatia.

## Resultado implementado

O Tool Gateway agora exige, antes de qualquer adapter, que o run pertença a um workflow e a uma versão de workflow publicada no mesmo workspace. O nó precisa declarar `agentId`; o Gateway resolve a única versão publicada desse agente dentro do workspace e exige uma permissão ativa para a tool exata nessa versão. A flag `node.config.approved` não autoriza mais uma escrita isoladamente.

Quando a permissão publicada exige aprovação, o Gateway exige uma aprovação persistida, aprovada, não expirada e vinculada ao `runId` e ao `approvalNodeId`. A execução auditável passa a gravar `agent_id`, `agent_version_id`, `approval_id` e `approved_by`.

Workflows gerados pelo B3 passaram a persistir `agentId` e `approvalNodeId` nos nós de tool. O teste de workflow verifica esses campos para evitar regressão silenciosa.

## Evidências

Foram adicionados sete cenários TDD em `src/lib/connectors/tool-gateway.test.ts`: ausência de permissão, permissão somente em draft, permissão desabilitada, versão de workflow draft, aprovação apenas indicada no nó, aprovação persistida válida e agente de outro workspace. Todos os cenários passam e os adapters externos não são chamados nos casos bloqueados.

Gates finais: **165 testes aprovados**, typecheck aprovado, lint aprovado sem erros (sete warnings preexistentes fora desta fatia), build aprovado e nove rotas principais do preview retornando HTTP 200. A validação permaneceu local/preview; nenhum canal, MCP ou credencial real foi usado.

## Próxima fatia

O item seguinte do hardening pré-B4 é idempotência estável de efeitos externos em workflows. A implementação atual ainda deriva a chave de idempotência de um UUID novo por tentativa e não deve ser considerada resolvida por esta fatia.
