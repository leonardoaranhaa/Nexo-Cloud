# B3 — Geração assistida de workflows versionados

**Status:** implementada em modo `draft` no local/preview; publicação e execução continuam explícitas.

## Objetivo

Transformar o blueprint persistido em um workflow versionado, compilável e revisável. O workflow gerado é um artefato de engenharia. Ele não é uma autorização de execução nem substitui a revisão humana.

## Limite operacional da primeira fatia

O compilador do Nexo aceita nós `agent`, `tool`, `condition`, `wait`, `approval` e `transform`. O executor de workflows atualmente possui handlers operacionais para `agent` e `tool`, mas o Tool Gateway de workflows tem adapters confirmados para `evolution.send_text` e `mcp.call`. As tools nativas comerciais da B2 existem no Tool Registry e no runtime conversacional, porém ainda não possuem handler de execução dentro do executor de workflows.

Por isso, B3 não deve gerar nós `tool` nativos que aparentem ser executáveis. Capacidades sem adapter de workflow ficam registradas como pendentes no config sanitizado do nó `agent` e no resultado do endpoint. Na primeira fatia, `evolution.send_text` é o único candidato materializável, desde que haja conexão primária; `mcp.call` permanece pendente até o catálogo carregar o nome da ferramenta MCP e seus metadados de invocação. Um nó `tool` só pode ser incluído quando a tool estiver aprovada, ativa, autorizada na versão draft do agente e pertencer a um adapter explicitamente suportado pelo executor.

## Contrato do workflow gerado

Cada blueprint possui no máximo um workflow gerado por workspace. A relação deve ser persistida em tabela própria para permitir regeneração idempotente. O workflow usa trigger manual, permanece com `workflows.status = draft` e possui uma única `workflow_versions.status = draft`.

O grafo mínimo possui um nó `agent` configurado com o agente do blueprint, uma instrução derivada do briefing/objetivos e listas limitadas de capacidades de origem e capacidades pendentes. O grafo deve passar por `compileWorkflowDefinition` antes de ser persistido.

A regeneração atualiza somente a versão draft do workflow gerado. Nunca modifica uma versão publicada, nunca publica automaticamente e nunca cria um run. Se o workflow já tiver uma versão publicada, a geração deve criar ou usar uma nova versão draft conforme o contrato existente, sem sobrescrever o snapshot publicado.

## Autorização de tools

Uma tool só entra no grafo quando todos os requisitos forem verdadeiros: a proposta correspondente está aprovada; a tool está `active`; existe permissão habilitada para a versão draft do agente; o workspace da permissão coincide com o workspace do blueprint; e a chave está em uma allowlist de adapters executáveis pelo workflow. A geração não cria permissões, não aprova propostas e não eleva risco.

Tools de escrita continuam sujeitas a aprovação no nó ou no Tool Gateway. O workflow não pode usar uma tool apenas porque ela aparece na capacidade textual do blueprint.

## Segurança e isolamento

O endpoint exige autenticação e `requireWorkspaceAccess`. O agente e o blueprint devem pertencer ao workspace informado. Todas as consultas de workflow, versão, proposta, tool e permissão filtram o workspace. O frontend somente solicita a geração e apresenta o resultado.

Briefing, objetivos e capacidades são truncados e sanitizados antes de entrarem no JSON do workflow. Secrets, tokens, endpoints livres e payloads externos não entram na definição gerada.

## Critérios de aceite

A fatia foi concluída quando o endpoint passou a gerar ou regenerar um workflow draft por blueprint, persistir a relação, produzir uma definição compilável, manter versões publicadas intactas, informar capacidades pendentes, respeitar autorização e adapter de tool, bloquear acesso entre workspaces e passar typecheck, testes, suíte completa, build e preview. A próxima fase é o Evaluation Harness offline básico.

## Fora de escopo

Não publicar workflow, criar runs, chamar agentes, executar tools, criar conectores, aprovar propostas, alterar permissões, integrar n8n ou gerar nós de ferramentas nativas sem handler operacional confirmado.

## Referências

[1]: ./PLANO-CONJUNTO-NEXO-CLOUD-DE-AGENTES.md "Plano mestre de execução do Nexo Cloud"
[2]: ./PLANO-EXECUCAO-AGENT-ENGINEERING-PLANE.md "Plano do Agent Engineering Plane"
[3]: ./B2-GERACAO-GOVERNADA-DE-TOOLS.md "Geração governada de propostas de ferramentas"
[4]: ./PLANO-WORKFLOWS-AUTOMACAO-NEXO.md "Plano de workflows e automação orientada por agentes"
