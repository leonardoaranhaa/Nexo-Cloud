import {
  ArrowRight,
  BookOpen,
  Bot,
  Clock3,
  Inbox,
  MemoryStick,
  Send,
  UserRound,
} from "lucide-react";
import type { Agent, FlowNodeId, TraceStep } from "@/lib/types";
import { cn } from "@/lib/utils";

const NODES: {
  id: FlowNodeId;
  title: string;
  icon: typeof Inbox;
}[] = [
  { id: "inbound", title: "Webhook", icon: Inbox },
  { id: "hours", title: "Horário", icon: Clock3 },
  { id: "memory", title: "Memória", icon: MemoryStick },
  { id: "knowledge", title: "Base", icon: BookOpen },
  { id: "handoff", title: "Humano", icon: UserRound },
  { id: "agent", title: "Grok", icon: Bot },
  { id: "outbound", title: "Enviar", icon: Send },
];

export function FlowCanvas({
  agent,
  steps,
  selected,
  onSelect,
}: {
  agent: Agent;
  steps?: TraceStep[];
  selected?: FlowNodeId;
  onSelect?: (id: FlowNodeId) => void;
}) {
  const byId = new Map((steps ?? []).map((s) => [s.nodeId, s]));

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max items-stretch gap-0">
        {NODES.map((node, i) => {
          const Icon = node.icon;
          const step = byId.get(node.id);
          const skipped =
            (node.id === "hours" && !agent.tools.hoursEnabled) ||
            (node.id === "handoff" && !agent.tools.handoff);
          const tone =
            step?.status === "running"
              ? "border-accent bg-elevated"
              : step?.status === "ok"
                ? "border-live/50 bg-live/10"
                : step?.status === "block"
                  ? "border-danger/50 bg-danger/10"
                  : step?.status === "skip" || skipped
                    ? "border-border bg-bg opacity-60"
                    : selected === node.id
                      ? "border-accent bg-elevated"
                      : "border-border bg-surface";
          return (
            <div key={node.id} className="flex items-center">
              <button
                type="button"
                onClick={() => onSelect?.(node.id)}
                className={cn(
                  "flex w-28 flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
                  tone,
                )}
              >
                <div className="flex items-center justify-between">
                  <Icon className="size-4 text-muted" />
                  <span className="font-mono text-xs text-subtle">{i + 1}</span>
                </div>
                <div className="font-display text-sm font-medium">{node.title}</div>
                <div className="line-clamp-2 text-xs leading-snug text-muted">
                  {step?.detail ?? hint(agent, node.id)}
                </div>
              </button>
              {i < NODES.length - 1 && (
                <ArrowRight className="mx-1 size-3.5 shrink-0 text-subtle" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function hint(agent: Agent, id: FlowNodeId) {
  switch (id) {
    case "inbound":
      return "Recebe o evento do WhatsApp";
    case "hours":
      return agent.tools.hoursEnabled
        ? `${agent.tools.hoursStart}–${agent.tools.hoursEnd}`
        : "Desligado";
    case "memory":
      return `${agent.memoryWindow} turnos`;
    case "knowledge":
      return `${agent.knowledge.faqs.length} FAQs`;
    case "handoff":
      return agent.tools.handoff ? "Palavras-chave ativas" : "Desligado";
    case "agent":
      return `Grok · temp ${agent.temperature.toFixed(1)}`;
    case "outbound":
      return "Devolve a resposta no canal";
  }
}
