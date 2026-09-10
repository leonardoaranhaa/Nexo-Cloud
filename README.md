# Nexo Cloud de Agentes

Plataforma em evolução para criar, conectar, executar e supervisionar agentes de atendimento, vendas, marketing, Ads, tráfego e operações.

## Estado atual

Este repositório contém o protótipo inicial do Nexo Studio e os documentos de arquitetura para a evolução em direção ao Nexo Cloud multi-tenant.

A direção oficial está documentada em:

- `PLANO-CONJUNTO-NEXO-CLOUD-DE-AGENTES.md`;
- `MODELO-DADOS-MULTI-TENANT.md`;
- `ARQUITETURA-EXECUCAO-FERRAMENTAS-MCP-CONECTORES.md`;
- `PLANO-WORKFLOWS-AUTOMACAO-NEXO.md`;
- `PLANO-IAC-TERRAFORM-AWS-NEXO-CLOUD.md`.

O comando interno para qualquer pessoa ou IA que assuma o desenvolvimento está em `COMANDO-INTERNO-DESENVOLVIMENTO-NEXO-CLOUD.md`.

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

A aplicação de desenvolvimento utiliza a porta `8080` por padrão.

## Validação

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

O build pode ser executado sem banco externo; as migrations são ignoradas quando `DATABASE_URL` não está configurada. Os testes atuais contêm contratos dependentes do ambiente de preview e devem ser estabilizados antes de configurar CI obrigatório.

## Segurança

- Nunca faça commit de `.env`, tokens, chaves privadas ou credenciais.
- Conectores, MCP e chamadas externas devem executar no servidor.
- Recursos de negócio devem ser isolados por organização e workspace.
- O agente de produção deve executar versões publicadas, não a configuração editável.
- Consulte o comando interno antes de iniciar uma alteração estrutural.

## Próximo passo

Implementar a primeira fatia vertical da Fase 1: organizações, workspaces, memberships, agentes persistentes e autorização server-side, com migration, testes de isolamento e migração progressiva do estado local.
