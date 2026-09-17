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

const QUICK_TRIGGERS = [
  { label: "Saudação", text: "Olá, preciso de ajuda." },
  { label: "Perguntar preço", text: "Qual é o preço e o prazo de entrega?" },
  { label: "Dúvida de atendimento", text: "Como vocês podem me atender?" },
  { label: "Pedir humano", text: "Quero falar com uma pessoa do time." },
];

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
          <div className="rounded-lg border border-accent/30 bg-elevated/40 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">Acionadores de teste</div>
            <p className="mt-1 text-xs leading-relaxed text-muted">Execute uma chamada agora no Agent Runtime. O resultado aparece no telefone ao lado e no rastreamento do fluxo.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {QUICK_TRIGGERS.map((trigger) => (
                <button
                  key={trigger.label}
                  type="button"
                  disabled={busy}
                  onClick={() => onSend(trigger.text)}
                  className="rounded-full border border-border bg-surface px-2.5 py-1.5 text-xs text-muted hover:border-accent/50 hover:text-fg disabled:opacity-40"
                >
                  {trigger.label}
                </button>
              ))}
              {agent.knowledge.faqs.slice(0, 4).map((faq) => faq.q.trim() && (
                <button
                  key={faq.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onSend(faq.q)}
                  className="rounded-full border border-border bg-surface px-2.5 py-1.5 text-xs text-muted hover:border-accent/50 hover:text-fg disabled:opacity-40"
                >
                  FAQ: {faq.q}
                </button>
              ))}
            </div>
          </div>
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
    agent: "Agent Runtime",
    outbound: "Enviar",
  };
  return map[id];
}

function nodeCopy(agent: Agent, id: FlowNodeId) {
  switch (id) {
    case "inbound":
      return "O conector recebe a mensagem, valida o evento e encaminha o turno para o Agent Runtime.";
    case "hours":
      return agent.tools.hoursEnabled
        ? `Atende das ${agent.tools.hoursStart} às ${agent.tools.hoursEnd}. Fora disso a IA não é chamada.`
        : "Filtro de horário desligado — o agente responde a qualquer momento.";
    case "memory":
      return `Os últimos ${agent.memoryWindow} turnos entram no contexto, separados por conversa e workspace.`;
    case "knowledge":
      return agent.knowledge.faqs.length
        ? `${agent.knowledge.faqs.length} FAQs injetados no prompt. O matching local entra se a IA estiver indisponível.`
        : "Sem FAQ. O modelo responde só com persona e notas.";
    case "handoff":
      return agent.tools.handoff
        ? `Palavras-chave: ${agent.tools.handoffKeywords}. Ao detectar, o fluxo é transferido para um operador.`
        : "Handoff desligado.";
    case "agent":
      return `Temperatura ${agent.temperature.toFixed(1)} · até ${agent.maxTokens} tokens. Respostas curtas e adequadas ao canal.`;
    case "outbound":
      return "A resposta volta pelo mesmo conector. O histórico e o delivery ficam disponíveis no Inbox e nas execuções.";
  }
}
