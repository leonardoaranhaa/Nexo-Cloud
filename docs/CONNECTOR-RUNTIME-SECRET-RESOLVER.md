# Secret Resolver e Connector Runtime

## Objetivo

A camada de conectores executa healthchecks exclusivamente no servidor. O navegador recebe apenas estados sanitizados, como `healthy`, `degraded` ou `unhealthy`. Tokens, valores de `SecretString` e headers de autenticação não são retornados pela API nem incluídos em mensagens de erro.

## Secret Resolver

O contrato `SecretProvider` recebe uma referência opaca e um escopo formado por `workspaceId` e `connectionId`. O provider AWS usa o namespace:

```text
nexo/{workspaceId}/{connectionId}/api_key
```

A referência não é o segredo. Ela identifica o item que deve existir no AWS Secrets Manager. O IAM da tarefa ou pod deve fornecer as credenciais AWS por role, nunca por token salvo no repositório ou no frontend.

Para ativar o provider AWS no ambiente de execução:

```env
NEXO_SECRETS_BACKEND=aws
AWS_REGION=sa-east-1
```

Também é necessário que o secret exista no Secrets Manager com a referência correspondente e que a role tenha permissão mínima `secretsmanager:GetSecretValue` para esse namespace.

Quando `NEXO_SECRETS_BACKEND` não é `aws`, o sistema utiliza um provider que falha explicitamente como `SECRET_PROVIDER_UNAVAILABLE`. Isso evita que um healthcheck seja marcado como bem-sucedido por causa de um fallback local.

## Provisionamento e onboarding Evolution

A tela administrativa da conexão Evolution envia a API key ao backend autenticado. A mutation exige permissão `manage` no workspace, grava a API key no AWS Secrets Manager e persiste somente a referência `secret_ref`, a URL base e o nome da instância no banco.

O caminho esperado é:

```text
tela administrativa
  → provisionEvolutionConnectionCredential
      → AWS Secrets Manager
          → secret_ref no banco
```

O provisionamento exige `NEXO_SECRETS_BACKEND=aws`. Sem esse backend, a operação falha explicitamente e não salva a credencial em fallback local.

## Adapters

O primeiro adapter específico é `EvolutionApiAdapter`. Ele usa o endpoint oficial:

```text
GET /instance/connectionState/{instanceName}
Header: apikey: <secret resolvido no servidor>
```

A URL base e o nome da instância vêm da configuração não sensível da conexão. O adapter confirma a disponibilidade/autorização da API por status HTTP, mas não interpreta o corpo como estado WhatsApp até que o schema de resposta seja formalizado.

O `HttpHealthcheckAdapter` continua disponível para conectores que forneçam uma URL explícita de healthcheck.

O primeiro adapter é `HttpHealthcheckAdapter`. Ele aceita somente uma URL de healthcheck explicitamente configurada em `config.healthcheckUrl`. URLs externas devem usar HTTPS; HTTP só é aceito para loopback em testes locais.

O adapter:

1. valida URL, timeout e nome do header;
2. resolve o segredo via `ctx.getSecret` no servidor;
3. envia o segredo somente no header configurado;
4. aplica timeout entre 500 ms e 30 s;
5. não segue redirecionamentos;
6. nunca retorna o corpo bruto da resposta;
7. converte o resultado em um status sanitizado.

Os códigos atuais são:

| Código | Interpretação |
| --- | --- |
| `ok` | O provedor respondeu com status 2xx. |
| `secret_unavailable` | O segredo não pôde ser resolvido. |
| `unauthorized` | O provedor rejeitou a credencial. |
| `rate_limited` | O provedor respondeu com 429. |
| `provider_error` | O provedor respondeu com erro 5xx. |
| `timeout` | A chamada excedeu o timeout. |
| `network_error` | A chamada não pôde ser concluída. |

A resposta persistida em `connections` contém somente `health_status`, `health_error` sanitizado e `last_healthcheck_at`.

## Limitação deliberada

A documentação consultada dos provedores não apresentou um contrato comum e estável de healthcheck que possa ser aplicado indistintamente a Evolution API, Meta Cloud API e Z-API. A documentação da Meta confirma o uso de Bearer token e os endpoints da Cloud API, enquanto a Evolution confirma API key por header; isso não é suficiente para inventar uma rota única de estado.

Por isso, apenas a Evolution possui adapter específico nesta fatia. Meta e Z-API ainda devem receber adapters próprios somente após confirmar, para cada versão do fornecedor:

- URL e método;
- header de autenticação;
- campos mínimos de configuração;
- códigos de erro;
- formato de resposta;
- limites e timeout.

Fontes consultadas: [Meta WhatsApp Cloud API Get Started](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started), [Meta Graph API — WhatsApp Business Account Phone Numbers](https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/phone_numbers/), [Evolution API README](https://github.com/evolution-foundation/evolution-api/blob/main/README.md) e [Z-API Documentation](https://developer.z-api.io/).

## Testes

A suíte `src/lib/connectors/runtime.test.ts` verifica:

- resolução de segredo por provider injetado;
- rejeição de referência inexistente;
- envio autenticado para servidor local;
- ausência do segredo e do corpo bruto na resposta;
- rejeição de endpoint externo sem HTTPS.
- chamada Evolution com o endpoint `connectionState` e header `apikey`;
- ausência da API key na configuração persistida durante o onboarding.
