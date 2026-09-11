import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ArrowLeft, CheckCircle2, History, RefreshCw, RotateCcw, Save, ShieldAlert, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getWorkspaceMarketplaceInstallation, getWorkspaceMarketplaceInstallationOperationalSummary, getWorkspaceMarketplaceInstallationUpdatePlan, listWorkspaceMarketplaceInstallationRevisions, rollbackWorkspaceMarketplaceInstallation, updateWorkspaceMarketplaceCustomization, updateWorkspaceMarketplaceInstallation } from "@/lib/multitenancy/api";
import { useNexo } from "@/lib/store";

export const Route = createFileRoute("/marketplace/installed/$installationId")({ component: CustomizeInstallationPage });

type Installation = Awaited<ReturnType<typeof getWorkspaceMarketplaceInstallation>>;
type UpdatePlan = Awaited<ReturnType<typeof getWorkspaceMarketplaceInstallationUpdatePlan>>;
type Revision = Awaited<ReturnType<typeof listWorkspaceMarketplaceInstallationRevisions>>[number];
type OperationalSummary = Awaited<ReturnType<typeof getWorkspaceMarketplaceInstallationOperationalSummary>>;
type HealthStatus = OperationalSummary["health"]["status"];

const STATUS_LABELS: Record<Installation["status"], string> = { draft: "Rascunho", staging: "Staging", active: "Ativa", paused: "Pausada", uninstalled: "Desinstalada" };
const ACTION_LABELS: Record<Revision["action"], string> = { update: "Atualização", rollback: "Rollback" };
const HEALTH_LABELS: Record<HealthStatus, string> = { healthy: "Saudável", attention: "Atenção", degraded: "Degradada", no_activity: "Sem atividade", unavailable: "Indisponível" };
function statusTone(status: Installation["status"]): "neutral" | "live" | "warn" { if (status === "active") return "live"; if (status === "staging") return "warn"; return "neutral"; }
function healthTone(status: HealthStatus): "neutral" | "live" | "warn" | "danger" { if (status === "healthy") return "live"; if (status === "attention") return "warn"; if (status === "no_activity") return "neutral"; return "danger"; }
function formatTimestamp(value: string | null): string { return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "Nunca"; }

function CustomizeInstallationPage() {
  const { installationId } = Route.useParams();
  const workspaceId = useNexo((state) => state.workspaceId);
  const backendReady = useNexo((state) => state.backendReady);
  const [installation, setInstallation] = useState<Installation | null>(null);
  const [operational, setOperational] = useState<OperationalSummary | null>(null);
  const [plan, setPlan] = useState<UpdatePlan | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId || !backendReady) return;
    setLoading(true);
    try {
      const [result, nextOperational, nextPlan, nextRevisions] = await Promise.all([
        getWorkspaceMarketplaceInstallation({ data: { workspaceId, installationId } }),
        getWorkspaceMarketplaceInstallationOperationalSummary({ data: { workspaceId, installationId } }),
        getWorkspaceMarketplaceInstallationUpdatePlan({ data: { workspaceId, installationId } }),
        listWorkspaceMarketplaceInstallationRevisions({ data: { workspaceId, installationId } }),
      ]);
      setInstallation(result); setOperational(nextOperational); setPlan(nextPlan); setRevisions(nextRevisions);
      const values = result.customizations;
      setName(typeof values.name === "string" ? values.name : result.agentName);
      setPersona(typeof values.persona === "string" ? values.persona : "");
      setWelcomeMessage(typeof values.welcomeMessage === "string" ? values.welcomeMessage : "");
    } catch { toast("Não foi possível carregar a instalação e seu estado operacional."); }
    finally { setLoading(false); }
  }, [backendReady, installationId, workspaceId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function save() {
    if (!workspaceId || !installation) return;
    if (!name.trim()) return toast("Informe um nome para o agente.");
    setSaving(true);
    try { await updateWorkspaceMarketplaceCustomization({ data: { workspaceId, installationId, customizations: { name: name.trim(), persona: persona.trim(), welcomeMessage: welcomeMessage.trim() } } }); toast("Customização salva no workspace."); await load(); }
    catch { toast("Não foi possível salvar a customização."); }
    finally { setSaving(false); }
  }

  async function prepareUpdate() {
    if (!workspaceId || !plan?.available || busy) return;
    setBusy(true);
    try { await updateWorkspaceMarketplaceInstallation({ data: { workspaceId, installationId } }); toast("Atualização preparada em staging. Teste o agente antes de publicar."); await load(); }
    catch { toast("Não foi possível preparar a atualização."); }
    finally { setBusy(false); }
  }

  async function prepareRollback() {
    if (!workspaceId || !installation?.rollbackAvailable || busy) return;
    setBusy(true);
    try { await rollbackWorkspaceMarketplaceInstallation({ data: { workspaceId, installationId } }); toast("Rollback preparado em staging. Publique o agente para efetivar."); await load(); }
    catch { toast("Não há rollback disponível para esta instalação."); }
    finally { setBusy(false); }
  }

  return <AppShell title="Customizar instalação"><Link to="/marketplace/installed" className="mb-6 inline-flex items-center gap-2 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> Minhas Instalações</Link>{!backendReady || loading ? <Card className="p-6 text-sm text-muted">{backendReady ? "Carregando instalação…" : "Aguardando o workspace e o backend…"}</Card> : !installation ? <Card className="p-6 text-sm text-muted">Instalação não encontrada.</Card> : <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
    <div className="space-y-5"><Card className="p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><Badge tone={statusTone(installation.status)}>{STATUS_LABELS[installation.status]}</Badge><Badge tone="neutral">v{installation.versionNumber}</Badge>{operational && <Badge tone={healthTone(operational.health.status)}>{HEALTH_LABELS[operational.health.status]}</Badge>}{installation.updateAvailable && <Badge tone="accent">v{installation.latestVersionNumber} disponível</Badge>}</div><h1 className="mt-3 font-display text-2xl font-semibold tracking-tight">{installation.productName}</h1><p className="mt-2 text-sm text-muted">Instalação isolada no workspace atual. As customizações abaixo afetam somente este agente.</p></div></div><div className="mt-7 space-y-5"><label className="block"><span className="mb-2 block text-sm font-medium">Nome do agente</span><Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Atendimento da ACME" /></label><label className="block"><span className="mb-2 block text-sm font-medium">Persona</span><Textarea value={persona} maxLength={500} onChange={(event) => setPersona(event.target.value)} placeholder="Descreva como o agente deve se comportar, seu tom e sua postura." /><span className="mt-1 block text-xs text-muted">Até 500 caracteres.</span></label><label className="block"><span className="mb-2 block text-sm font-medium">Mensagem inicial</span><Textarea value={welcomeMessage} maxLength={1000} onChange={(event) => setWelcomeMessage(event.target.value)} placeholder="Olá! Como posso ajudar?" /><span className="mt-1 block text-xs text-muted">Até 1.000 caracteres.</span></label></div><div className="mt-7 flex justify-end"><Button onClick={() => void save()} disabled={saving}><Save className="size-4" /> {saving ? "Salvando…" : "Salvar customização"}</Button></div></Card>
      {operational && <Card className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Activity className="size-4 text-accent" /><h2 className="font-display font-semibold">Saúde e uso operacional</h2><Badge tone={healthTone(operational.health.status)}>{HEALTH_LABELS[operational.health.status]}</Badge></div><p className="mt-2 text-sm text-muted">{operational.health.reason} Janela de uso: últimos {operational.usage.periodDays} dias.</p></div><span className="text-xs text-subtle">Atualização automática a cada 30 s</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Conversas" value={operational.usage.conversations} detail={`Última atividade: ${formatTimestamp(operational.usage.lastActivityAt)}`} /><Metric label="Mensagens" value={`${operational.usage.inboundMessages} / ${operational.usage.outboundMessages}`} detail="Recebidas / enviadas" /><Metric label="Execuções" value={operational.usage.jobs} detail={`${operational.usage.successRate}% de sucesso · ${operational.usage.failedJobs} falha(s)`} /><Metric label="Duração média" value={`${operational.usage.averageDurationMs} ms`} detail={`Falha mais recente: ${formatTimestamp(operational.usage.lastFailureAt)}`} /></div></Card>}
      {plan?.available && <Card className="border-accent/30 p-5"><div className="flex items-start gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent"><RefreshCw className="size-4" /></span><div className="min-w-0 flex-1"><h2 className="font-display font-semibold">Atualização disponível: v{plan.targetVersionNumber}</h2><p className="mt-1 text-sm text-muted">A atualização será preparada em staging e preservará suas customizações declaradas.</p>{plan.changelog && <p className="mt-3 rounded-md bg-bg p-3 text-sm text-muted">{plan.changelog}</p>}<div className="mt-4 grid gap-3 sm:grid-cols-2"><div><p className="text-xs font-medium text-muted">Campos alterados</p><p className="mt-1 text-sm">{plan.changedFields.length > 0 ? plan.changedFields.join(", ") : "Nenhum campo estrutural"}</p></div><div><p className="text-xs font-medium text-muted">Customizações preservadas</p><p className="mt-1 text-sm">{plan.preservedCustomizations.length > 0 ? plan.preservedCustomizations.join(", ") : "Nenhuma"}</p></div></div>{plan.protectedChanges.length > 0 && <p className="mt-3 flex items-start gap-2 text-xs text-amber-300"><ShieldAlert className="mt-0.5 size-3.5 shrink-0" />Componentes protegidos alterados: {plan.protectedChanges.join(", ")}. Revise o comportamento antes da publicação.</p>}<Button className="mt-4" size="sm" onClick={() => void prepareUpdate()} disabled={busy}><RefreshCw className="size-3.5" /> {busy ? "Preparando…" : "Preparar atualização em staging"}</Button></div></div></Card>}
      {revisions.length > 0 && <Card className="p-5"><div className="flex items-center gap-2"><History className="size-4 text-accent" /><h2 className="font-display font-semibold">Histórico da instalação</h2></div><div className="mt-4 divide-y divide-border">{revisions.map((revision) => <div key={revision.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div><p className="text-sm font-medium">{ACTION_LABELS[revision.action]} · v{revision.fromVersionNumber} → v{revision.toVersionNumber}</p><p className="mt-1 text-xs text-muted">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(revision.createdAt))}</p></div><Badge tone={revision.action === "rollback" ? "warn" : "neutral"}>{revision.action === "rollback" ? "Revertido" : "Atualizado"}</Badge></div>)}</div></Card>}</div>
    <aside className="space-y-5"><Card className="p-5"><p className="font-display font-semibold">Ciclo operacional</p><div className="mt-4 space-y-3 text-sm"><Step done={installation.status !== "draft"} label="Instalação criada" /><Step done={installation.status === "staging" || installation.status === "active"} label="Configuração preparada" /><Step done={installation.status === "active"} label="Versão publicada" /></div><div className="mt-5 flex flex-wrap gap-2"><Link to="/agents/$id" params={{ id: installation.agentId }} search={{ tab: "test" }} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"><CheckCircle2 className="size-3.5" /> Testar agente</Link><Link to="/agents/$id" params={{ id: installation.agentId }} search={{ tab: "create" }} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">Configuração completa</Link></div></Card><Card className="p-5"><p className="font-display font-semibold">Saúde dos canais</p><p className="mt-2 text-sm leading-relaxed text-muted">{operational ? `${operational.health.connectedConnectionCount} de ${operational.health.connectionCount} canal(is) conectado(s).` : "Carregando canais…"}</p><Link to="/connections" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">Gerenciar conexões</Link></Card><Card className="p-5"><p className="font-display font-semibold">Rollback controlado</p><p className="mt-2 text-sm leading-relaxed text-muted">O rollback não apaga histórico. Ele prepara o snapshot anterior em staging para revisão e nova publicação.</p><Button className="mt-4 w-full" variant="secondary" size="sm" onClick={() => void prepareRollback()} disabled={!installation.rollbackAvailable || busy}><RotateCcw className="size-3.5" /> {installation.rollbackAvailable ? "Preparar rollback" : "Nenhum rollback disponível"}</Button></Card></aside>
  </div>}</AppShell>;
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) { return <div className="rounded-lg border border-border bg-bg p-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 flex items-center gap-1.5 font-medium"><Zap className="size-3.5 text-accent" /> {value}</p><p className="mt-1 text-xs text-subtle">{detail}</p></div>; }
function Step({ done, label }: { done: boolean; label: string }) { return <div className="flex items-center gap-2"><span className={`flex size-5 items-center justify-center rounded-full ${done ? "bg-live/15 text-live" : "bg-elevated text-subtle"}`}>{done ? <CheckCircle2 className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}</span><span className={done ? "text-fg" : "text-subtle"}>{label}</span></div>; }
