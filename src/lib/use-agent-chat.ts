import { useState } from "react";
import { chatAgent } from "./ai";
import { composeSystemPrompt } from "./prompt";
import { buildTrace, isWithinHours, matchFaq, wantsHandoff } from "./pipeline";
import { useNexo } from "./store";
import type { ChatMessage } from "./types";

const EMPTY_MESSAGES: ChatMessage[] = [];

export function useAgentChat(agentId: string | undefined) {
  const agent = useNexo((s) => s.agents.find((a) => a.id === agentId));
  const messages = useNexo((s) =>
    agentId ? (s.inbox[agentId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES,
  );
  const pushMessage = useNexo((s) => s.pushMessage);
  const clearInbox = useNexo((s) => s.clearInbox);
  const setTrace = useNexo((s) => s.setTrace);
  const log = useNexo((s) => s.log);
  const [busy, setBusy] = useState(false);

  async function send(text: string, kind?: ChatMessage["kind"]) {
    if (!agent || !agentId || busy) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const userContent = kind === "audio" ? `(áudio transcrito) ${trimmed}` : trimmed;
    pushMessage(agentId, { role: "user", content: userContent, kind: kind ?? "text" });
    setBusy(true);

    const faqHit = !!matchFaq(agent, trimmed);
    const handoff = wantsHandoff(agent, trimmed);
    const open = isWithinHours(agent);

    try {
      if (!open) {
        pushMessage(agentId, {
          role: "assistant",
          kind: "closed",
          content: `Estamos fora do horário (${agent.tools.hoursStart}–${agent.tools.hoursEnd}). Deixe a mensagem que respondemos no próximo expediente.`,
        });
        setTrace(agentId, buildTrace(agent, trimmed, { usedAi: false, faqHit: false }));
        return;
      }

      if (handoff) {
        pushMessage(agentId, {
          role: "assistant",
          kind: "handoff",
          content: "Vou te passar para alguém do time. Um minuto.",
        });
        setTrace(agentId, buildTrace(agent, trimmed, { usedAi: false, faqHit }));
        log("test", `${agent.name} transferiu para humano`);
        return;
      }

      const history = (useNexo.getState().inbox[agentId] ?? [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-agent.memoryWindow)
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      const res = await chatAgent({
        data: {
          systemPrompt: composeSystemPrompt(agent),
          messages: history,
          maxTokens: agent.maxTokens,
          temperature: agent.temperature,
        },
      });

      if (res.ok) {
        pushMessage(agentId, {
          role: "assistant",
          content: res.text.trim() || "Certo — me conta um pouco mais.",
        });
        setTrace(agentId, buildTrace(agent, trimmed, { usedAi: true, faqHit }));
        log("test", `${agent.name} respondeu no playground`);
      } else {
        const faq = matchFaq(agent, trimmed);
        pushMessage(agentId, {
          role: "assistant",
          content: faq
            ? faq.a
            : `${agent.welcomeMessage}\n\nEstou com a base local (IA indisponível). Reformule ou consulte o FAQ.`,
        });
        setTrace(agentId, buildTrace(agent, trimmed, { usedAi: false, faqHit }));
      }
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    if (!agentId) return;
    clearInbox(agentId);
  }

  return { agent, messages, busy, send, clear };
}
