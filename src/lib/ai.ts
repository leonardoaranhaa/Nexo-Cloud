import { createServerFn } from "@tanstack/react-start";

type ChatTurn = { role: "user" | "assistant" | "system"; content: string };

type GenerateResult =
  | {
      ok: true;
      name: string;
      persona: string;
      welcomeMessage: string;
      systemPrompt: string;
      faqs: { q: string; a: string }[];
      notes: string;
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
    return grokChat({
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

    const result = await grokChat({
      temperature: 0.5,
      maxTokens: 900,
      messages: [
        {
          role: "system",
          content:
            "Você projeta agentes de WhatsApp. Responda APENAS JSON válido, sem markdown. Português brasileiro.",
        },
        {
          role: "user",
          content: `Crie um agente a partir deste briefing:\n${brief}\n\nJSON:
{"name":"Nome curto do agente","persona":"1 frase","welcomeMessage":"saudação WhatsApp curta","systemPrompt":"prompt de sistema detalhado, regras de tom e limites","faqs":[{"q":"...","a":"..."}],"notes":"notas internas curtas"}
3 a 5 faqs. systemPrompt com regras de respostas curtas no WhatsApp.`,
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

    return {
      ok: true,
      name: String(json.name ?? "Novo agente").slice(0, 48),
      persona: String(json.persona ?? "").slice(0, 220),
      welcomeMessage: String(json.welcomeMessage ?? "Olá!").slice(0, 180),
      systemPrompt: String(json.systemPrompt ?? "").slice(0, 2500),
      notes: String(json.notes ?? "").slice(0, 600),
      faqs,
    };
  });
