import type { Agent, Connection, StudioEvent } from "./types";

const now = Date.UTC(2026, 8, 8, 18, 0, 0);

export const SEED_CONNECTIONS: Connection[] = [
  {
    id: "conn_evo_aurora",
    name: "Loja Aurora",
    provider: "evolution",
    status: "connected",
    phone: "5511988881200",
    instance: "aurora-loja",
    baseUrl: "https://evo.nexo.local",
    createdAt: now - 1000 * 60 * 60 * 24 * 12,
    lastEventAt: now - 1000 * 60 * 8,
  },
  {
    id: "conn_meta_prado",
    name: "Imobiliária Prado",
    provider: "meta",
    status: "disconnected",
    phoneNumberId: "109876543210",
    createdAt: now - 1000 * 60 * 60 * 24 * 3,
  },
  {
    id: "conn_zapi_demo",
    name: "Sandbox Z-API",
    provider: "zapi",
    status: "qr",
    instance: "sandbox-01",
    createdAt: now - 1000 * 60 * 40,
  },
];

export const SEED_AGENTS: Agent[] = [
  {
    id: "agent_clara",
    name: "Clara — Atendimento",
    persona:
      "Atendente da Loja Aurora: moda contemporânea, tom cordial, respostas curtas de WhatsApp.",
    welcomeMessage:
      "Oi, aqui é a Clara da Aurora. Posso te ajudar com tamanhos, prazos e trocas.",
    systemPrompt: `Você é Clara, atendente virtual da Loja Aurora no WhatsApp.
Regras:
- Respostas curtas (1 a 4 frases). Sem markdown pesado, listas longas ou emojis em excesso.
- Fale em português brasileiro, tom humano e direto.
- Use apenas as informações da base. Se não souber, diga que vai confirmar com o time.
- Nunca invente estoque, preço ou prazo.
- Se pedirem humano, avise que está transferindo.
Horário: 10h às 19h, terça a sábado.`,
    language: "pt",
    connectionId: "conn_evo_aurora",
    status: "live",
    temperature: 0.4,
    maxTokens: 280,
    memoryWindow: 12,
    template: "support",
    knowledge: {
      faqs: [
        {
          id: "faq_1",
          q: "Qual o prazo de entrega?",
          a: "Capitais em 2 a 4 dias úteis. Interior em 5 a 8. Frete grátis acima de R$ 299.",
        },
        {
          id: "faq_2",
          q: "Como funciona a troca?",
          a: "Troca em até 30 dias com etiqueta. Primeira troca é por nossa conta.",
        },
        {
          id: "faq_3",
          q: "Vocês parcelam?",
          a: "Sim, em até 3x sem juros no cartão a partir de R$ 180.",
        },
        {
          id: "faq_4",
          q: "Onde fica a loja física?",
          a: "Rua Harmonia 412, Vila Madalena, São Paulo. Terça a sábado, 10h às 19h.",
        },
      ],
      notes:
        "Coleção vigente: linho, algodão orgânico e denim. Não vendemos couro. Ticket médio R$ 240.",
    },
    tools: {
      handoff: true,
      handoffKeywords: "humano, atendente, pessoa, gerente",
      hoursEnabled: true,
      hoursStart: "10:00",
      hoursEnd: "19:00",
      catalog: true,
      audio: true,
    },
    createdAt: now - 1000 * 60 * 60 * 24 * 10,
    updatedAt: now - 1000 * 60 * 25,
  },
  {
    id: "agent_raul",
    name: "Raul — Qualificação",
    persona:
      "Consultor da Imobiliária Prado. Qualifica leads de locação e venda com perguntas objetivas.",
    welcomeMessage:
      "Olá, sou o Raul da Prado. Você busca alugar ou comprar? Em qual bairro?",
    systemPrompt: `Você é Raul, consultor da Imobiliária Prado no WhatsApp.
Objetivo: qualificar o lead em no máximo 6 turnos.
Pergunte, um item por vez: intenção (alugar/comprar), bairro, faixa de valor, dormitórios, prazo.
Não envie listas de 20 imóveis. Sugira no máximo 2 opções quando tiver dados suficientes.
Se o lead pedir visita, transfere para um correto humano.
Tom: profissional, calmo, sem jargão de funil.`,
    language: "pt",
    connectionId: "conn_meta_prado",
    status: "draft",
    temperature: 0.35,
    maxTokens: 260,
    memoryWindow: 16,
    template: "sales",
    knowledge: {
      faqs: [
        {
          id: "faq_r1",
          q: "Quais bairros vocês atendem?",
          a: "Pinheiros, Vila Madalena, Perdizes, Pacaembu e Alto de Pinheiros.",
        },
        {
          id: "faq_r2",
          q: "Como agendar visita?",
          a: "Com bairro e faixa de valor, transferimos para um corretor no mesmo dia útil.",
        },
      ],
      notes:
        "Carteira: 40 imóveis ativos. Ticket locação R$ 4.5k–12k. Venda R$ 890k–3.2M. Não atende comercial.",
    },
    tools: {
      handoff: true,
      handoffKeywords: "corretor, visita, humano, ligar",
      hoursEnabled: true,
      hoursStart: "09:00",
      hoursEnd: "18:30",
      catalog: false,
      audio: true,
    },
    createdAt: now - 1000 * 60 * 60 * 24 * 2,
    updatedAt: now - 1000 * 60 * 60 * 5,
  },
];

export const SEED_EVENTS: StudioEvent[] = [
  {
    id: "ev_1",
    at: now - 1000 * 60 * 8,
    kind: "connection",
    text: "Loja Aurora recebeu mensagem no Evolution",
  },
  {
    id: "ev_2",
    at: now - 1000 * 60 * 25,
    kind: "test",
    text: "Clara respondeu 12 turnos no playground",
  },
  {
    id: "ev_3",
    at: now - 1000 * 60 * 60 * 5,
    kind: "agent",
    text: "Rascunho Raul — Qualificação atualizado",
  },
];

export const SEED_INBOX: Record<string, { id: string; role: "user" | "assistant"; content: string; at: number }[]> =
  {
    agent_clara: [
      {
        id: "m1",
        role: "user",
        content: "Oi, vocês trocam peça usada?",
        at: now - 1000 * 60 * 18,
      },
      {
        id: "m2",
        role: "assistant",
        content:
          "Troca em até 30 dias, com etiqueta. A primeira é por nossa conta. A peça precisa estar sem uso. Quer o passo a passo?",
        at: now - 1000 * 60 * 17,
      },
    ],
  };

export type AgentTemplateId = "support" | "sales" | "booking" | "faq" | "blank";

export const AGENT_TEMPLATES: {
  id: AgentTemplateId;
  title: string;
  blurb: string;
  draft: Pick<
    Agent,
    | "persona"
    | "welcomeMessage"
    | "systemPrompt"
    | "template"
    | "knowledge"
    | "tools"
    | "temperature"
    | "maxTokens"
    | "memoryWindow"
    | "language"
  >;
}[] = [
  {
    id: "support",
    title: "Atendimento",
    blurb: "Dúvidas, prazos, trocas e horário. Handoff para humano.",
    draft: {
      language: "pt",
      template: "support",
      persona: "Atendente de suporte no WhatsApp, cordial e objetivo.",
      welcomeMessage: "Olá! Sou o assistente de atendimento. Como posso ajudar?",
      systemPrompt:
        "Você atende clientes no WhatsApp. Respostas curtas, em português brasileiro. Use a base. Se não souber, assuma a dúvida e ofereça um humano.",
      temperature: 0.4,
      maxTokens: 280,
      memoryWindow: 12,
      knowledge: { faqs: [], notes: "" },
      tools: {
        handoff: true,
        handoffKeywords: "humano, atendente, pessoa",
        hoursEnabled: true,
        hoursStart: "09:00",
        hoursEnd: "18:00",
        catalog: false,
        audio: true,
      },
    },
  },
  {
    id: "sales",
    title: "Vendas",
    blurb: "Qualifica lead, pergunta um item por vez, passa ao closer.",
    draft: {
      language: "pt",
      template: "sales",
      persona: "Consultor comercial que qualifica sem pressa.",
      welcomeMessage: "Oi! Me conta o que você está buscando?",
      systemPrompt:
        "Você qualifica leads no WhatsApp. Uma pergunta por vez. Não despeje catálogo. Quando tiver orçamento, prazo e necessidade, ofereça transferir para um consultor.",
      temperature: 0.35,
      maxTokens: 260,
      memoryWindow: 16,
      knowledge: { faqs: [], notes: "" },
      tools: {
        handoff: true,
        handoffKeywords: "consultor, humano, reunião",
        hoursEnabled: true,
        hoursStart: "09:00",
        hoursEnd: "18:00",
        catalog: true,
        audio: true,
      },
    },
  },
  {
    id: "booking",
    title: "Agendamento",
    blurb: "Coleta data, horário e nome. Confirma e resume.",
    draft: {
      language: "pt",
      template: "booking",
      persona: "Recepcionista que agenda com clareza.",
      welcomeMessage: "Olá! Vamos marcar? Qual o melhor dia para você?",
      systemPrompt:
        "Você agenda pelo WhatsApp. Colete serviço, dia, faixa de horário e nome. Confirme tudo em uma frase. Se conflitar, ofereça 2 alternativas.",
      temperature: 0.3,
      maxTokens: 240,
      memoryWindow: 10,
      knowledge: { faqs: [], notes: "Horários: terça a sábado, 10h–19h." },
      tools: {
        handoff: true,
        handoffKeywords: "recepção, humano",
        hoursEnabled: true,
        hoursStart: "10:00",
        hoursEnd: "19:00",
        catalog: false,
        audio: true,
      },
    },
  },
  {
    id: "faq",
    title: "FAQ / RAG",
    blurb: "Responde só com a base. Ideal para políticas e manuais.",
    draft: {
      language: "pt",
      template: "faq",
      persona: "Guia da base de conhecimento, literal e confiável.",
      welcomeMessage: "Posso responder com o que está na nossa base. Qual a dúvida?",
      systemPrompt:
        "Responda apenas com a base fornecida. Se a resposta não estiver lá, diga que não consta e ofereça um humano. Sem inventar.",
      temperature: 0.2,
      maxTokens: 260,
      memoryWindow: 8,
      knowledge: { faqs: [], notes: "" },
      tools: {
        handoff: true,
        handoffKeywords: "humano",
        hoursEnabled: false,
        hoursStart: "00:00",
        hoursEnd: "23:59",
        catalog: false,
        audio: false,
      },
    },
  },
  {
    id: "blank",
    title: "Em branco",
    blurb: "Só o esqueleto do fluxo. Você escreve o briefing.",
    draft: {
      language: "pt",
      template: "blank",
      persona: "",
      welcomeMessage: "Olá!",
      systemPrompt: "Você é um assistente no WhatsApp. Respostas curtas e úteis.",
      temperature: 0.5,
      maxTokens: 280,
      memoryWindow: 12,
      knowledge: { faqs: [], notes: "" },
      tools: {
        handoff: false,
        handoffKeywords: "humano",
        hoursEnabled: false,
        hoursStart: "09:00",
        hoursEnd: "18:00",
        catalog: false,
        audio: false,
      },
    },
  },
];
