import { createServerFn } from "@tanstack/react-start";

type ChatTurn = { role: "user" | "assistant" | "system"; content: string };
type GeneratedAgentType = "support" | "sales" | "marketing" | "ads" | "traffic" | "operations" | "custom";

type GenerateResult =
  | {
      ok: true;
      name: string;
      agentType: GeneratedAgentType;
      persona: string;
      welcomeMessage: string;
      systemPrompt: string;
      faqs: { q: string; a: string }[];
      notes: string;
      objectives: string[];
      capabilities: string[];
      guardrails: string[];
      testScenarios: string[];
    }
  | { ok: false; error: string };

async function grokChat(opts: {
  messages: ChatTurn[];
  maxTokens: number;
  temperature: number;
}) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ok: false as const, error: "AI_UNAVAILABLE" as const };

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      messages: opts.messages,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
    }),
  });

  if (!res.ok) {
    return { ok: false as const, error: `xAI API error ${res.status}` as const };
  }
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return { ok: true as const, text: body.choices?.[0]?.message?.content ?? "" };
}

async function anthropicChat(opts: { messages: ChatTurn[]; maxTokens: number; temperature: number }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const system = opts.messages.find((message) => message.role === "system")?.content ?? "";
  const messages = opts.messages.filter((message) => message.role !== "system");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.NEXO_AGENT_MODEL || "claude-sonnet-4-5-20250929", system, messages, max_tokens: opts.maxTokens, temperature: opts.temperature }),
  });
  if (!res.ok) return { ok: false as const, error: `Anthropic API error ${res.status}` };
  const body = await res.json() as { content?: { type?: string; text?: string }[] };
  return { ok: true as const, text: (body.content ?? []).filter((item) => item.type === "text").map((item) => item.text ?? "").join(" ") };
}

async function aiChat(opts: { messages: ChatTurn[]; maxTokens: number; temperature: number }) {
  return process.env.ANTHROPIC_API_KEY ? (await anthropicChat(opts)) ?? { ok: false as const, error: "AI_UNAVAILABLE" as const } : grokChat(opts);
}

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const chatAgent = createServerFn({ method: "POST" })
  .validator(
    (input: {
      systemPrompt: string;
      messages: { role: "user" | "assistant"; content: string }[];
      maxTokens: number;
      temperature: number;
    }) => input,
  )
  .handler(async ({ data }) => {
    const maxTokens = Math.min(Math.max(data.maxTokens, 80), 400);
    const temperature = Math.min(Math.max(data.temperature, 0), 1);
    const history = data.messages.slice(-16);
    return aiChat({
      temperature,
      maxTokens,
      messages: [
        { role: "system", content: data.systemPrompt.slice(0, 8000) },
        ...history.map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })),
      ],
    });
  });

export const generateAgent = createServerFn({ method: "POST" })
  .validator((input: { brief: string }) => input)
  .handler(async ({ data }): Promise<GenerateResult> => {
    const brief = data.brief.trim().slice(0, 1200);
    if (brief.length < 8) return { ok: false, error: "Briefing curto demais." };

    const result = await aiChat({
      temperature: 0.5,
      maxTokens: 900,
      messages: [
        {
          role: "system",
          content:
            "Você projeta agentes de negócio para o Nexo Cloud. Responda APENAS JSON válido, sem markdown. Português brasileiro. Não invente integrações, preços, políticas legais ou capacidades externas não informadas.",
        },
        {
          role: "user",
          content: `Crie um blueprint inicial de agente a partir deste briefing:\n${brief}\n\nJSON:
{"name":"Nome curto do agente","agentType":"support|sales|marketing|ads|traffic|operations|custom","persona":"1 frase","welcomeMessage":"saudação curta","systemPrompt":"prompt de sistema detalhado, regras de tom e limites","faqs":[{"q":"...","a":"..."}],"notes":"notas internas curtas","objectives":["objetivo mensurável"],"capabilities":["capacidade que o agente pode executar"],"guardrails":["limite ou condição de segurança"],"testScenarios":["cenário de teste com resultado esperado"]}
Inclua 3 a 5 faqs, 2 a 4 objetivos, 3 a 6 capacidades, 3 a 6 guardrails e 3 a 5 cenários de teste. Não declare uma integração como disponível sem ela estar no briefing. O systemPrompt deve orientar respostas curtas, coleta de contexto, uso de evidências, handoff e não invenção de dados.`,
        },
      ],
    });

    if (!result.ok) {
      return {
        ok: false,
        error: result.error === "AI_UNAVAILABLE" ? "IA indisponível neste ambiente." : result.error,
      };
    }

    const json = extractJson(result.text);
    if (!json) return { ok: false, error: "Não foi possível ler o agente gerado." };

    const faqsRaw = Array.isArray(json.faqs) ? json.faqs : [];
    const faqs = faqsRaw
      .map((f) => {
        const row = f as { q?: unknown; a?: unknown };
        return {
          q: String(row.q ?? "").slice(0, 160),
          a: String(row.a ?? "").slice(0, 400),
        };
      })
      .filter((f) => f.q && f.a)
      .slice(0, 6);

    const list = (value: unknown, max: number, itemMax: number) =>
      (Array.isArray(value) ? value : [])
        .map((item) => String(item ?? "").trim().slice(0, itemMax))
        .filter(Boolean)
        .slice(0, max);
    const allowedTypes = new Set(["support", "sales", "marketing", "ads", "traffic", "operations", "custom"]);
    const agentType = String(json.agentType ?? "custom");

    return {
      ok: true,
      name: String(json.name ?? "Novo agente").slice(0, 48),
      agentType: (allowedTypes.has(agentType) ? agentType : "custom") as GeneratedAgentType,
      persona: String(json.persona ?? "").slice(0, 220),
      welcomeMessage: String(json.welcomeMessage ?? "Olá!").slice(0, 180),
      systemPrompt: String(json.systemPrompt ?? "").slice(0, 2500),
      notes: String(json.notes ?? "").slice(0, 600),
      faqs,
      objectives: list(json.objectives, 4, 180),
      capabilities: list(json.capabilities, 6, 180),
      guardrails: list(json.guardrails, 6, 220),
      testScenarios: list(json.testScenarios, 5, 240),
    };
  });
