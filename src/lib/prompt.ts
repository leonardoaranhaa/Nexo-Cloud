import type { Agent } from "./types";

export function composeSystemPrompt(agent: Agent) {
  const faqs = agent.knowledge.faqs
    .filter((f) => f.q.trim() && f.a.trim())
    .map((f) => `P: ${f.q.trim()}\nR: ${f.a.trim()}`)
    .join("\n\n");
  const notes = agent.knowledge.notes.trim();
  const hours = agent.tools.hoursEnabled
    ? `Horário de atendimento: ${agent.tools.hoursStart}–${agent.tools.hoursEnd}.`
    : "Sem restrição de horário.";
  const handoff = agent.tools.handoff
    ? `Handoff humano ativo. Palavras-chave: ${agent.tools.handoffKeywords}.`
    : "Sem handoff humano.";
  const audio = agent.tools.audio
    ? "Áudios chegam transcritos entre parênteses. Responda em texto curto."
    : "";

  return [
    agent.systemPrompt.trim(),
    agent.persona.trim() ? `Persona: ${agent.persona.trim()}` : "",
    hours,
    handoff,
    audio,
    notes ? `Notas internas:\n${notes}` : "",
    faqs ? `Base de conhecimento (FAQ):\n${faqs}` : "Sem FAQ cadastrado.",
    "Formato: mensagens de WhatsApp. Máximo 4 frases. Sem títulos markdown.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
