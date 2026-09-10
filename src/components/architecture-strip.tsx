import { ArrowRight, Bot, Plug2, Waypoints } from "lucide-react";
import { Card } from "./ui/card";

const LAYERS = [
  {
    n: "01",
    title: "Canal WhatsApp",
    icon: Plug2,
    body: "Evolution, Meta Cloud ou Z-API transformam o número em webhook.",
  },
  {
    n: "02",
    title: "Lógica Nexo",
    icon: Waypoints,
    body: "Horário, memória, FAQ, handoff e o fluxo que você vê no canvas.",
  },
  {
    n: "03",
    title: "Agent Runtime",
    icon: Bot,
    body: "Aplica instruções, conhecimento, ferramentas, handoff e políticas de resposta.",
  },
] as const;

export function ArchitectureStrip() {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
      {LAYERS.map((layer, i) => {
        const Icon = layer.icon;
        return (
          <div key={layer.n} className="flex flex-1 flex-col gap-3 md:flex-row md:items-stretch">
            <Card className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-subtle">{layer.n}</span>
                <Icon className="size-4 text-muted" />
              </div>
              <div className="font-display text-base font-semibold tracking-tight">{layer.title}</div>
              <p className="text-sm leading-relaxed text-muted">{layer.body}</p>
            </Card>
            {i < LAYERS.length - 1 && (
              <div className="hidden items-center px-1 md:flex">
                <ArrowRight className="size-4 text-subtle" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
