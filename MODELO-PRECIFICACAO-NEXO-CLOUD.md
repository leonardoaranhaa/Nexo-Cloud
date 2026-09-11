# Modelo de precificação do Nexo Cloud

**Status:** modelo comercial e operacional v1 para validação interna.

**Objetivo:** transformar o Nexo Cloud em uma plataforma com cobrança previsível, elástica e auditável, inspirada na arquitetura de preços da AWS, sem copiar sua tabela de serviços.

## 1. Decisão executiva

O Nexo Cloud deve adotar um modelo híbrido de **plano base + consumo medido + capacidades provisionadas + ofertas de compromisso**.

O plano base paga o direito de operar o Control Plane, acessar as capacidades incluídas e receber suporte compatível com a faixa contratada. O consumo medido remunera o uso variável do Agent Runtime, modelos, mensagens, ferramentas, conhecimento e armazenamento. Capacidades provisionadas remuneram recursos que permanecem reservados ou disponíveis mesmo quando não estão sendo usados. Ofertas de compromisso reduzem o preço unitário em troca de permanência ou gasto mínimo acordado.

A fatura deve ser consolidada por organização, mas detalhada por workspace, agente, ambiente, produto instalado e dimensão de consumo. O workspace continua sendo a principal unidade de isolamento técnico e de alocação de custo.

> **Princípio:** o cliente paga pelo que provisiona e pelo que consome; não paga por capacidades que não foram habilitadas no seu contexto.

A referência da AWS é adequada porque combina pagamento sob demanda, planos de tarifa fixa, descontos por volume, compromissos, medição por dimensões e budgets. A AWS descreve seu modelo principal como pay-as-you-go, mas também oferece flat rate, descontos por compromisso e descontos por volume [1]. No Marketplace, o consumo pode ser medido por dimensões como usuários, hosts, dados, bandwidth, tiers e unidades customizadas [2].

## 2. O que será cobrado

A cobrança será organizada em quatro grupos. O primeiro é a plataforma, que cobre governança e capacidade administrativa. O segundo é o runtime, que cobre execução e processamento variável. O terceiro é a operação, que cobre canais, ferramentas, conhecimento e armazenamento. O quarto é o ecossistema, que cobre produtos instalados do Marketplace.

| Grupo | Dimensão inicial | Unidade de medição | Regra comercial |
|---|---|---|---|
| Plataforma | Workspace ativo | workspace-mês | Incluído conforme o plano ou cobrado como capacidade adicional |
| Plataforma | Agente publicado | agente-mês | Cobra apenas agentes publicados, não drafts |
| Plataforma | Assento administrativo | usuário-mês | Incluído conforme o plano; excesso pode ser cobrado |
| Runtime | Execução de agente | execução | Uma reserva de execução no runtime, inclusive quando termina em erro controlado |
| Runtime | Tokens de entrada | 1 milhão de tokens | Medidos por modelo e versionados no ledger |
| Runtime | Tokens de saída | 1 milhão de tokens | Medidos por modelo e versionados no ledger |
| Runtime | Avaliação offline | cenário executado | Separada do tráfego de produção |
| Operação | Mensagem outbound | mensagem entregue ao provedor | Custos do provedor aparecem como pass-through quando aplicável |
| Operação | Invocação de ferramenta | chamada autorizada | Pode ter multiplicador por classe de risco ou provedor |
| Operação | Consulta de conhecimento | consulta RAG | Medida quando a consulta é executada pelo runtime |
| Operação | Armazenamento de conhecimento | GB-mês | Cobrança por armazenamento publicado e persistido |
| Operação | Retenção de observabilidade | GB-mês | Gratuita em retenção curta; cobrada em retenção estendida |
| Ecossistema | Instalação de produto | instalação-mês | Cobrança definida pela oferta do produto |
| Ecossistema | Uso de produto | dimensão do manifesto | O autor escolhe unidade, tier ou assinatura |

Os tokens devem permanecer separados entre entrada e saída. Isso preserva transparência, permite diferenciar modelos e evita esconder custos assimétricos atrás de uma única unidade artificial. Para o primeiro lançamento comercial, a interface pode apresentar um **AI Unit** agregado, mas a fatura deve preservar os componentes originais.

## 3. Estrutura dos planos

Os planos não devem transformar todas as capacidades em toggles globais. Cada plano concede entitlements, limites e permissões contextuais. Um workspace de desenvolvimento pode ter acesso a testes offline sem ter direito a publicar em produção. Uma conexão pode existir sem estar saudável. Um produto pode estar instalado sem estar habilitado para determinado agente.

Os valores abaixo são **hipóteses de lançamento em BRL**, destinadas a teste de posicionamento e unit economics. Não devem ser codificados como preço definitivo sem validar custo de modelo, suporte, infraestrutura e margem.

| Plano | Preço base de hipótese | Público | Inclui | Excedente |
|---|---:|---|---|---|
| Sandbox | R$ 0/mês | Exploração e desenvolvimento inicial | 1 workspace, 1 agente publicado, testes offline, quota reduzida, sem SLA | Bloqueio ao atingir quota; sem cobrança automática |
| Builder | R$ 99/mês | Pequenas operações | 3 workspaces, 5 agentes publicados, runtime incluído até franquia, conexões e CRM conforme contexto | Pay-as-you-go ou upgrade |
| Scale | R$ 499/mês | Operações com múltiplos agentes | 10 workspaces, 25 agentes publicados, maior franquia de runtime, retenção ampliada, budgets e suporte prioritário | Pay-as-you-go com desconto de volume |
| Enterprise | Sob contrato | Organizações com governança e compromisso | Workspaces e ambientes negociados, SSO, políticas avançadas, suporte e compromisso de consumo | Tabela privada, commitment e condições comerciais |

O preço base não deve incluir ilimitado. Cada plano declara explicitamente suas franquias, limites, retenção, ambientes, capacidades e suporte. A ausência de um limite visível cria risco de margem e torna impossível explicar a fatura.

## 4. Consumo e franquias

Cada plano pode incluir uma franquia mensal. A franquia é consumida antes do overage e não se converte automaticamente em saldo financeiro. O consumo acima da franquia segue preço sob demanda, quando o workspace possui essa política habilitada.

A quota operacional e a cobrança possuem funções diferentes:

| Conceito | Função | Exemplo |
|---|---|---|
| Quota | Protege o sistema e controla execução | Máximo diário de execuções por workspace e agente |
| Budget | Avisa ou bloqueia por gasto estimado | Alertar em 80% do orçamento mensal |
| Franquia | Define o que está incluído no plano | 25.000 execuções no Builder |
| Ledger | Registra o fato faturável | Uma execução, seus tokens, custo e dimensões |
| Entitlement | Define o que o cliente pode usar | Acesso a Meta, MCP, retenção estendida ou Marketplace |

A quota diária atualmente implementada no Agent Runtime deve permanecer como proteção operacional. Ela não deve ser usada como substituto do ledger de cobrança. A próxima evolução deve criar limites mensais e budgets sobre eventos de uso, sem remover o limite diário que protege o runtime.

## 5. Três modos de cobrança

### 5.1 On-demand

O modo on-demand não exige prazo contratual. O cliente paga o preço unitário publicado para o consumo medido acima da franquia. Ele é o modo padrão para Builder e Scale porque reduz a barreira de entrada e acompanha a elasticidade do uso.

### 5.2 Capacity plan

O capacity plan combina uma tarifa base com capacidade incluída. Ele é adequado para clientes que desejam previsibilidade, mas não precisam assumir compromisso de longo prazo. O plano pode aumentar workspaces, agentes, retenção, franquia e suporte sem alterar a lógica de medição.

### 5.3 Commitment

O commitment concede desconto em troca de permanência ou gasto mínimo mensal. Ele deve ser aplicável à plataforma e ao runtime do Nexo, não a custos de terceiros que o Nexo não controla. Devem existir ofertas de 12 e 36 meses apenas depois de termos dados de consumo suficientes.

O compromisso deve definir claramente o que acontece com saldo não usado, downgrade, suspensão, encerramento antecipado e crescimento acima do compromisso. O cliente não deve receber um desconto cuja unidade seja impossível de auditar.

## 6. Marketplace e agentes próprios

Cada produto do Marketplace deve possuir uma oferta independente, vinculada a uma versão e a um manifesto de capacidades. O autor pode escolher uma das estruturas abaixo:

| Oferta | Cobrança | Uso recomendado |
|---|---|---|
| Free | R$ 0 | Template, conector ou agente de entrada |
| Subscription | Mensal ou anual | Produto com capacidade previsível |
| Usage | Dimensão por uso | Produto cujo custo cresce com chamadas ou dados |
| Contract | Quantidade de unidades contratadas | Cliente que compra capacidade antecipada |
| Contract + usage | Franquia contratada mais excedente | Produto profissional com consumo variável |
| BYOL | O cliente fornece licença ou provedor | Integrações e modelos controlados pelo cliente |

O produto instalado concede um entitlement. O entitlement não significa que todas as funções estão habilitadas: o workspace ainda precisa satisfazer dependências de conexão, ambiente, versão, permissão e healthcheck.

A AWS Marketplace permite pricing por uso, categorias e múltiplas dimensões, além de contratos e ofertas privadas [2] [3]. O Nexo deve adotar a mesma separação entre **oferta**, **entitlement**, **metering** e **fatura**, mas mantendo o billing dentro do Control Plane do Nexo.

## 7. Custos de terceiros

Custos de Meta, Evolution hospedada pelo cliente, provedores de modelo, armazenamento externo, SMS, WhatsApp e outros serviços não devem ser escondidos na margem do plano. Cada item deve aparecer em uma destas categorias:

1. **Incluído pelo Nexo:** custo absorvido e limitado pela franquia.
2. **Repassado:** custo de terceiro apresentado como pass-through, com fonte e período.
3. **BYOK/BYOL:** cliente fornece a credencial, licença ou conta do provedor.
4. **Markup explícito:** Nexo adiciona taxa publicada sobre o custo de terceiro.

No primeiro lançamento, a recomendação é usar **BYOK ou pass-through** para modelos e canais que podem gerar variação material de custo. O Nexo deve informar estimativa, atraso de medição e eventual diferença entre custo provisionado e custo final.

## 8. Ledger de cobrança

O ledger deve ser append-only. Nenhuma tela deve calcular fatura somando diretamente tabelas operacionais mutáveis. Cada evento faturável precisa carregar o contexto completo no momento da medição.

| Campo | Obrigatório | Finalidade |
|---|---:|---|
| `id` | Sim | Identificador idempotente do evento |
| `organization_id` | Sim | Conta pagadora |
| `workspace_id` | Sim | Alocação multi-tenant |
| `agent_id` | Não | Alocação por agente |
| `environment` | Sim | Desenvolvimento, staging ou produção |
| `dimension` | Sim | Unidade faturável |
| `quantity` | Sim | Quantidade medida |
| `unit_price_snapshot` | Sim | Preço válido no momento do evento |
| `currency` | Sim | Moeda da oferta |
| `provider_cost` | Não | Custo de terceiro, se houver |
| `source_event_id` | Sim | Evento operacional de origem |
| `idempotency_key` | Sim | Evita dupla cobrança |
| `occurred_at` | Sim | Momento do uso |
| `rated_at` | Sim | Momento da tarifação |
| `metadata_redacted` | Sim | Contexto sem segredo ou conteúdo sensível |

A cobrança deve ser reproduzível. Se a tabela de preços mudar, eventos anteriores continuam usando o snapshot do preço que estava vigente quando foram tarifados.

## 9. Budgets e proteção contra surpresa

Todo workspace pago deve possuir um budget padrão configurável. O cliente pode definir orçamento mensal por organização, workspace, agente, produto ou dimensão. O sistema deve emitir alertas em 50%, 80%, 100% e previsão de estouro.

A AWS Budgets permite monitorar custo e uso, alertar sobre valores atuais e previstos e, em cenários específicos, aplicar ações de controle [4]. O Nexo deve começar com alertas e bloqueio de novas execuções faturáveis. A suspensão automática de conexões ou publicação deve exigir política explícita e papel administrativo.

O budget não deve interromper uma execução já iniciada sem segurança. O gate deve ocorrer antes da reserva de quota e antes da chamada de modelo ou ferramenta faturável.

## 10. Arquitetura técnica proposta

A implementação deve ocorrer em camadas, sem misturar pricing com o runtime atual:

```text
Runtime / Tool Gateway / Dispatch / RAG
        → usage events append-only
        → metering aggregation
        → price catalog snapshot
        → rating ledger
        → budget evaluation
        → invoice period / statement
```

A primeira migration comercial deve criar somente o catálogo e a política de entitlements. A medição de tokens e valores deve ser adicionada depois que os eventos de runtime estiverem estáveis. O runtime atual já possui `workspace_id`, `agent_id`, `trace_id` e logs de execução, que são suficientes para iniciar a correlação sem incluir conteúdo privado no ledger.

As entidades recomendadas são:

- `pricing_plans`;
- `pricing_plan_entitlements`;
- `pricing_dimensions`;
- `pricing_rates`;
- `workspace_billing_accounts`;
- `workspace_budgets`;
- `usage_events`;
- `rated_usage_ledger`;
- `marketplace_offers` com dimensões e snapshots;
- `billing_periods`.

Todas as entidades de organização e workspace devem ser filtradas server-side. O frontend deve exibir catálogo e estimativas, mas nunca decidir preço, entitlement, quota ou bloqueio.

## 11. Ordem de implementação

A ordem recomendada é:

1. Definir catálogo versionado de dimensões e planos sem cobrança automática.
2. Separar quota operacional de franquia comercial.
3. Emitir eventos de uso para execução, tokens, ferramentas, mensagens e RAG.
4. Criar ledger idempotente com snapshot de preço.
5. Criar budgets e alertas por workspace.
6. Exibir estimativa e detalhamento no console.
7. Adicionar overage on-demand com bloqueio configurável.
8. Adicionar Marketplace usage e contract + usage.
9. Adicionar commitments de 12 e 36 meses após dados reais.
10. Integrar provedor de pagamentos somente quando o ledger estiver reconciliável.

## 12. Decisões que ficam postergadas

Os seguintes pontos não devem ser inventados agora:

- preço final por milhão de tokens;
- margem sobre modelos específicos;
- taxas de Meta, WhatsApp, SMS ou Evolution;
- impostos e emissão fiscal por país;
- moeda de liquidação para organizações internacionais;
- créditos promocionais e rollover;
- proration em upgrade, downgrade e cancelamento;
- cobrança automática e método de pagamento.

Essas decisões dependem de custo real, volume, suporte, país de operação, provedor de pagamento e validação comercial. O modelo técnico deve suportá-las sem codificar valores provisórios como verdade de produção.

## 13. Critérios de aceite do modelo

O modelo será considerado pronto para implementação quando:

- uma organização puder identificar o workspace e agente responsáveis pelo consumo;
- cada evento faturável for idempotente e auditável;
- o preço usado no evento puder ser reproduzido por snapshot;
- quotas, budgets, franquias e entitlements forem tratados como conceitos diferentes;
- custos de terceiros aparecerem separados;
- um agente draft não gerar custo de produção;
- uma conexão não saudável não gerar consumo de canal;
- um produto Marketplace puder ter oferta, entitlement, dimensão e rate independentes;
- o cliente puder visualizar estimativa antes de publicar uma capacidade faturável;
- nenhum segredo, conteúdo de mensagem ou prompt privado entrar no ledger.

## Referências

[1]: https://aws.amazon.com/pricing/ "AWS Pricing"
[2]: https://docs.aws.amazon.com/marketplace/latest/userguide/usage-pricing.html "AWS Marketplace Usage Pricing"
[3]: https://docs.aws.amazon.com/marketplace/latest/userguide/pricing-models.html "AWS Marketplace Pricing Models"
[4]: https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html "Managing your costs with AWS Budgets"
