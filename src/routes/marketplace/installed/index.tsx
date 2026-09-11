import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, AlertTriangle, ArrowDownToLine, ArrowUpCircle, Bot, CheckCircle2, History, MessageSquare, RefreshCw, RotateCcw, Settings2, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listWorkspaceMarketplaceInstallationOperationalSummaries, listWorkspaceMarketplaceInstallations, rollbackWorkspaceMarketplaceInstallation, updateWorkspaceMarketplaceInstallation } from "@/lib/multitenancy/api";
import { useNexo } from "@/lib/store";

export const Route = createFileRoute("/marketplace/installed/")({ component: InstalledMarketplacePage });

type Installation = Awaited<ReturnType<typeof listWorkspaceMarketplaceInstallations>>[number];
type OperationalSummary = Awaited<ReturnType<typeof listWorkspaceMarketplaceInstallationOperationalSummaries>>[number];

type HealthStatus = OperationalSummary["health"]["status"];

const STATUS_LABELS: Record<Installation["status"], string> = { draft: "Rascunho", staging: "Staging", active: "Ativa", paused: "Pausada", uninstalled: "Desinstalada" };
const MODE_LABELS: Record<Installation["offerMode"], string> = { trial: "Avaliação", subscription: "Assinatura", license: "Licença", rental: "Locação", internal: "Interna" };
const HEALTH_LABELS: Record<HealthStatus, string> = { healthy: "Saudável", attention: "Atenção", degraded: "Degradada", no_activity: "Sem atividade", unavailable: "Indisponível" };

function statusTone(status: Installation["status"]): "neutral" | "live" | "warn" { if (status === "active") return "live"; if (status === "staging") return "warn"; return "neutral"; }
function healthTone(status: HealthStatus): "neutral" | "live" | "warn" | "danger" { if (status === "healthy") return "live"; if (status === "attention") return "warn"; if (status === "no_activity") return "neutral"; return "danger"; }
function formatTimestamp(value: string | null): string { return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "Nunca"; }

function InstalledMarketplacePage() {
  const workspaceId = useNexo((state) => state.workspaceId);
  const backendReady = useNexo((state) => state.backendReady);
  const [items, setItems] = useState<Installation[]>([]);
  const [summaries, setSummaries] = useState<Record<string, OperationalSummary>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId || !backendReady) return;
    setLoading(true);
    try {
      const [nextItems, nextSummaries] = await Promise.all([
        listWorkspaceMarketplaceInstallations({ data: { workspaceId } }),
        listWorkspaceMarketplaceInstallationOperationalSummaries({ data: { workspaceId } }),
      ]);
      setItems(nextItems);
      setSummaries(Object.fromEntries(nextSummaries.map((summary) => [summary.installationId, summary])));
    } catch { toast("Não foi possível carregar suas instalações e métricas."); }
    finally { setLoading(false); }
  }, [backendReady, workspaceId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function update(item: Installation) {
    if (!workspaceId || !item.updateAvailable || busy) return;
    setBusy(item.id);
    try { await updateWorkspaceMarketplaceInstallation({ data: { workspaceId, installationId: item.id } }); toast("Atualização preparada em staging. Revise e publique o agente quando estiver pronto."); await load(); }
    catch { toast("Não foi possível preparar esta atualização."); }
    finally { setBusy(null); }
  }

  async function rollback(item: Installation) {
    if (!workspaceId || !item.rollbackAvailable || busy) return;
    setBusy(item.id);
    try { await rollbackWorkspaceMarketplaceInstallation({ data: { workspaceId, installationId: item.id } }); toast("Rollback preparado em staging. Revise e publique o agente para efetivar."); await load(); }
    catch { toast("Não há rollback disponível para esta instalação."); }
    finally { setBusy(null); }
  }

  return <AppShell title="Minhas Instalações">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Marketplace</p><h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Minhas Instalações</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">Gerencie versões, saúde e uso dos agentes instalados neste workspace. Os indicadores usam os últimos sete dias e são atualizados automaticamente.</p></div><div className="flex items-center gap-3"><Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="size-3.5" /> Atualizar métricas</Button><Link to="/marketplace" className="text-sm font-medium text-accent hover:underline">Explorar Marketplace</Link></div></div>
    {!backendReady || loading ? <Card className="p-6 text-sm text-muted">{backendReady ? "Carregando instalações e métricas…" : "Aguardando o workspace e o backend…"}</Card> : items.length === 0 ? <Card className="p-10 text-center"><Bot className="mx-auto size-8 text-subtle" /><p className="mt-3 font-display text-lg font-semibold">Nenhuma instalação neste workspace</p><p className="mt-2 text-sm text-muted">Instale um produto do Marketplace para criar um agente versionado e isolado.</p><Link to="/marketplace" className="mt-4 inline-flex text-sm font-medium text-accent hover:underline">Ver produtos disponíveis</Link></Card> : <div className="grid gap-4">{items.map((item) => { const summary = summaries[item.id]; const health = summary?.health; const usage = summary?.usage; return <Card key={item.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-lg font-semibold">{item.agentName}</h2><Badge tone={statusTone(item.status)}>{STATUS_LABELS[item.status]}</Badge><Badge tone="neutral">{MODE_LABELS[item.offerMode]}</Badge>{health && <Badge tone={healthTone(health.status)}>{health.status === "healthy" ? <CheckCircle2 className="mr-1 size-3" /> : <AlertTriangle className="mr-1 size-3" />}{HEALTH_LABELS[health.status]}</Badge>}</div><p className="mt-1 text-sm text-muted">{item.productName} · instalação no workspace atual</p>{health && <p className="mt-2 text-xs text-subtle">{health.reason}</p>}</div><Link to="/marketplace/installed/$installationId" params={{ installationId: item.id }} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"><Settings2 className="size-3.5" /> Configurar</Link></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-lg border border-border bg-bg p-3"><p className="text-xs text-muted">Saúde</p><p className="mt-1 flex items-center gap-1.5 font-medium"><Activity className="size-3.5 text-accent" /> {health ? HEALTH_LABELS[health.status] : "Indisponível"}</p><p className="mt-1 text-xs text-subtle">Último healthcheck: {formatTimestamp(health?.checkedAt ?? null)}</p></div><div className="rounded-lg border border-border bg-bg p-3"><p className="text-xs text-muted">Uso · 7 dias</p><p className="mt-1 flex items-center gap-1.5 font-medium"><MessageSquare className="size-3.5 text-accent" /> {usage?.inboundMessages ?? 0} recebidas · {usage?.outboundMessages ?? 0} enviadas</p><p className="mt-1 text-xs text-subtle">{usage?.conversations ?? 0} conversa(s) · última atividade {formatTimestamp(usage?.lastActivityAt ?? null)}</p></div><div className="rounded-lg border border-border bg-bg p-3"><p className="text-xs text-muted">Execuções</p><p className="mt-1 flex items-center gap-1.5 font-medium"><Zap className="size-3.5 text-accent" /> {usage?.jobs ?? 0} jobs · {usage?.successRate ?? 0}% sucesso</p><p className="mt-1 text-xs text-subtle">{usage?.failedJobs ?? 0} falha(s) · {usage?.averageDurationMs ?? 0} ms médios</p></div><div className="rounded-lg border border-border bg-bg p-3"><p className="text-xs text-muted">Versões e histórico</p><p className="mt-1 font-medium">v{item.versionNumber} / v{item.latestVersionNumber}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-subtle"><History className="size-3.5" /> {item.revisionCount} revisão(ões) {item.updateAvailable ? "· atualização disponível" : "· atualizado"}</p></div></div><div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4"><Button variant="outline" size="sm" onClick={() => void update(item)} disabled={!item.updateAvailable || busy === item.id || Boolean(busy)}><ArrowUpCircle className="size-3.5" /> {item.updateAvailable ? `Preparar v${item.latestVersionNumber}` : "Sem atualização"}</Button><Button variant="ghost" size="sm" onClick={() => void rollback(item)} disabled={!item.rollbackAvailable || busy === item.id || Boolean(busy)}><RotateCcw className="size-3.5" /> {item.rollbackAvailable ? "Preparar rollback" : "Sem rollback"}</Button>{item.status === "staging" && <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-amber-300"><ArrowDownToLine className="size-3.5" /> Revise no agente e publique para efetivar</span>}</div></Card>; })}</div>}
  </AppShell>;
}
