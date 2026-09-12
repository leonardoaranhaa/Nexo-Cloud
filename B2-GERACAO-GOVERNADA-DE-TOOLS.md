# B2 — Geração governada de propostas de ferramentas

**Status:** implementada em modo governado no local/preview; propostas permanecem em `draft` até existir aprovação explícita.

## Objetivo

A fatia B2 transforma as capacidades declaradas em um blueprint de agente em propostas de ferramentas revisáveis. A proposta é um artefato de engenharia, não uma autorização de execução. O fluxo deve reutilizar o Tool Registry, o Tool Gateway, os schemas existentes e o isolamento por workspace.

## Contrato obrigatório

Cada proposta deve possuir `workspace_id`, `agent_id`, `blueprint_id`, capacidade de origem, chave da tool confirmada, schemas de entrada e saída, risco, indicação de aprovação, justificativa e status `draft`. A proposta também deve referenciar a tool registrada criada ou reutilizada em status `review`, nunca `active`.

O gerador só pode mapear capacidades para tools nativas confirmadas no repositório. Capacidades que exigiriam API, endpoint, adapter, credencial ou schema inexistente devem ser marcadas como não suportadas e não podem gerar uma tool executável. O modelo não pode inventar endpoints, payloads, credenciais ou nomes de ferramentas.

Ferramentas de risco `write` ou `destructive` devem nascer com `requires_approval = true`. Nenhuma proposta `draft` pode ser retornada por `resolveTool`, vinculada a permissões publicadas, chamada pelo runtime ou executada pelo Tool Gateway.

## Mapeamentos confirmados nesta fatia

| Capacidade reconhecida | Tool nativa | Risco | Aprovação |
|---|---|---:|---:|
| lead, CRM, criar lead, registrar contato | `lead.create_or_update` | write | obrigatória |
| qualificar lead, critérios comerciais | `lead.update_qualification` | write | obrigatória |
| atribuir vendedor, responsável comercial | `lead.assign_owner` | write | obrigatória |
| follow-up, acompanhamento comercial | `lead.create_follow_up` | write | obrigatória |
| transferir para humano, handoff | `conversation.handoff` | write | obrigatória |
| disponibilidade, agenda, horários | `calendar.list_availability` | read | não obrigatória |
| reservar horário, agendamento | `calendar.book_slot` | write | obrigatória |

A correspondência deve ser determinística, limitada e auditável. Sinônimos podem ampliar a identificação da capacidade, mas não podem criar novos destinos.

## Segurança e multi-tenancy

O endpoint deve exigir autenticação e `requireWorkspaceAccess`. O agente e o blueprint precisam pertencer ao workspace informado. A proposta deve ser criada com `workspace_id` e todas as consultas devem filtrar esse campo. O navegador apenas solicita e visualiza a geração; não decide status, risco, schemas ou aprovação.

A criação deve ser idempotente por `(workspace_id, blueprint_id, tool_key, capability)`. Regenerar o mesmo blueprint deve atualizar a justificativa e manter uma única proposta draft para o mesmo vínculo. Nenhuma permissão de agente deve ser criada nesta fatia.

## Validação

Antes de persistir, validar `name`, `description`, `input_schema`, `output_schema`, `risk_level` e `requires_approval`. Os schemas devem passar pelo subconjunto determinístico do Tool Registry. A proposta deve preservar os schemas da tool nativa, sem aceitar schema fornecido pelo modelo ou pelo navegador.

Os testes mínimos são: geração de capacidade suportada, rejeição ou registro explícito de capacidade não suportada, isolamento entre workspaces, idempotência, schema inválido rejeitado e confirmação de que tools draft não são resolvidas nem executadas.

## Fora de escopo

Esta fase não aprova propostas, publica tools, associa permissões a versões publicadas, cria conectores externos, chama MCP, chama APIs externas, cria credenciais ou materializa endpoints REST/OpenAPI. A aprovação e a vinculação a versões serão fases posteriores com políticas próprias.

## Critérios de aceite

A fase foi concluída quando o endpoint server-side passou a gerar propostas draft para capacidades confirmadas, persistir os vínculos por workspace, validar schemas, não inventar integrações, manter tools não executáveis até aprovação e passar por typecheck, testes relevantes, suíte completa e build. A próxima fase é a geração de workflows versionados em draft.

## Referências

[1]: ./PLANO-CONJUNTO-NEXO-CLOUD-DE-AGENTES.md "Plano mestre de execução do Nexo Cloud"
[2]: ./PLANO-EXECUCAO-AGENT-ENGINEERING-PLANE.md "Plano do Agent Engineering Plane"
[3]: ./ARQUITETURA-EXECUCAO-FERRAMENTAS-MCP-CONECTORES.md "Arquitetura de ferramentas, MCP e conectores"
