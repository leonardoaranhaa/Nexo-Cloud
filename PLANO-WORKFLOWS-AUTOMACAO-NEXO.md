# Plano de workflows e automação orientada por agentes

## 1. Objetivo

O módulo de workflows deve conectar agentes, ferramentas, canais e eventos em processos executáveis, observáveis e versionados.

O objetivo não é apenas desenhar fluxos visualmente. O Nexo precisa:

- receber eventos;
- iniciar execuções;
- processar nós em ordem ou por condições;
- persistir o estado;
- pausar e retomar;
- executar tarefas assíncronas;
- aplicar retries seguros;
- exigir aprovação quando necessário;
- permitir execução manual e agendada;
- registrar histórico completo;
- integrar-se ao n8n sem duplicar responsabilidades.

A abstração principal será:

```text
Gatilho → Workflow versionado → Execução → Nós → Resultado → Próximo estado
```

## 2. O que é um workflow no Nexo

Um workflow é uma definição versionada de etapas que começa com um gatilho e termina com sucesso, falha, cancelamento ou espera.

Exemplo de atendimento:

```text
Mensagem recebida no WhatsApp
  → identificar workspace e agente
  → verificar horário
  → consultar base de conhecimento
  → agente responde
  → registrar conversa
  → notificar operador se houver handoff
```

Exemplo de vendas:

```text
Novo lead recebido
  → validar telefone
  → agente qualifica lead
  → condição: lead qualificado?
      ├── não → enviar conteúdo
      └── sim → criar lead no CRM
                    → consultar agenda
                    → solicitar horário
                    → criar tarefa de follow-up
```

Exemplo de Ads:

```text
Agenda diária
  → buscar métricas das campanhas
  → calcular variações
  → condição: CPA acima do limite?
      ├── não → registrar resultado
      └── sim → agente analisa causa
                    → criar recomendação
                    → solicitar aprovação
                    → alterar orçamento, se aprovado
```

## 3. Opções de arquitetura

Antes da implementação, existem três caminhos válidos.

| Abordagem | Trade-offs | Custo | Complexidade de configuração |
|---|---|---|---|
| Motor próprio no Nexo | Controle total, melhor integração multi-tenant e com agentes; exige construir scheduler, filas e executor | Médio no desenvolvimento e crescente na operação | Alta |
| Nexo como control plane + n8n como executor | Entrega rápida, aproveita nós e integrações do n8n; dependência de instalação, credenciais e limitações do n8n | Médio, com custo operacional externo | Média |
| Workflows somente no n8n, Nexo apenas exporta | Implementação mais leve; experiência fragmentada e pouca visibilidade de runs no Nexo | Baixo inicialmente | Baixa no Nexo, alta para o cliente |

### Recomendação

Usar uma estratégia híbrida:

1. construir no Nexo um motor próprio mínimo para gatilhos, condições, agentes, ferramentas, aprovação e histórico;
2. integrar n8n como executor opcional para conectores e automações externas;
3. manter o workflow e suas permissões sob controle do Nexo;
4. não transformar o n8n em dependência obrigatória do runtime principal.

O motor próprio é importante porque o Nexo precisa conhecer o estado do agente, a versão publicada, o workspace, as ferramentas autorizadas, o consumo e o histórico de execução.

## 4. Arquitetura do módulo

```text
┌───────────────────────────────────────────────┐
│ Console Nexo                                   │
│ Editor visual · versões · runs · aprovações    │
└───────────────────────┬───────────────────────┘
                        │ API server-side
┌───────────────────────▼───────────────────────┐
│ Workflow Control Plane                         │
│ Definições · versões · permissões · gatilhos   │
└───────────────┬───────────────┬───────────────┘
                │               │
      ┌─────────▼──────┐ ┌──────▼─────────────┐
      │ Event Gateway   │ │ Scheduler          │
      │ Webhooks/events │ │ horários/intervalos│
      └─────────┬──────┘ └──────┬─────────────┘
                │               │
                └──────┬────────┘
                       ▼
             ┌────────────────────┐
             │ Queue / Dispatcher  │
             └─────────┬──────────┘
                       ▼
             ┌────────────────────┐
             │ Workflow Executor   │
             │ nós · estado · retry │
             └───┬─────────┬────────┘
                 │         │
       ┌─────────▼───┐ ┌───▼──────────────┐
       │ Agent Runtime │ │ Tool Gateway     │
       │ LLM/memória  │ │ APIs/MCP         │
       └───────────────┘ └──────────────────┘
                       │
             ┌─────────▼─────────┐
             │ Runs / Events / DB │
             └───────────────────┘
```

## 5. Modelo de dados

### 5.1 `workflows`

Representa o workflow editável.

```text
workflows
- id
- workspace_id
- name
- slug
- description
- status              -- draft, active, paused, archived
- trigger_type
- created_by
- updated_by
- created_at
- updated_at
- deleted_at
```

### 5.2 `workflow_versions`

Snapshot imutável usado pelas execuções.

```text
workflow_versions
- id
- workflow_id
- version_number
- status              -- draft, published, retired
- definition          -- JSONB com nós e edges
- input_schema        -- JSONB
- output_schema       -- JSONB
- published_by
- published_at
- created_by
- created_at
```

Uma execução nunca deve usar o workflow editável diretamente. Deve apontar para uma versão publicada.

### 5.3 `workflow_triggers`

Define como o workflow começa.

```text
workflow_triggers
- id
- workflow_id
- type                -- webhook, schedule, event, status_change, manual
- config              -- JSONB
- enabled
- secret_ref nullable
- last_received_at
- created_at
- updated_at
```

### 5.4 `workflow_runs`

Representa uma execução completa.

```text
workflow_runs
- id
- workspace_id
- workflow_id
- workflow_version_id
- trigger_id nullable
- status              -- queued, running, waiting, succeeded, failed, canceled
- input              -- JSONB sanitizado
- output             -- JSONB sanitizado
- context             -- JSONB controlado
- current_node_id
- correlation_id
- idempotency_key
- attempts
- error_code
- error_message
- started_at
- finished_at
- created_at
```

### 5.5 `workflow_node_runs`

Histórico de cada nó.

```text
workflow_node_runs
- id
- run_id
- node_id
- node_type
- status              -- queued, running, waiting, succeeded, failed, skipped
- input              -- JSONB sanitizado
- output             -- JSONB sanitizado
- attempt
- error_code
- error_message
- started_at
- finished_at
```

### 5.6 `workflow_schedules`

Para workflows executados em horários ou intervalos.

```text
workflow_schedules
- id
- workflow_id
- timezone
- cron_expression
- enabled
- next_run_at
- last_run_at
- misfire_policy       -- skip, run_once, catch_up
- created_at
- updated_at
```

### 5.7 `workflow_approvals`

Para nós que aguardam decisão humana.

```text
workflow_approvals
- id
- run_id
- node_run_id
- workspace_id
- status               -- pending, approved, rejected, expired
- requested_by
- decided_by nullable
- reason
- expires_at
- decided_at
- created_at
```

### 5.8 `workflow_events`

Para receber eventos externos e internos.

```text
workflow_events
- id
- workspace_id
- event_type
- source
- external_event_id nullable
- payload              -- JSONB sanitizado
- status               -- received, processed, ignored, failed
- correlation_id
- created_at
- processed_at
```

## 6. Definição do workflow

O editor deve salvar uma definição declarativa em JSON. Exemplo:

```json
{
  "nodes": [
    {
      "id": "trigger_message",
      "type": "trigger.webhook",
      "position": { "x": 80, "y": 180 },
      "config": {
        "event": "whatsapp.message.received"
      }
    },
    {
      "id": "agent_support",
      "type": "agent.run",
      "position": { "x": 360, "y": 180 },
      "config": {
        "agentId": "agent_123",
        "version": "published"
      }
    },
    {
      "id": "condition_handoff",
      "type": "condition",
      "position": { "x": 640, "y": 180 },
      "config": {
        "expression": "{{ agent.output.handoff }} == true"
      }
    },
    {
      "id": "tool_create_ticket",
      "type": "tool.execute",
      "position": { "x": 920, "y": 80 },
      "config": {
        "toolKey": "support.create_ticket",
        "requireApproval": false
      }
    },
    {
      "id": "wait_operator",
      "type": "approval.wait",
      "position": { "x": 920, "y": 280 },
      "config": {
        "title": "Aprovar transferência para humano",
        "expiresInMinutes": 30
      }
    }
  ],
  "edges": [
    { "from": "trigger_message", "to": "agent_support" },
    { "from": "agent_support", "to": "condition_handoff" },
    { "from": "condition_handoff", "to": "tool_create_ticket", "when": "true" },
    { "from": "condition_handoff", "to": "wait_operator", "when": "false" }
  ]
}
```

O JSON não deve ser executado diretamente. Antes da publicação, deve passar por validação e compilação.

## 7. Tipos de nós

### 7.1 Gatilho

Inicia o workflow.

Tipos iniciais:

- `trigger.webhook`;
- `trigger.event`;
- `trigger.schedule`;
- `trigger.status_change`;
- `trigger.manual`.

### 7.2 Agente

Executa uma versão publicada ou uma versão de teste explicitamente selecionada.

```text
agent.run
- agent_id
- agent_version_id
- input_mapping
- max_rounds
- output_schema
```

O agente deve executar pelo mesmo Agent Runtime usado no atendimento real. Não duplicar lógica de modelo no executor de workflows.

### 7.3 Ferramenta

Chama uma ferramenta do Tool Gateway.

```text
tool.execute
- tool_id/tool_key
- connector_instance_id
- input_mapping
- timeout
- retry_policy
- require_approval
```

### 7.4 Condição

Avalia uma expressão segura e escolhe uma saída.

Não executar JavaScript arbitrário fornecido pelo usuário. Usar uma DSL limitada ou JSON Logic.

Exemplo:

```json
{
  "and": [
    { ">": [{ "var": "lead.score" }, 70] },
    { "==": [{ "var": "lead.country" }, "BR"] }
  ]
}
```

### 7.5 Espera

Pausa a execução até uma data, evento ou resposta.

Tipos:

- `wait.duration`;
- `wait.until`;
- `wait.event`;
- `wait.reply`.

A espera deve persistir o estado no banco. Nunca depender de `setTimeout` em memória.

### 7.6 Aprovação

Pausa o workflow e cria uma tarefa humana.

Exemplos:

- aprovar alteração de orçamento;
- aprovar publicação de anúncio;
- aprovar envio de proposta;
- aprovar exclusão;
- aprovar transferência de atendimento.

### 7.7 Condição de erro

Permite direcionar falhas:

```text
sucesso → próximo nó
erro transitório → retry
erro permanente → tratamento de erro
aprovação expirada → fallback
```

### 7.8 Transformação

Normaliza dados entre nós:

- mapear campos;
- extrair texto;
- juntar dados;
- formatar datas;
- calcular métricas;
- remover dados sensíveis.

## 8. Gatilhos

### 8.1 Webhook

Cada workflow ativo pode ter um endpoint próprio:

```text
POST /api/hooks/workflows/{workspaceSlug}/{triggerToken}
```

Requisitos:

- token não previsível;
- assinatura HMAC quando o provedor suportar;
- limite de tamanho de payload;
- rate limit;
- idempotência por `external_event_id`;
- registro do evento antes do processamento;
- resposta rápida ao provedor;
- processamento assíncrono para fluxos longos.

### 8.2 Horário

Usar expressão cron, timezone explícito e política de falha:

- `skip`: ignora execuções perdidas;
- `run_once`: executa uma vez ao voltar;
- `catch_up`: executa todas as pendentes, somente quando seguro.

A primeira implementação pode usar o scheduler do ambiente de hospedagem para disparar uma rota interna. O scheduler não deve conter a lógica do workflow; ele apenas cria um `workflow_run`.

### 8.3 Evento interno

Eventos emitidos pelo próprio Nexo:

```text
agent.published
agent.paused
conversation.created
conversation.closed
lead.created
lead.qualified
message.received
message.failed
tool.execution.failed
approval.approved
```

Os eventos devem possuir `event_id`, `event_type`, `workspace_id`, `source`, `occurred_at` e payload versionado.

### 8.4 Mudança de status

Pode ser implementada como evento interno especializado:

```text
campaign.status_changed
lead.stage_changed
connection.status_changed
agent.status_changed
```

Não executar workflows diretamente dentro da transação que altera o status. Primeiro confirmar a transação; depois emitir o evento ou usar uma tabela outbox.

### 8.5 Execução manual

Permitir que usuário autorizado execute uma versão publicada ou de teste.

A execução manual deve registrar:

- usuário executor;
- versão usada;
- input fornecido;
- workspace;
- horário;
- motivo opcional.

## 9. Event bus e Outbox Pattern

Para não perder eventos, usar o padrão Outbox:

```text
Transação de negócio
  → salva alteração
  → grava evento na outbox
  → commit
  → dispatcher lê outbox
  → cria workflow_run
```

Tabela conceitual:

```text
outbox_events
- id
- workspace_id
- event_type
- aggregate_type
- aggregate_id
- payload
- status
- attempts
- available_at
- published_at
- created_at
```

Isso evita o problema de alterar um lead com sucesso e falhar antes de iniciar o workflow.

## 10. Executor e máquina de estados

O executor deve tratar cada run como uma máquina de estados persistida.

```text
queued
  → running
      ├── waiting
      │     ├── resumed
      │     └── expired
      ├── retrying
      ├── succeeded
      ├── failed
      └── canceled
```

Cada nó também possui estado próprio.

### Algoritmo conceitual

```ts
async function executeRun(runId: string) {
  const run = await loadRun(runId);
  const definition = await loadPublishedDefinition(run.workflowVersionId);

  while (true) {
    const node = nextRunnableNode(run, definition);
    if (!node) return finishRun(run, "succeeded");

    const nodeRun = await startNodeRun(run, node);

    try {
      const result = await executeNode(node, buildNodeContext(run, node));
      await persistNodeSuccess(nodeRun, result);
      await advanceRun(run, node, result);
    } catch (error) {
      const action = classifyFailure(error, node);
      if (action === "retry") {
        await scheduleRetry(run, nodeRun, error);
        return;
      }
      if (action === "wait") {
        await pauseRun(run, nodeRun, error);
        return;
      }
      await failRun(run, nodeRun, error);
      return;
    }
  }
}
```

O executor não deve depender de estado em memória para saber onde a execução parou. O worker pode morrer e a execução deve ser retomável.

## 11. Filas e workers

### Fila inicial

Para o MVP, pode ser usada uma fila baseada no banco, desde que haja:

- `FOR UPDATE SKIP LOCKED`;
- lease com expiração;
- contador de tentativas;
- `available_at`;
- heartbeat;
- recuperação de jobs abandonados.

### Evolução

Quando o volume crescer, migrar para um broker ou serviço de filas dedicado.

Filas sugeridas por finalidade:

```text
workflow.trigger
workflow.run
workflow.retry
workflow.approval
workflow.schedule
workflow.dead_letter
```

A fila deve separar tarefas rápidas de tarefas longas. Uma chamada de API simples não deve ficar bloqueada por um relatório de Ads ou um lote de contatos.

## 12. Retries e Dead Letter Queue

Cada nó deve possuir política própria:

```json
{
  "maxAttempts": 3,
  "backoff": "exponential",
  "initialDelayMs": 1000,
  "maxDelayMs": 30000,
  "retryOn": ["TIMEOUT", "429", "502", "503", "504"]
}
```

Não repetir automaticamente:

- argumentos inválidos;
- permissão negada;
- credencial revogada;
- aprovação rejeitada;
- operação destrutiva sem idempotência;
- erro de regra de negócio.

Após o limite de tentativas, enviar para uma Dead Letter Queue e marcar o run como `failed` ou `waiting_human`, conforme a política.

## 13. Contexto e mapeamento de dados

Cada execução possui um contexto controlado:

```json
{
  "trigger": {},
  "workflow": {},
  "agent": {},
  "lead": {},
  "conversation": {},
  "nodes": {
    "node_a": { "output": {} }
  },
  "meta": {
    "runId": "run_123",
    "workspaceId": "ws_123",
    "traceId": "trace_123"
  }
}
```

O editor deve permitir referências como:

```text
{{ trigger.phone }}
{{ nodes.qualify.output.score }}
{{ lead.email }}
```

O sistema deve validar referências na publicação. Uma variável inexistente deve gerar erro de validação ou valor nulo explícito, não uma string silenciosamente incorreta.

Dados sensíveis devem ser marcados e mascarados em logs.

## 14. Editor visual

O editor pode usar um canvas de nós semelhante ao conceito já existente em `FlowCanvas`, mas workflow é diferente do trace de execução.

### Recursos do editor MVP

- criar nós;
- conectar nós;
- mover nós;
- editar configuração;
- selecionar gatilho;
- configurar condições;
- visualizar erros de validação;
- salvar rascunho;
- duplicar workflow;
- publicar versão;
- executar teste com input de exemplo.

### Validações antes da publicação

- existe exatamente um gatilho inicial;
- todos os nós são alcançáveis;
- não há ciclos não permitidos;
- cada saída condicional possui destino;
- ferramentas existem e estão autorizadas;
- agentes possuem versão válida;
- schemas de entrada e saída são compatíveis;
- nós de aprovação possuem expiração;
- workflows não excedem limites de profundidade e quantidade de nós;
- não há credenciais embutidas na definição.

O editor pode permitir loops somente por um nó explícito de repetição com limite máximo de itens e iterações.

## 15. Integração com agentes

O nó `agent.run` deve usar o mesmo runtime dos agentes de atendimento.

Entrada:

```json
{
  "message": "Analise este lead e classifique a oportunidade",
  "context": {
    "lead": {},
    "conversation": {}
  }
}
```

Configuração:

```json
{
  "agentVersionId": "agent_version_123",
  "maxToolRounds": 3,
  "outputSchema": {
    "type": "object",
    "properties": {
      "score": { "type": "number" },
      "qualified": { "type": "boolean" },
      "reason": { "type": "string" }
    },
    "required": ["score", "qualified"]
  }
}
```

O output do agente deve ser estruturado quando for utilizado por uma condição ou ferramenta seguinte. Não usar texto livre para controlar decisões críticas.

## 16. Integração com ferramentas e MCP

O nó `tool.execute` deve chamar o Tool Gateway descrito na arquitetura de ferramentas.

O workflow não deve receber um token ou URL arbitrária. Ele deve referenciar:

```text
tool_id
connector_instance_id
input_mapping
```

O Policy Engine deve verificar:

- a ferramenta pertence ao workspace;
- a ferramenta está ativa;
- a versão do workflow tem permissão;
- a ação exige aprovação;
- há limite disponível;
- a instância do conector está saudável.

Para MCP, o workflow referencia uma ferramenta aprovada do catálogo. Não permitir descoberta dinâmica durante uma execução de produção.

## 17. Aprovação humana

A aprovação deve interromper o workflow com estado `waiting`.

```text
workflow run
  → approval node
  → approval pending
  → operador aprova/rejeita
  → evento approval.approved/rejected
  → workflow retoma ou encerra
```

A tela deve exibir:

- motivo da solicitação;
- dados que serão enviados;
- efeito esperado;
- ferramenta envolvida;
- agente e versão;
- prazo para decidir;
- usuário solicitante.

A aprovação deve ser específica para aquela execução. Não transformar uma aprovação pontual em autorização permanente sem uma configuração explícita.

## 18. Execução manual, agendada e por evento

### Manual

Botão “Executar agora” no console, com input de teste e escolha de ambiente.

### Agendada

O scheduler identifica workflows ativos e cria runs. Ele não executa diretamente os nós.

### Evento

O Event Gateway valida, grava e publica o evento. O dispatcher encontra workflows compatíveis e cria runs com idempotência.

### Mudança de status

A alteração de status grava evento na mesma transação ou via outbox. O workflow inicia somente depois do commit.

## 19. Integração com n8n

A integração deve ter três níveis.

### Nível 1 — Exportação

O Nexo gera um workflow n8n com:

- webhook ou trigger;
- transformação de payload;
- chamada ao agente;
- chamada de ferramenta;
- resposta;
- metadata da versão.

O arquivo exportado deve ser identificado como `exported`, não como `published` no Nexo.

### Nível 2 — Invocação de workflow n8n

O Nexo chama um webhook do n8n como um nó externo:

```text
n8n.execute
- workflow_reference
- webhook_url_ref
- input_mapping
- timeout
- retry_policy
```

A URL e o segredo devem ficar em `connector_instances` ou secret manager.

### Nível 3 — Sincronização de status

Quando disponível, o n8n envia callback ao Nexo com:

- `run_id`;
- status;
- output sanitizado;
- erro;
- timestamps.

O Nexo não deve depender de polling agressivo. Usar callback/webhook quando o ambiente n8n suportar; caso contrário, polling com intervalo controlado e limite de duração.

### O que fica no Nexo e o que fica no n8n

| Responsabilidade | Nexo | n8n |
|---|---:|---:|
| Identidade e workspace | Sim | Não |
| Versão e publicação do agente | Sim | Não |
| Permissões de ferramentas | Sim | Não |
| Conversas e memória do agente | Sim | Opcional |
| Integrações genéricas | Sim, via conectores | Sim, forte |
| Workflows de negócio externos | Opcional | Sim |
| Auditoria central | Sim | Parcial |
| Execução de nós | Sim para o núcleo | Sim para exportados |

## 20. Observabilidade

Cada execução deve possuir:

- `run_id`;
- `trace_id`;
- `workspace_id`;
- `workflow_version_id`;
- `node_run_id`;
- status;
- latência;
- tentativas;
- custo estimado;
- erro classificado;
- origem do gatilho.

O painel deve mostrar:

- runs por período;
- taxa de sucesso;
- tempo médio;
- nós com mais falhas;
- workflows pausados;
- aprovações pendentes;
- consumo por workspace;
- Dead Letter Queue;
- últimas execuções.

## 21. Segurança

### Isolamento

Toda tabela de workflow deve possuir `workspace_id` direto ou ser alcançável por uma entidade que possua esse campo. O backend deve verificar membership antes de consultar ou executar.

### Webhooks

- tokens longos e aleatórios;
- HMAC quando possível;
- replay protection;
- rate limit;
- idempotência;
- payload máximo;
- logs sanitizados.

### Condições

Não executar JavaScript arbitrário. Usar JSON Logic ou DSL limitada.

### Execuções

- limite de profundidade;
- limite de nós;
- limite de duração;
- limite de chamadas de ferramentas;
- limite de loops;
- cancelamento;
- isolamento de credenciais.

### Ações de risco

Exigir aprovação ou política expressa para operações destrutivas, financeiras ou públicas.

## 22. Roadmap de implementação

### Sprint 1 — Fundamento

- tabelas de workflow;
- estados de run;
- definição JSON;
- API de rascunho;
- validação básica;
- execução manual simples.

### Sprint 2 — Editor visual

- canvas;
- nós de gatilho, agente, condição, ferramenta e espera;
- salvar e carregar definição;
- validação visual;
- publicação de versão.

### Sprint 3 — Event Gateway

- webhook;
- eventos internos;
- outbox;
- idempotência;
- dispatcher.

### Sprint 4 — Scheduler e filas

- cron e timezone;
- fila de runs;
- worker;
- retries;
- dead letter;
- retomada de execução.

### Sprint 5 — Aprovações e operação

- painel de runs;
- aprovação humana;
- cancelamento;
- retry manual;
- logs e métricas.

### Sprint 6 — n8n

- exportação;
- nó de invocação;
- callbacks;
- sincronização de status;
- documentação.

### Sprint 7 — Escala

- filas dedicadas;
- concorrência por workspace;
- quotas;
- circuit breakers;
- retenção de logs;
- billing por execução.

## 23. MVP recomendado

O MVP deve suportar somente estes nós:

```text
trigger.webhook
trigger.manual
trigger.schedule
agent.run
condition
transform
wait.duration
tool.execute
approval.wait
notification.send
```

E estes estados:

```text
queued
running
waiting
succeeded
failed
canceled
```

O primeiro workflow demonstrável deve ser:

```text
Novo lead via webhook
  → agente qualifica
  → condição de score
  → CRM cria lead
  → condição de interesse
  → agenda consulta disponibilidade
  → aprovação humana se necessário
  → envia confirmação
  → registra resultado
```

## 24. Critérios de aceite

O módulo estará pronto para MVP quando:

1. Um usuário autorizado cria um workflow no workspace correto.
2. O editor salva e reabre a definição sem perda de nós.
3. O sistema rejeita um workflow inválido antes da publicação.
4. Uma versão publicada é imutável.
5. A execução manual cria um `workflow_run` rastreável.
6. O webhook cria uma execução com idempotência.
7. O scheduler cria runs no timezone configurado.
8. O executor sobrevive a uma reinicialização e retoma o estado.
9. Condições não executam código arbitrário.
10. Um nó de agente usa uma versão válida e schema de saída.
11. Um nó de ferramenta respeita o Tool Gateway e as permissões.
12. Um nó de aprovação pausa e retoma a execução corretamente.
13. Retries não duplicam operações de escrita.
14. Falhas persistentes vão para a Dead Letter Queue.
15. O painel mostra histórico por workflow, versão, run e nó.
16. O n8n pode ser invocado ou receber um workflow exportado.

## 25. Próxima implementação no código atual

A aplicação já possui conceitos visuais de fluxo em `src/components/flow-canvas.tsx` e regras de execução em `src/lib/pipeline.ts`, mas eles representam o trace de um agente e não um motor de workflows persistente.

A próxima implementação deve criar módulos separados:

```text
src/lib/workflows/types.ts
src/lib/workflows/validation.ts
src/lib/workflows/compiler.ts
src/lib/workflows/executor.ts
src/lib/workflows/expressions.ts
src/lib/workflows/retries.ts
src/lib/workflows/idempotency.ts
src/lib/workflows/events.ts
src/lib/workflows/scheduler.ts
src/lib/workflows/n8n.ts
```

No backend:

```text
server/workflows/router.ts
server/workflows/runner.ts
server/workflows/worker.ts
server/workflows/outbox.ts
server/workflows/approvals.ts
```

No frontend:

```text
src/routes/workflows/index.tsx
src/routes/workflows/$id.tsx
src/components/workflow-editor.tsx
src/components/workflow-node-palette.tsx
src/components/workflow-run-panel.tsx
src/components/workflow-approval-panel.tsx
```

## 26. Recomendação final

O Nexo deve construir um motor próprio mínimo para controlar:

- identidade;
- workspace;
- versões;
- permissões;
- agentes;
- ferramentas;
- aprovações;
- histórico;
- consumo.

O n8n deve ser tratado como uma extensão de execução e integração, não como a fonte de verdade da plataforma.

A sequência recomendada é:

```text
Definição versionada
  → validação
      → gatilho
          → fila
              → executor persistente
                  → agente/ferramenta
                      → condição/aprovação
                          → resultado auditável
```

Com essa base, o Nexo poderá automatizar atendimento, vendas, CRM, campanhas, tráfego e operações usando o mesmo motor, sem criar um sistema diferente para cada família de agentes.
