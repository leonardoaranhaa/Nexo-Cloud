import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, Bot, CheckCircle2, ChevronRight, Inbox, Plug2, Settings2, Sparkles, Workflow } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CreateAgentDialog } from "@/components/create-agent-dialog";
import { NexoBot } from "@/components/nexo-bot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusDot } from "@/components/status-dot";
import { AGENT_STATUS_LABEL, CONNECTION_STATUS_LABEL } from "@/lib/labels";
import { useNexo } from "@/lib/store";
import { PROVIDER_LABEL } from "@/lib/types";
import { formatRelative } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: Home });

const USE_CASES = [
  { title: "Atendimento", description: "Responda dúvidas, use conhecimento aprovado e encaminhe casos sensíveis.", icon: Inbox, href: "/agents" as const, action: "Criar agente" },
  { title: "Vendas", description: "Qualifique leads, registre contexto no CRM e entregue oportunidades prontas ao time.", icon: BarChart3, href: "/marketplace" as const, action: "Explorar agentes" },
  { title: "Operações", description: "Automatize rotinas com workflows, aprovações, filas e histórico de execução.", icon: Workflow, href: "/workflows" as const, action: "Ver workflows" },
];

function Home() {
  const agents = useNexo((s) => s.agents);
  const connections = useNexo((s) => s.connections);
  const events = useNexo((s) => s.events);
  const organizationName = useNexo((s) => s.organizationName);
  const activeWorkspace = useNexo((s) => s.workspaces.find((item) => item.id === s.workspaceId));
  const live = agents.filter((a) => a.status === "live").length;
  const online = connections.filter((c) => c.status === "connected").length;
  const checklist = [
    { label: "Criar seu primeiro agente", done: agents.length > 0, href: "/agents" as const },
    { label: "Conectar um canal", done: connections.some((c) => c.status === "connected"), href: "/connections" as const },
    { label: "Publicar uma versão", done: live > 0, href: "/agents" as const },
    { label: "Acompanhar conversas", done: false, href: "/inbox" as const },
  ];

  return (
    <AppShell title="Visão geral" allowAnonymous>
      <section className="relative overflow-hidden rounded-2xl border border-border bg-surface p-6 md:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge tone="live">Nexo Cloud</Badge>
            <span>{organizationName ?? "Sua organização"}</span>
            {activeWorkspace && <span>· {activeWorkspace.name} · {activeWorkspace.environment}</span>}
          </div>
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight md:text-5xl">Bem-vindo ao seu centro de agentes.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted md:text-base">Crie agentes especializados, conecte canais, publique versões e acompanhe cada conversa em um único control plane.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <CreateAgentDialog triggerLabel="Criar agente" />
            <Button variant="secondary" asChild><Link to="/marketplace"><Sparkles className="size-4" />Explorar agentes prontos</Link></Button>
            <Button variant="ghost" asChild><Link to="/settings"><Settings2 className="size-4" />Configurar plataforma</Link></Button>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        <Stat label="Agentes no ar" value={`${live}/${agents.length}`} detail="versões publicadas" />
        <Stat label="Canais conectados" value={`${online}/${connections.length}`} detail="prontos para operar" />
        <Stat label="Atividade recente" value={String(events.length)} detail="eventos no workspace" />
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,.9fr)]">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">Próximos passos</p><h3 className="mt-2 font-display text-xl font-semibold">Coloque sua operação em movimento</h3></div><Bot className="size-5 text-accent" /></div>
          <div className="mt-5 grid gap-2">
            {checklist.map((item, index) => <Link key={item.label} to={item.href} className="flex items-center gap-3 rounded-lg border border-border px-3 py-3 transition-colors hover:bg-elevated"><span className={`flex size-7 items-center justify-center rounded-full text-xs ${item.done ? "bg-live/15 text-live" : "bg-elevated text-muted"}`}>{item.done ? <CheckCircle2 className="size-4" /> : index + 1}</span><span className={`flex-1 text-sm ${item.done ? "text-muted line-through" : "font-medium"}`}>{item.label}</span><ChevronRight className="size-4 text-subtle" /></Link>)}
          </div>
        </Card>
        <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">Saúde do workspace</p><h3 className="mt-2 font-display text-xl font-semibold">Tudo em um só lugar</h3><div className="mt-5 space-y-3 text-sm"><HealthRow label="Control plane" value="Conectado" good /><HealthRow label="Persistência local" value="PGlite ativo" good /><HealthRow label="Runtime" value={live > 0 ? "Pronto para executar" : "Aguardando publicação"} good={live > 0} /></div><Button className="mt-5 w-full" variant="secondary" asChild><Link to="/runs">Ver execuções <ArrowRight className="size-3.5" /></Link></Button></Card>
      </section>

      <section className="mt-10"><div className="mb-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">Possibilidades</p><h3 className="mt-2 font-display text-2xl font-semibold">Comece pelo resultado que deseja alcançar</h3></div><div className="grid gap-3 md:grid-cols-3">{USE_CASES.map((item) => { const Icon = item.icon; return <Link key={item.title} to={item.href} className="group rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent/50 hover:bg-elevated"><Icon className="size-5 text-accent" /><h4 className="mt-4 font-display text-lg font-semibold">{item.title}</h4><p className="mt-2 min-h-12 text-sm leading-relaxed text-muted">{item.description}</p><span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-accent">{item.action}<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" /></span></Link>; })}</div></section>

      <section className="mt-10 grid gap-6 lg:grid-cols-2"><div><div className="mb-3 flex items-center justify-between"><h3 className="font-display text-lg font-semibold">Agentes</h3><Link to="/agents" className="text-xs text-muted hover:text-fg">Ver todos</Link></div><div className="flex flex-col gap-2">{agents.slice(0, 5).map((agent) => { const conn = connections.find((c) => c.id === agent.connectionId); return <Link key={agent.id} to="/agents/$id" params={{ id: agent.id }} search={{ tab: "create" }} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 hover:bg-elevated"><div className="flex size-9 items-center justify-center rounded-full bg-elevated font-display text-sm">{agent.name.slice(0, 1)}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-sm font-medium">{agent.name}</span><StatusDot status={agent.status} /></div><div className="truncate text-xs text-muted">{conn ? `${conn.name} · ${PROVIDER_LABEL[conn.provider]}` : "Sem canal conectado"}</div></div><Badge tone={agent.status === "live" ? "live" : "neutral"}>{AGENT_STATUS_LABEL[agent.status]}</Badge></Link>; })}</div></div><div><div className="mb-3 flex items-center justify-between"><h3 className="font-display text-lg font-semibold">Canais</h3><Link to="/connections" className="text-xs text-muted hover:text-fg">Gerenciar</Link></div><div className="flex flex-col gap-2">{connections.slice(0, 5).map((connection) => <Link key={connection.id} to="/connections" search={{ focus: connection.id }} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 hover:bg-elevated"><Plug2 className="size-4 text-muted" /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-sm font-medium">{connection.name}</span><StatusDot status={connection.status} /></div><div className="text-xs text-muted">{PROVIDER_LABEL[connection.provider]} · {CONNECTION_STATUS_LABEL[connection.status]}</div></div></Link>)}</div><h3 className="mb-3 mt-8 font-display text-lg font-semibold">Atividade recente</h3><div className="flex flex-col gap-2">{events.slice(0, 5).map((event) => <div key={event.id} className="flex items-start justify-between gap-3 text-sm"><span className="text-muted">{event.text}</span><span className="shrink-0 font-mono text-xs text-subtle">{formatRelative(event.at)}</span></div>)}</div></div></section>
      <NexoBot />
    </AppShell>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) { return <Card className="px-4 py-4"><div className="text-xs uppercase tracking-wide text-subtle">{label}</div><div className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</div><div className="mt-1 text-xs text-muted">{detail}</div></Card>; }
function HealthRow({ label, value, good }: { label: string; value: string; good: boolean }) { return <div className="flex items-center gap-2"><span className={`size-2 rounded-full ${good ? "bg-live" : "bg-warn"}`} /><span className="flex-1 text-muted">{label}</span><span className="text-xs font-medium">{value}</span></div>; }
