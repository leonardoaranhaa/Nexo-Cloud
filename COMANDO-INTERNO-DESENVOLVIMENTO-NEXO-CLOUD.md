# Comando interno de desenvolvimento — Nexo Cloud de Agentes

> **Função deste arquivo:** servir como contrato operacional obrigatório para qualquer IA, agente de código ou equipe humana que assuma a evolução do Nexo Cloud.

## 0. Regra de entrada obrigatória por sessão

Antes de planejar, editar, executar comandos, criar migrations ou responder que uma etapa foi concluída, leia integralmente, nesta ordem:

1. `PLANO-CONJUNTO-NEXO-CLOUD-DE-AGENTES.md`, que é a fonte de verdade do estado, prioridade e próximo ponto de partida do produto;
2. este arquivo;
3. os documentos especializados relacionados à etapa identificada no plano mestre.

O caminho equivalente no ambiente de projeto compartilhado é:

`/home/ubuntu/projects/nexo-cloud-780e9a6e/Plano conjunto de execução — Nexo Cloud de Agentes.md`

Se o documento mestre não existir, estiver vazio, contraditório ou desatualizado em relação ao código, a IA deve parar a implementação estrutural, registrar a divergência e atualizar o documento antes de continuar. Não deve inventar uma nova direção de produto.

A cada sessão, a IA deve partir do **Próximo ponto de partida obrigatório** do plano mestre. Deve identificar a primeira etapa incompleta, subdividi-la em uma menor fatia vertical reversível e executar somente essa fatia, salvo decisão explícita do usuário.

## 1. Identidade do produto

O Nexo Cloud é a **AWS dos agentes**: uma plataforma multi-tenant que fornece infraestrutura, ambiente de desenvolvimento, runtime, conhecimento, ferramentas, conectores, governança e catálogo para agentes de inteligência artificial.

O produto possui duas frentes que devem permanecer conectadas:

1. infraestrutura para usuários criarem, testarem, indexarem, publicarem e operarem seus próprios agentes;
2. agentes próprios de alto nível do Nexo, oferecidos para uso, customização, locação, venda ou instalação conforme o modelo comercial definido.

O Nexo deve evoluir de um estúdio de prototipação para uma nuvem especializada em agentes de atendimento, vendas, suporte, operações, marketing, gestão de anúncios, tráfego e analytics, sem limitar a plataforma a essas famílias.

A inspiração na AWS é arquitetural, não uma instrução para copiar serviços indiscriminadamente. O Nexo deve oferecer organizações, workspaces, ambientes, agentes versionados, runtime, ferramentas, MCP, conectores, workflows, eventos, filas, logs, métricas, auditoria, permissões, marketplace, APIs e automações.

O MVP EARLY é o primeiro núcleo funcional permanente do próprio Nexo Cloud. Não é uma aplicação separada, uma demo descartável ou uma linha paralela de desenvolvimento.

Toda implementação deve preservar o ciclo de vida completo do agente: criação assistida por IA, configuração, indexação de sistemas e conhecimento, teste, publicação, operação, observabilidade, atualização, rollback, instalação e eventual distribuição comercial. Um agente próprio do Nexo deve ser tratado como produto versionado com manifesto, capacidades, oferta, entitlement, instalação, customização e métricas.

## 2. Ciclo obrigatório de execução

Para qualquer solicitação de desenvolvimento, execute este ciclo na ordem:

```text
Ler o plano mestre
  → ler este comando e os documentos especializados
      → revisar alteração anterior e estado do Git
          → confrontar código, migrations, rotas e testes com o plano
              → detectar desvio, flutuação ou alucinação
                  → subdividir a próxima etapa em menor fatia vertical
                      → declarar objetivo, arquivos, riscos e aceite
                          → implementar
                              → testar
                                  → revisar diff
                                      → atualizar plano mestre quando necessário
                                          → reportar resultado
```

Nunca pule diretamente para editar código apenas porque a solicitação parece simples.

## 3. Diagnóstico inicial obrigatório

Ao assumir o projeto, execute ou registre:

```text
ASSUMIR_PROJETO NEXO_CLOUD

1. Localizar a raiz do repositório.
2. Ler integralmente PLANO-CONJUNTO-NEXO-CLOUD-DE-AGENTES.md.
3. Ler integralmente este arquivo.
4. Ler os documentos especializados da etapa atual.
5. Verificar git status, último commit e diff.
6. Inspecionar package.json, scripts, migrations, rotas e entrypoints.
7. Executar ou registrar typecheck, testes, lint e build.
8. Identificar se o ambiente é local, preview, staging ou produção.
9. Localizar a primeira etapa incompleta do próximo ponto de partida.
10. Subdividir essa etapa antes de implementar.
```

O diagnóstico deve informar objetivo, componentes afetados, dependências existentes, riscos, testes disponíveis, lacunas, relação com o plano mestre, classificação de alinhamento e reversibilidade.

## 4. Revisão obrigatória de alterações existentes

Antes de criar uma nova alteração, responda:

1. A alteração anterior está completa ou parcial?
2. Ela possui testes?
3. Usa mocks, simulações ou seeds em caminho de produção?
4. Alterou contratos públicos, migrations ou schemas?
5. Introduziu credenciais, endpoints ou comportamento não documentado?
6. Criou código duplicado em vez de reutilizar runtime, Tool Gateway ou executor existente?
7. Pode gerar mistura entre organizações ou workspaces?
8. Está compatível com a versão publicada do agente?
9. O preview diverge da produção?
10. O plano mestre e os documentos relacionados descrevem a realidade?

Se houver alteração incompleta que comprometa segurança, persistência, build ou isolamento multi-tenant, corrija ou reverta a base antes de adicionar funcionalidades.

## 5. Avaliação de alinhamento

Para cada alteração, produza internamente:

```text
AVALIAR_RUMO

- Fase do plano mestre relacionada:
- Entrega relacionada:
- Alinhamento: ALINHADA | ALINHADA_COM_RISCO | NEUTRA | DESVIO_CORRIGÍVEL | DESVIO_ARQUITETURAL | BLOQUEADA
- Benefício para o produto:
- Arquivos, entidades, endpoints ou migrations afetados:
- Risco de retrabalho:
- Decisão necessária:
```

Uma alteração é `DESVIO_ARQUITETURAL` quando cria fonte de verdade no frontend, expõe secrets, acessa dados sem workspace, executa ferramentas fora do gateway, chama MCP diretamente do navegador, usa configuração editável em produção, cria workflow sem versão ou torna um fornecedor irreversível.

## 6. Verificação contra alucinação

Antes de usar API, biblioteca, endpoint, webhook, tabela, coluna, variável de ambiente ou capacidade externa:

1. procurar contrato existente no repositório;
2. ler a versão instalada no package manifest;
3. consultar documentação confiável quando necessário;
4. confirmar schema de entrada e resposta;
5. escrever teste ou fixture;
6. tratar timeout e erro;
7. documentar a suposição restante.

Classifique cada elemento novo como confirmado no código, confirmado na documentação do fornecedor, inferido mas testável ou hipótese não confirmada. Não implemente hipótese não confirmada sem etapa de validação.

Nunca invente endpoints, marque conexão como ativa sem healthcheck, trate payload simulado como produção, use `any` para esconder contrato ou declare ação externa concluída sem verificar o efeito.

## 7. Regras permanentes de arquitetura

Toda entidade de negócio deve possuir `workspace_id` ou vínculo equivalente validado no backend. Nenhuma regra crítica deve depender do frontend. O modelo nunca recebe tokens e nunca executa funções diretamente. Ferramentas passam pelo Tool Gateway, Connector Runtime ou MCP Runtime autorizado.

Agentes de produção executam versões publicadas. Escritas externas possuem idempotência, timeout, sanitização, auditoria e política de aprovação quando necessário. O Learning RAG não deve bloquear o atendimento. Dados privados de clientes não entram no aprendizado global por padrão.

O navegador participa apenas da configuração e visualização. Credenciais permanecem server-side. Nenhum dado de um workspace pode ser consultado, inferido ou modificado por outro workspace.

## 8. Protocolo de implementação

Toda fatia deve, quando aplicável, conter:

- contrato server-side;
- migration incremental e idempotente;
- autorização multi-tenant;
- teste unitário;
- teste de integração ou isolamento;
- tratamento de falhas;
- typecheck;
- suíte relevante;
- build;
- preview;
- revisão de diff;
- atualização do plano mestre se o status mudar.

A comunicação deve ser concisa. Não enviar alertas de infraestrutura fora do escopo. Reportar somente decisão, resultado, falhas materiais, próximos passos e links de artefatos.

## 9. Critério para declarar conclusão

Uma etapa só pode ser declarada concluída quando o código, os testes, o build, o preview e o documento mestre estiverem coerentes. Se algo estiver apenas preparado, documentar como `parcial`, `planejado` ou `postergado`; nunca como concluído.

## 10. Documentos relacionados

- `PLANO-CONJUNTO-NEXO-CLOUD-DE-AGENTES.md`
- `ARQUITETURA-EXECUCAO-FERRAMENTAS-MCP-CONECTORES.md`
- `PLANO-WORKFLOWS-AUTOMACAO-NEXO.md`
- `MODELO-DADOS-MULTI-TENANT.md`
- `PLANO-EXECUCAO-FUNCIONAL.md`
- `docs/CONNECTOR-RUNTIME-SECRET-RESOLVER.md`
- `README.md`
