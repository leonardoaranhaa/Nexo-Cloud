import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bot, Plug2, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ArchitectureStrip } from "@/components/architecture-strip";
import { CreateAgentDialog } from "@/components/create-agent-dialog";
import { FlowCanvas } from "@/components/flow-canvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusDot } from "@/components/status-dot";
import { AGENT_STATUS_LABEL, CONNECTION_STATUS_LABEL } from "@/lib/labels";
import { useNexo } from "@/lib/store";
import { PROVIDER_LABEL } from "@/lib/types";
import { formatRelative } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const agents = useNexo((s) => s.agents);
  const connections = useNexo((s) => s.connections);
  const events = useNexo((s) => s.events);
  const clara = agents.find((a) => a.id === "agent_clara") ?? agents[0];
  const live = agents.filter((a) => a.status === "live").length;
  const online = connections.filter((c) => c.status === "connected").length;

  return (
    <AppShell
      title="Visão geral"
      action={
        <div className="flex gap-2">
          <Button variant="secondary" asChild>
            <Link to="/create">Assistente</Link>
          </Button>
          <CreateAgentDialog triggerLabel="Novo agente" />
        </div>
      }
    >
      <section className="max-w-3xl">
        <p className="text-xs tracking-[0.18em] text-subtle uppercase">Estúdio Nexo</p>
        <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight md:text-5xl">
          Cria o agente.
          <br />
          Testa no telefone.
          <br />
          Publica no WhatsApp.
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted md:text-base">
          Não é só um playground. O Grok escreve persona, prompt e FAQs; você liga Evolution,
          Meta ou Z-API, prova o fluxo no telefone e exporta n8n ou Python com memória.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/create">
              <Sparkles className="size-4" />
              Criar com Grok
            </Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/connections">Conexões</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/guide">n8n e Python</Link>
          </Button>
        </div>
      </section>

      <section className="mt-10">
        <ArchitectureStrip />
      </section>

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        <Stat label="Canais pareados" value={`${online}/${connections.length}`} />
        <Stat label="Agentes no ar" value={`${live}/${agents.length}`} />
        <Stat label="Eventos recentes" value={String(events.length)} />
      </section>

      {clara && (
        <section className="mt-10">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-semibold tracking-tight">Fluxo ao vivo</h3>
              <p className="text-sm text-muted">
                Webhook → horário → memória → base → humano → Grok → WhatsApp
              </p>
            </div>
            <Button variant="secondary" size="sm" asChild>
              <Link to="/agents/$id" params={{ id: clara.id }} search={{ tab: "test" }}>
                Testar {clara.name.split("—")[0]?.trim()}
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
          <Card className="p-4">
            <FlowCanvas agent={clara} />
          </Card>
        </section>
      )}

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold tracking-tight">Agentes</h3>
            <Link to="/agents" className="text-xs text-muted hover:text-fg">
              Ver todos
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {agents.map((a) => {
              const conn = connections.find((c) => c.id === a.connectionId);
              return (
                <Link
                  key={a.id}
                  to="/agents/$id"
                  params={{ id: a.id }}
                  search={{ tab: "create" }}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 hover:bg-elevated"
                >
                  <div className="flex size-9 items-center justify-center rounded-full bg-elevated font-display text-sm">
                    {a.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{a.name}</span>
                      <StatusDot status={a.status} />
                    </div>
                    <div className="truncate text-xs text-muted">
                      {conn ? `${conn.name} · ${PROVIDER_LABEL[conn.provider]}` : "Sem canal"}
                    </div>
                  </div>
                  <Badge tone={a.status === "live" ? "live" : "neutral"}>
                    {AGENT_STATUS_LABEL[a.status]}
                  </Badge>
                </Link>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold tracking-tight">Canais</h3>
            <Link to="/connections" className="text-xs text-muted hover:text-fg">
              Gerenciar
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {connections.map((c) => (
              <Link
                key={c.id}
                to="/connections"
                search={{ focus: c.id }}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 hover:bg-elevated"
              >
                <Plug2 className="size-4 text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{c.name}</span>
                    <StatusDot status={c.status} />
                  </div>
                  <div className="text-xs text-muted">
                    {PROVIDER_LABEL[c.provider]} · {CONNECTION_STATUS_LABEL[c.status]}
                  </div>
                </div>
                <Bot className="size-3.5 text-subtle" />
              </Link>
            ))}
          </div>

          <h3 className="mt-8 mb-3 font-display text-lg font-semibold tracking-tight">Atividade</h3>
          <div className="flex flex-col gap-2">
            {events.slice(0, 6).map((ev) => (
              <div key={ev.id} className="flex items-start justify-between gap-3 text-sm">
                <span className="text-muted">{ev.text}</span>
                <span className="shrink-0 font-mono text-xs text-subtle">
                  {formatRelative(ev.at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="px-4 py-4">
      <div className="text-xs tracking-wide text-subtle uppercase">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</div>
    </Card>
  );
}
