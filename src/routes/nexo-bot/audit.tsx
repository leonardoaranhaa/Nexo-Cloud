import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Activity, Bot, CheckCircle2, Clock3, ListFilter, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getNexoBotAuditSummary, listNexoBotAuditEvents } from "@/lib/multitenancy/api";
import { useNexo } from "@/lib/store";

export const Route = createFileRoute("/nexo-bot/audit")({ component: NexoBotAuditPage });

type Summary = Awaited<ReturnType<typeof getNexoBotAuditSummary>>;
type AuditEvent = Awaited<ReturnType<typeof listNexoBotAuditEvents>>[number];
type EventType = AuditEvent["eventType"];
type Status = AuditEvent["status"];

const EVENT_LABELS: Record<EventType, string> = {
  chat_completed: "Conversa concluída",
  chat_failed: "Conversa com falha",
  action_proposed: "Ação proposta",
  action_confirmed: "Ação confirmada",
  action_succeeded: "Ação executada",
  action_failed: "Ação com falha",
};

const ACTION_LABELS: Record<string, string> = {
  navigate: "Navegação",
  create_agent: "Criar agente",
  provision_calendar_slot: "Adicionar horário",
};

function dateInput(value: Date) { return value.toISOString().slice(0, 10); }
function number(value: number) { return new Intl.NumberFormat("pt-BR").format(value); }
function duration(value: number) { return value > 0 ? `${Math.round(value)} ms` : "—"; }
function eventTone(event: AuditEvent): "neutral" | "live" | "warn" | "danger" | "accent" {
  if (event.status === "succeeded") return "live";
  if (event.status === "failed") return "danger";
  if (event.eventType === "action_proposed" || event.eventType === "action_confirmed") return "accent";
  return "neutral";
}
function statusLabel(event: AuditEvent) {
  if (event.status === "succeeded") return "Sucesso";
  if (event.status === "failed") return "Falha";
  return "Pendente";
}

function Metric({ title, value, detail, icon: Icon, tone }: { title: string; value: string; detail: string; icon: typeof Activity; tone: string }) {
  return <Card className="relative overflow-hidden p-4"><div className={`absolute right-4 top-4 rounded-lg p-2 ${tone}`}><Icon className="size-4" /></div><p className="text-sm text-muted">{title}</p><p className="mt-3 font-display text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-subtle">{detail}</p></Card>;
}

function eventDescription(event: AuditEvent) {
  if (event.summary) return event.summary;
  if (event.actionType) return ACTION_LABELS[event.actionType] ?? event.actionType;
  return EVENT_LABELS[event.eventType];
}

function NexoBotAuditPage() {
  const workspaceId = useNexo((state) => state.workspaceId);
  const backendReady = useNexo((state) => state.backendReady);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [eventType, setEventType] = useState<"" | EventType>("");
  const [actionType, setActionType] = useState("");
  const [status, setStatus] = useState<"" | Status>("");
  const [from, setFrom] = useState(dateInput(new Date(Date.now() - 7 * 86400000)));
  const [to, setTo] = useState(dateInput(new Date()));
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId || !backendReady) return;
    setLoading(true);
    try {
      const range = { workspaceId, from: new Date(`${from}T00:00:00`).toISOString(), to: new Date(`${to}T23:59:59.999`).toISOString() };
      const [nextSummary, nextEvents] = await Promise.all([
        getNexoBotAuditSummary({ data: range }),
        listNexoBotAuditEvents({ data: { ...range, eventType: eventType || undefined, actionType: actionType || undefined, status: status || undefined, limit: 100 } }),
      ]);
      setSummary(nextSummary);
      setEvents(nextEvents);
    } catch {
      toast("Não foi possível carregar os logs do Nexo Bot.");
    } finally {
      setLoading(false);
    }
  }, [actionType, backendReady, eventType, from, status, to, workspaceId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = window.setInterval(() => void load(), 15000); return () => window.clearInterval(timer); }, [load]);

  if (!backendReady) return <AppShell title="Auditoria do Nexo Bot"><Card className="p-6 text-sm text-muted">O painel depende do backend persistente e do workspace ativo.</Card></AppShell>;

  return <AppShell title="Auditoria do Nexo Bot"><div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><div className="flex items-center gap-2"><ShieldCheck className="size-5 text-accent" /><h1 className="font-display text-2xl font-semibold">Observabilidade do Nexo Bot</h1></div><p className="mt-1 max-w-2xl text-sm text-muted">Acompanhe consultas ao LLM, propostas, confirmações e ações executadas neste workspace. Conteúdo sensível não é armazenado.</p></div><Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw className="size-3.5" /> Atualizar</Button></div>
    <Card className="mb-5 flex flex-wrap items-end gap-3 p-4"><div className="flex items-center gap-2 pr-2 text-xs font-medium text-muted"><ListFilter className="size-4" /> Filtros</div><label className="grid gap-1 text-xs text-muted">Início<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-9 rounded-md border border-border bg-bg px-2 text-sm text-fg" /></label><label className="grid gap-1 text-xs text-muted">Fim<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-9 rounded-md border border-border bg-bg px-2 text-sm text-fg" /></label><label className="grid min-w-48 gap-1 text-xs text-muted">Evento<select value={eventType} onChange={(event) => setEventType(event.target.value as "" | EventType)} className="h-9 rounded-md border border-border bg-bg px-2 text-sm text-fg"><option value="">Todos os eventos</option>{Object.entries(EVENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="grid min-w-44 gap-1 text-xs text-muted">Ação<select value={actionType} onChange={(event) => setActionType(event.target.value)} className="h-9 rounded-md border border-border bg-bg px-2 text-sm text-fg"><option value="">Todas as ações</option>{Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="grid min-w-36 gap-1 text-xs text-muted">Estado<select value={status} onChange={(event) => setStatus(event.target.value as "" | Status)} className="h-9 rounded-md border border-border bg-bg px-2 text-sm text-fg"><option value="">Todos</option><option value="succeeded">Sucesso</option><option value="failed">Falha</option><option value="pending">Pendente</option></select></label></Card>
    {summary ? <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric title="Eventos registrados" value={number(summary.total)} detail={`${number(summary.chats)} conversas no período`} icon={Activity} tone="bg-blue-500/10 text-blue-400" /><Metric title="Ações propostas" value={number(summary.proposed)} detail={`${number(summary.confirmed)} confirmações`} icon={Bot} tone="bg-violet-500/10 text-violet-400" /><Metric title="Ações concluídas" value={number(summary.succeeded)} detail={`${number(summary.pending)} pendentes`} icon={CheckCircle2} tone="bg-emerald-500/10 text-emerald-400" /><Metric title="Falhas" value={number(summary.failed)} detail="Requerem investigação" icon={XCircle} tone="bg-rose-500/10 text-rose-400" /><Metric title="Latência média" value={duration(summary.averageDurationMs)} detail="Chamadas com duração registrada" icon={Clock3} tone="bg-amber-500/10 text-amber-400" /></div><Card className="mt-5 overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4"><div><h2 className="font-display font-semibold">Timeline de auditoria</h2><p className="text-xs text-muted">Últimos eventos do workspace em ordem cronológica inversa.</p></div>{summary.lastEventAt && <span className="text-xs text-subtle">Último evento {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(summary.lastEventAt))}</span>}</div>{events.length > 0 ? <div className="divide-y divide-border">{events.map((event) => <div key={event.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-start"><div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-elevated text-accent">{event.eventType.includes("chat") ? <Bot className="size-4" /> : event.status === "failed" ? <XCircle className="size-4 text-danger" /> : <Activity className="size-4" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{EVENT_LABELS[event.eventType]}</p>{event.actionType && <Badge tone="neutral">{ACTION_LABELS[event.actionType] ?? event.actionType}</Badge>}<Badge tone={eventTone(event)}>{statusLabel(event)}</Badge></div><p className="mt-1 text-sm text-muted">{eventDescription(event)}</p>{event.errorCode && <p className="mt-1 text-xs text-danger">Código: {event.errorCode}</p>}</div><div className="shrink-0 text-left text-xs text-subtle md:text-right"><p>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(event.createdAt))}</p><p className="mt-1">{duration(event.durationMs ?? 0)}</p></div></div>)}</div> : <div className="p-10 text-center"><ShieldCheck className="mx-auto size-8 text-subtle" /><p className="mt-3 text-sm font-medium">Nenhum evento encontrado</p><p className="mt-1 text-xs text-muted">Ajuste os filtros ou use o Nexo Bot para iniciar uma operação.</p></div>}</Card></> : <Card className="p-10 text-center text-sm text-muted">{loading ? "Carregando auditoria…" : "Nenhum dado disponível."}</Card>}
  </AppShell>;
}
