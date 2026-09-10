import { useMemo, useState } from "react";
import type { Agent, ChatMessage, FlowNodeId } from "@/lib/types";
import { PROVIDER_LABEL } from "@/lib/types";
import { useNexo } from "@/lib/store";
import { inboundPayload } from "@/lib/webhooks";
import { FlowCanvas } from "./flow-canvas";
import { PhonePreview } from "./phone-preview";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { CodeBlock } from "./code-block";

export function AgentTestPanel({
  agent,
  messages,
  busy,
  onSend,
  onClear,
}: {
  agent: Agent;
  messages: ChatMessage[];
  busy?: boolean;
  onSend: (text: string, kind?: ChatMessage["kind"]) => void;
  onClear: () => void;
}) {
  const connections = useNexo((s) => s.connections);
  const activeTrace = useNexo((s) => s.activeTrace);
  const [selected, setSelected] = useState<FlowNodeId>("inbound");
  const connection = connections.find((c) => c.id === agent.connectionId);
  const steps = activeTrace?.agentId === agent.id ? activeTrace.steps : undefined;
  const lastUser = [...messages].reverse().find((m) => m.role === "user");

  const payload = useMemo(() => {
    const provider = connection?.provider ?? "evolution";
    const phone = connection?.phone ?? "5511999990000";
    const text = lastUser?.content ?? "Oi, qual o prazo de entrega?";
    return JSON.stringify(inboundPayload(provider, phone, text), null, 2);
  }, [connection, lastUser]);

  return (
    <div className="flex flex-col gap-6">
      <FlowCanvas agent={agent} steps={steps} selected={selected} onSelect={setSelected} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="font-display text-sm font-semibold">Nó · {nodeTitle(selected)}</div>
              {connection ? (
                <Badge tone={connection.status === "connected" ? "live" : "warn"}>
                  {PROVIDER_LABEL[connection.provider]}
                </Badge>
              ) : (
                <Badge>sem canal</Badge>
              )}
            </div>
            <p className="text-sm leading-relaxed text-muted">{nodeCopy(agent, selected)}</p>
          </Card>
          <details className="rounded-xl border border-border bg-surface">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
              Payload de entrada
            </summary>
            <div className="px-4 pb-4">
              <CodeBlock code={payload} filename="webhook.json" />
            </div>
          </details>
        </div>

        <div className="flex flex-col gap-3">
          <PhonePreview
            agent={agent}
            messages={messages}
            busy={busy}
            onSend={onSend}
            onClear={onClear}
          />
          {agent.knowledge.faqs.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {agent.knowledge.faqs.slice(0, 4).map((faq) => (
                <button
                  key={faq.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onSend(faq.q)}
                  className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted hover:text-fg disabled:opacity-40"
                >
                  {faq.q}
                </button>
              ))}
              {agent.tools.handoff && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSend("Quero falar com um humano")}
                  className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted hover:text-fg disabled:opacity-40"
                >
                  Pedir humano
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function nodeTitle(id: FlowNodeId) {
  const map: Record<FlowNodeId, string> = {
    inbound: "Webhook",
    hours: "Horário",
    memory: "Memória",
    knowledge: "Base",
    handoff: "Humano",
    agent: "Grok",
    outbound: "Enviar",
  };
  return map[id];
}

function nodeCopy(agent: Agent, id: FlowNodeId) {
  switch (id) {
    case "inbound":
      return "O middleware (Evolution, Meta ou Z-API) recebe a mensagem e dispara este estúdio — ou o n8n / Flask que você exportar.";
    case "hours":
      return agent.tools.hoursEnabled
        ? `Atende das ${agent.tools.hoursStart} às ${agent.tools.hoursEnd}. Fora disso a IA não é chamada.`
        : "Filtro de horário desligado — o agente responde a qualquer momento.";
    case "memory":
      return `Os últimos ${agent.memoryWindow} turnos vão no contexto. No Python isso vira um deque por telefone; no n8n, Window Buffer.`;
    case "knowledge":
      return agent.knowledge.faqs.length
        ? `${agent.knowledge.faqs.length} FAQs injetados no prompt. O matching local entra se a IA estiver indisponível.`
        : "Sem FAQ. O modelo responde só com persona e notas.";
    case "handoff":
      return agent.tools.handoff
        ? `Palavras-chave: ${agent.tools.handoffKeywords}. Ao detectar, o fluxo pula o Grok.`
        : "Handoff desligado.";
    case "agent":
      return `Grok 4.5 · temperatura ${agent.temperature.toFixed(1)} · até ${agent.maxTokens} tokens. Respostas curtas, no tom de WhatsApp.`;
    case "outbound":
      return "A resposta volta pelo mesmo provedor. No playground o canal é este telefone; no ar, o número pareado.";
  }
}
