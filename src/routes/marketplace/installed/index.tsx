import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownToLine, ArrowUpCircle, Bot, History, RefreshCw, RotateCcw, Settings2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listWorkspaceMarketplaceInstallations, rollbackWorkspaceMarketplaceInstallation, updateWorkspaceMarketplaceInstallation } from "@/lib/multitenancy/api";
import { useNexo } from "@/lib/store";

export const Route = createFileRoute("/marketplace/installed/")({ component: InstalledMarketplacePage });

type Installation = Awaited<ReturnType<typeof listWorkspaceMarketplaceInstallations>>[number];

const STATUS_LABELS: Record<Installation["status"], string> = {
  draft: "Rascunho",
  staging: "Staging",
  active: "Ativa",
  paused: "Pausada",
  uninstalled: "Desinstalada",
};

const MODE_LABELS: Record<Installation["offerMode"], string> = {
  trial: "Avaliação",
  subscription: "Assinatura",
  license: "Licença",
  rental: "Locação",
  internal: "Interna",
};

function statusTone(status: Installation["status"]): "neutral" | "live" | "warn" {
  if (status === "active") return "live";
  if (status === "staging") return "warn";
  return "neutral";
}

function InstalledMarketplacePage() {
  const workspaceId = useNexo((state) => state.workspaceId);
  const backendReady = useNexo((state) => state.backendReady);
  const [items, setItems] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId || !backendReady) return;
    setLoading(true);
    try {
      setItems(await listWorkspaceMarketplaceInstallations({ data: { workspaceId } }));
    } catch {
      toast("Não foi possível carregar suas instalações.");
    } finally {
      setLoading(false);
    }
  }, [backendReady, workspaceId]);

  useEffect(() => { void load(); }, [load]);

  async function update(item: Installation) {
    if (!workspaceId || !item.updateAvailable || busy) return;
    setBusy(item.id);
    try {
      await updateWorkspaceMarketplaceInstallation({ data: { workspaceId, installationId: item.id } });
      toast("Atualização preparada em staging. Revise e publique o agente quando estiver pronto.");
      await load();
    } catch {
      toast("Não foi possível preparar esta atualização.");
    } finally {
      setBusy(null);
    }
  }

  async function rollback(item: Installation) {
    if (!workspaceId || !item.rollbackAvailable || busy) return;
    setBusy(item.id);
    try {
      await rollbackWorkspaceMarketplaceInstallation({ data: { workspaceId, installationId: item.id } });
      toast("Rollback preparado em staging. Revise e publique o agente para efetivar a versão anterior.");
      await load();
    } catch {
      toast("Não há rollback disponível para esta instalação.");
    } finally {
      setBusy(null);
    }
  }

  return <AppShell title="Minhas Instalações">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Marketplace</p><h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Minhas Instalações</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">Gerencie agentes instalados no workspace, acompanhe versões disponíveis e prepare atualizações ou rollbacks sem alterar o produto original.</p></div>
      <div className="flex items-center gap-3"><Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="size-3.5" /> Atualizar lista</Button><Link to="/marketplace" className="text-sm font-medium text-accent hover:underline">Explorar Marketplace</Link></div>
    </div>
    {!backendReady || loading ? <Card className="p-6 text-sm text-muted">{backendReady ? "Carregando instalações…" : "Aguardando o workspace e o backend…"}</Card> : items.length === 0 ? <Card className="p-10 text-center"><Bot className="mx-auto size-8 text-subtle" /><p className="mt-3 font-display text-lg font-semibold">Nenhuma instalação neste workspace</p><p className="mt-2 text-sm text-muted">Instale um produto do Marketplace para criar um agente versionado e isolado.</p><Link to="/marketplace" className="mt-4 inline-flex text-sm font-medium text-accent hover:underline">Ver produtos disponíveis</Link></Card> : <div className="grid gap-4">{items.map((item) => <Card key={item.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-lg font-semibold">{item.agentName}</h2><Badge tone={statusTone(item.status)}>{STATUS_LABELS[item.status]}</Badge><Badge tone="neutral">{MODE_LABELS[item.offerMode]}</Badge></div><p className="mt-1 text-sm text-muted">{item.productName} · instalação no workspace atual</p></div><Link to="/marketplace/installed/$installationId" params={{ installationId: item.id }} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"><Settings2 className="size-3.5" /> Configurar</Link></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-lg border border-border bg-bg p-3"><p className="text-xs text-muted">Versão instalada</p><p className="mt-1 font-medium">v{item.versionNumber}</p><p className="mt-1 text-xs text-subtle">{item.status === "staging" ? "Alteração aguardando publicação" : "Snapshot ativo no control plane"}</p></div><div className="rounded-lg border border-border bg-bg p-3"><p className="text-xs text-muted">Versão do produto</p><p className="mt-1 font-medium">v{item.latestVersionNumber}</p><p className="mt-1 text-xs text-subtle">{item.updateAvailable ? "Atualização disponível" : "Instalação atualizada"}</p></div><div className="rounded-lg border border-border bg-bg p-3"><p className="text-xs text-muted">Histórico</p><p className="mt-1 flex items-center gap-1.5 font-medium"><History className="size-3.5 text-accent" /> {item.revisionCount} revisão(ões)</p><p className="mt-1 text-xs text-subtle">{item.lastRevisionAt ? `Última em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(item.lastRevisionAt))}` : "Sem alterações"}</p></div></div><div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4"><Button variant="outline" size="sm" onClick={() => void update(item)} disabled={!item.updateAvailable || busy === item.id || Boolean(busy)}><ArrowUpCircle className="size-3.5" /> {item.updateAvailable ? `Preparar v${item.latestVersionNumber}` : "Sem atualização"}</Button><Button variant="ghost" size="sm" onClick={() => void rollback(item)} disabled={!item.rollbackAvailable || busy === item.id || Boolean(busy)}><RotateCcw className="size-3.5" /> {item.rollbackAvailable ? "Preparar rollback" : "Sem rollback"}</Button>{item.status === "staging" && <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-amber-300"><ArrowDownToLine className="size-3.5" /> Revise no agente e publique para efetivar</span>}</div></Card>)}</div>}
  </AppShell>;
}
