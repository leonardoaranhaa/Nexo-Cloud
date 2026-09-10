import type { Agent, TraceStep } from "./types";

function parseHm(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function isWithinHours(agent: Agent, date = new Date()) {
  if (!agent.tools.hoursEnabled) return true;
  const minutes = date.getHours() * 60 + date.getMinutes();
  const start = parseHm(agent.tools.hoursStart);
  const end = parseHm(agent.tools.hoursEnd);
  if (end <= start) return minutes >= start || minutes <= end;
  return minutes >= start && minutes <= end;
}

export function wantsHandoff(agent: Agent, text: string) {
  if (!agent.tools.handoff) return false;
  const hay = text.toLowerCase();
  return agent.tools.handoffKeywords
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)
    .some((k) => hay.includes(k));
}

function tokenize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

export function matchFaq(agent: Agent, text: string) {
  const qTokens = new Set(tokenize(text));
  if (qTokens.size === 0) return null;
  let best: { faq: (typeof agent.knowledge.faqs)[number]; score: number } | null = null;
  for (const faq of agent.knowledge.faqs) {
    const tokens = tokenize(faq.q + " " + faq.a);
    const overlap = tokens.filter((t) => qTokens.has(t)).length;
    const score = overlap / Math.max(tokens.length, 1);
    if (overlap >= 2 && (!best || score > best.score)) best = { faq, score };
  }
  return best && best.score >= 0.12 ? best.faq : null;
}

export function localFallbackReply(agent: Agent, text: string) {
  const faq = matchFaq(agent, text);
  if (faq) return faq.a;
  if (wantsHandoff(agent, text)) {
    return "Vou te passar para alguém do time. Um minuto.";
  }
  if (!isWithinHours(agent)) {
    return `Estamos fora do horário (${agent.tools.hoursStart}–${agent.tools.hoursEnd}). Deixe a mensagem que respondemos no próximo expediente.`;
  }
  return `${agent.welcomeMessage}\n\nAinda estou com a base local (IA indisponível). Reformule ou consulte o FAQ.`;
}

export function buildTrace(agent: Agent, text: string, opts: { usedAi: boolean; faqHit: boolean }) {
  const open = isWithinHours(agent);
  const handoff = wantsHandoff(agent, text);
  const steps: TraceStep[] = [
    { nodeId: "inbound", status: "ok", detail: "Webhook recebeu texto" },
    {
      nodeId: "hours",
      status: agent.tools.hoursEnabled ? (open ? "ok" : "block") : "skip",
      detail: agent.tools.hoursEnabled
        ? open
          ? `Dentro de ${agent.tools.hoursStart}–${agent.tools.hoursEnd}`
          : "Fora do horário"
        : "Filtro desligado",
    },
    {
      nodeId: "memory",
      status: "ok",
      detail: `Janela de ${agent.memoryWindow} turnos`,
    },
    {
      nodeId: "knowledge",
      status: opts.faqHit ? "ok" : agent.knowledge.faqs.length ? "ok" : "skip",
      detail: opts.faqHit
        ? "FAQ correspondente no contexto"
        : `${agent.knowledge.faqs.length} itens injetados`,
    },
    {
      nodeId: "handoff",
      status: agent.tools.handoff ? (handoff ? "ok" : "skip") : "skip",
      detail: handoff ? "Palavra-chave de humano" : "Sem pedido de humano",
    },
    {
      nodeId: "agent",
      status: !open || handoff ? "skip" : opts.usedAi ? "ok" : "ok",
      detail: !open ? "Bloqueado pelo horário" : handoff ? "Saltou a IA" : opts.usedAi ? "Grok gerou a resposta" : "Resposta local",
    },
    { nodeId: "outbound", status: "ok", detail: "Enviado ao canal de teste" },
  ];
  return steps;
}
