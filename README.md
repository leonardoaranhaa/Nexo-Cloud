# Nexo Cloud de Agentes

Plataforma multi-tenant para criar, conectar, executar, supervisionar e medir agentes de atendimento, vendas, marketing, Ads, tráfego e operações.

## Fonte de verdade e início de sessão

A fonte de verdade operacional do produto é:

- `PLANO-CONJUNTO-NEXO-CLOUD-DE-AGENTES.md`

Antes de qualquer alteração, toda IA ou pessoa deve ler integralmente esse plano, depois ler `COMANDO-INTERNO-DESENVOLVIMENTO-NEXO-CLOUD.md` e os documentos especializados da etapa atual. A sessão deve sempre começar pelo **Próximo ponto de partida obrigatório** do plano mestre, subdividindo-o em uma menor fatia vertical antes de editar o código.

O comando interno define o método obrigatório de diagnóstico, avaliação de alinhamento, detecção de alucinação, implementação, testes e atualização documental.

## Documentos técnicos principais

- `PLANO-CONJUNTO-NEXO-CLOUD-DE-AGENTES.md` — visão, estado real, roadmap, prioridades e protocolo por sessão.
- `COMANDO-INTERNO-DESENVOLVIMENTO-NEXO-CLOUD.md` — contrato operacional para qualquer IA ou equipe.
- `MODELO-DADOS-MULTI-TENANT.md` — organizações, workspaces, agentes e isolamento.
- `ARQUITETURA-EXECUCAO-FERRAMENTAS-MCP-CONECTORES.md` — Tool Registry, políticas, secrets, conectores e MCP.
- `PLANO-WORKFLOWS-AUTOMACAO-NEXO.md` — workflows, eventos, filas, retries e aprovações.
- `PLANO-EXECUCAO-FUNCIONAL.md` — sequência funcional do produto.
- `PLANO-IAC-TERRAFORM-AWS-NEXO-CLOUD.md` — infraestrutura futura na AWS.
- `docs/CONNECTOR-RUNTIME-SECRET-RESOLVER.md` — execução server-side de conectores e secrets.

## Estado atual resumido

O núcleo local/preview do Nexo já possui organizações, workspaces, agentes, conexões, webhooks Evolution e Meta, Agent Runtime durável, Inbox, handoff, publicação e rollback, workflows, RAG persistente, CRM de qualificação, métricas, Marketplace interno, Tool Registry, aprovações, MCP Runtime, Learning RAG fundacional, Home e Configurações.

O fechamento comercial ainda requer agenda, adapters conversacionais adicionais, tool calling multi-round, atualização completa de instalações do Marketplace, RAG semântico/híbrido, executor universal de nós de workflow, observabilidade de produção, AWS permanente e billing. Ads, tráfego e Marketplace aberto são fases posteriores.

O último ciclo validado possui typecheck, build, preview e suíte com 119 testes aprovados. O plano mestre contém o status detalhado e a ordem obrigatória de continuidade.

## Requisitos

- Node.js 22+
- npm 10+
- PostgreSQL opcional para desenvolvimento inicial; sem `DATABASE_URL`, o projeto utiliza o fallback local documentado pelo código.

## Desenvolvimento local

```bash
cp .env.example .env
npm install
npm run typecheck
npm run dev
```

A aplicação de desenvolvimento utiliza a porta `8080` por padrão. Para o preview de produção local, use o script definido em `package.json`.

## Validação

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

O build pode ser executado sem banco externo; as migrations são ignoradas quando `DATABASE_URL` não está configurada. O fallback PGlite é utilizado no ambiente local/preview.

## Segurança

- Nunca faça commit de `.env`, tokens, chaves privadas ou credenciais.
- Conectores, MCP e chamadas externas devem executar no servidor.
- Recursos de negócio devem ser isolados por organização e workspace.
- O agente de produção deve executar versões publicadas, não a configuração editável.
- Ferramentas devem passar pelo Tool Gateway e respeitar schema, risco, idempotência, timeout e aprovação.
- Consulte o plano mestre e o comando interno antes de iniciar qualquer alteração estrutural.
