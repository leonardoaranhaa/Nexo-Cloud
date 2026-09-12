# Fontes recomendadas de desenvolvimento — Nexo Cloud

**Status:** fonte de conhecimento operacional aplicada na primeira fatia B4 e obrigatória nas próximas fatias.

**Data da descoberta:** 2026-09-12.

**Escopo:** orientar o desenvolvimento do Agent Engineering Plane, do runtime, dos workflows, do Tool Gateway, do MCP Connector, do RAG e do console React.

## 1. Regra de uso

Estas fontes complementam, mas não substituem, o plano mestre, o comando interno de desenvolvimento e os contratos existentes no repositório. Nenhuma recomendação externa autoriza copiar código, alterar arquitetura, introduzir dependências ou executar chamadas externas sem validação local, revisão de segurança, teste e alinhamento multi-tenant.

A partir da próxima execução do bloco B4, toda sessão deve iniciar executando conceitualmente o comando raiz:

```text
APLICAR_FONTES_RECOMENDADAS NEXO_CLOUD
```

O comando significa:

1. ler o plano mestre, o comando interno, este documento e o plano especializado da etapa;
2. escolher somente as fontes aplicáveis à fatia atual;
3. registrar internamente quais princípios serão aplicados e quais não se aplicam;
4. verificar os contratos locais antes de usar qualquer padrão externo;
5. testar a hipótese antes de declarar a solução concluída;
6. preservar workspace isolation, Secret Resolver, Tool Gateway, auditoria, idempotência e aprovação;
7. registrar qualquer conflito entre fonte externa e arquitetura do Nexo antes de alterar código.

## 2. Fontes prioritárias para o ciclo de desenvolvimento

| Fonte | Aplicação obrigatória no Nexo | Uso a partir da B4 |
|---|---|---|
| [1] Test-Driven Development | Escrever o teste de comportamento antes da implementação de features, migrations, endpoints e correções. | Cada métrica, snapshot e comparação do Evaluation Harness deve nascer com teste de falha observável. |
| [2] Systematic Debugging | Investigar causa-raiz antes de corrigir falhas de runtime, banco, workflow, connector ou tool calling. | Toda regressão da B4 deve registrar sintoma, hipótese, evidência e causa confirmada. |
| [3] Verification Before Completion | Exigir evidência fresca de typecheck, testes, build, preview e diff antes de declarar conclusão. | Cada execução da harness deve ser validada antes de atualizar o plano mestre. |
| [4] Webapp Testing | Usar Playwright para testar rotas, formulários, estados vazios, mensagens de erro, console e fluxos visuais. | Aplicar quando a B4 expuser resultados no console do agente ou avaliações. |
| [5] MCP Builder | Projetar tools MCP com nomes descobríveis, schemas precisos, paginação, limites, erros acionáveis e controle de contexto. | Aplicar no futuro MCP Connector governado; não libera MCP direto no navegador ou fora do Tool Gateway. |
| [6] React Best Practices | Evitar waterfalls, chamadas sequenciais desnecessárias, bundle excessivo e re-renderizações evitáveis. | Aplicar em painéis de avaliação, comparações de versões e telas do Agent Engineering Plane. |

## 3. Fontes de processo e colaboração

| Fonte | Aplicação | Limite |
|---|---|---|
| [7] Subagent-Driven Development | Dividir planos em tarefas independentes, usar contexto explícito, revisão da tarefa e revisão final. | Não delegar alterações acopladas sem contrato; não substituir a revisão do plano mestre. |
| [8] Dispatching Parallel Agents | Paralelizar pesquisas ou tarefas realmente independentes. | Para fan-out de pesquisa usar também o workflow composer; comandos determinísticos em lote continuam sendo executados por script. |
| [9] Skill Creator | Transformar padrões internos de revisão, isolamento, tools e avaliação em skills próprias da Nexo. | Toda skill nova deve seguir o workflow de criação/atualização de skills e passar por revisão. |
| [10] Composition Patterns | Estruturar componentes React compostos e superfícies complexas do console. | Não introduzir abstração visual sem necessidade de produto ou contrato de dados. |

## 4. Fontes de segurança, dados e RAG

As fontes abaixo foram encontradas no catálogo curado e devem ser tratadas como referências candidatas. Antes de importar qualquer uma, a equipe deve revisar o conteúdo do repositório de origem, licença, manutenção e compatibilidade com o modelo de segurança do Nexo.

| Fonte candidata | Aplicação potencial | Condição de adoção |
|---|---|---|
| [11] OWASP Security | OWASP Top 10, ASVS, prompt injection, proteção de secrets, validação e revisão de aplicações agentic. | Usar como checklist complementar ao comando interno; não relaxar os gates server-side existentes. |
| [12] IronClaw Agent Guard | Revisão de chamadas de tools de risco, redaction, prompt injection e auditoria. | Comparar com Tool Gateway, Policy Engine e auditoria já existentes antes de integrar CLI/MCP. |
| [13] Qdrant Skills | Busca vetorial, performance, deployment e SDK para evolução do Learning RAG. | Só avaliar quando embeddings reais e índice vetorial entrarem no roadmap; manter recuperação lexical local até lá. |
| [14] Postgres Skill | Consultas read-only seguras e diagnóstico com defesa em profundidade. | Pode orientar diagnóstico; nunca conceder ao modelo SQL de escrita ou acesso fora do workspace. |
| [15] Feature Track | Memória de features, decisões, riscos e status dentro do repositório. | Pode complementar os documentos mestres, mas não pode criar uma segunda fonte de verdade. |
| [16] Skill Optimizer | Análise estática e melhoria de skills com dados de execução. | Avaliar depois que as skills internas da Nexo tiverem casos e telemetria suficientes. |

## 5. Aplicação específica à B4

A B4 é o Evaluation Harness offline comparável entre cenários e versões. A aplicação mínima das fontes é:

| Etapa B4 | Fontes usadas | Evidência exigida |
|---|---|---|
| Contrato de métricas e snapshot | [1], [5], [11] | Testes de schema, limites, sanitização e ausência de secrets. |
| Execução comparável de cenários | [1], [2], [7] | Testes de sucesso, falha esperada, isolamento e causa-raiz documentada para regressões. |
| Persistência e consulta | [1], [14] | Migration idempotente, queries workspace-scoped e teste de acesso cruzado. |
| Painel de avaliação | [4], [6], [10] | Rotas 200, estados vazios, comparação legível, logs do navegador e ausência de waterfalls evitáveis. |
| Gate de conclusão | [3], [11] | Typecheck, suíte, build, preview, diff limpo e revisão de risco antes de atualizar os planos. |

A B4 deve permanecer offline/evaluation. Ela não pode publicar agente, iniciar workflow de produção, disparar canal externo, alterar CRM real ou promover candidato automaticamente.

## 6. Critério de conflito

Quando uma fonte externa divergir do Nexo, prevalece a seguinte ordem:

1. segurança, isolamento e autorização server-side do Nexo;
2. plano mestre e comando interno do repositório;
3. contratos locais de Tool Gateway, Runtime, Workflow Engine, RAG e versões;
4. documentação oficial do fornecedor;
5. skills comunitárias e recomendações de implementação.

Uma fonte externa não pode introduzir endpoint inventado, secret no browser, chamada MCP direta, tool fora do gateway, estado global sem workspace, publicação implícita ou dependência de produção não validada.

## 7. Repositórios de origem

As skills prioritárias foram localizadas nos repositórios verificados pelo Internet Skill Finder. Os links de importação abaixo são referências; a importação efetiva deve ser uma decisão separada, após revisão do conteúdo.

| Repositório | Escopo |
|---|---|
| [17] anthropics/skills | MCP Builder, Web Application Testing, Skill Creator e outras skills oficiais. |
| [18] obra/superpowers | TDD, debugging sistemático, verificação, desenvolvimento orientado por subagentes e planejamento. |
| [19] vercel-labs/agent-skills | React Best Practices e padrões de composição/performance. |
| [20] ComposioHQ/awesome-claude-skills | Catálogo curado adicional para descoberta. |
| [21] BehiSecc/awesome-claude-skills | Catálogo curado onde foram encontrados candidatos de segurança, Postgres, Qdrant e governança. |

## 8. Referências

[1]: https://github.com/obra/superpowers/tree/main/skills/test-driven-development "Test-Driven Development"
[2]: https://github.com/obra/superpowers/tree/main/skills/systematic-debugging "Systematic Debugging"
[3]: https://github.com/obra/superpowers/tree/main/skills/verification-before-completion "Verification Before Completion"
[4]: https://github.com/anthropics/skills/tree/main/skills/webapp-testing "Web Application Testing"
[5]: https://github.com/anthropics/skills/tree/main/skills/mcp-builder "MCP Builder"
[6]: https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices "React Best Practices"
[7]: https://github.com/obra/superpowers/tree/main/skills/subagent-driven-development "Subagent-Driven Development"
[8]: https://github.com/obra/superpowers/tree/main/skills/dispatching-parallel-agents "Dispatching Parallel Agents"
[9]: https://github.com/anthropics/skills/tree/main/skills/skill-creator "Skill Creator"
[10]: https://github.com/vercel-labs/agent-skills/tree/main/skills/composition-patterns "Composition Patterns"
[11]: https://github.com/agamm/claude-code-owasp "OWASP Security"
[12]: https://github.com/wd041216-bit/ironclaw-agent-guard "IronClaw Agent Guard"
[13]: https://github.com/qdrant/skills "Qdrant Skills"
[14]: https://github.com/sanjay3290/ai-skills/tree/main/skills/postgres "Postgres Skill"
[15]: https://github.com/JunsW/feature-track "Feature Track"
[16]: https://github.com/hqhq1025/skill-optimizer "Skill Optimizer"
[17]: https://github.com/anthropics/skills "Anthropic Agent Skills"
[18]: https://github.com/obra/superpowers "Superpowers"
[19]: https://github.com/vercel-labs/agent-skills "Vercel Agent Skills"
[20]: https://github.com/ComposioHQ/awesome-claude-skills "Composio Awesome Claude Skills"
[21]: https://github.com/BehiSecc/awesome-claude-skills "BehiSecc Awesome Claude Skills"
