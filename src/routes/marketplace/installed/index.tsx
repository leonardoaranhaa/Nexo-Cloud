import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { listWorkspaceMarketplaceInstallations, rollbackWorkspaceMarketplaceInstallation, updateWorkspaceMarketplaceInstallation } from "@/lib/multitenancy/api";
import { useNexo } from "@/lib/store";

type Installation = Awaited<ReturnType<typeof listWorkspaceMarketplaceInstallations>>[number];
export const Route = createFileRoute("/marketplace/installed/")({ component: InstalledMarketplacePage });

function InstalledMarketplacePage() {
  const workspaceId = useNexo((state) => state.workspaceId);
  const [items, setItems] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    if (!workspaceId) return;
    setLoading(true);
    try { setItems(await listWorkspaceMarketplaceInstallations({ data: { workspaceId } })); }
    catch { toast("Não foi possível carregar suas instalações."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [workspaceId]);
  async function update(item: Installation) {
    if (!workspaceId) return;
    setBusy(item.id);
    try { await updateWorkspaceMarketplaceInstallation({ data: { workspaceId, installationId: item.id } }); toast("Instalação atualizada para a versão disponível."); await load(); }
    catch { toast("Não foi possível atualizar esta instalação."); }
    finally { setBusy(null); }
  }
  async function rollback(item: Installation) {
    if (!workspaceId) return;
    setBusy(item.id);
    try { await rollbackWorkspaceMarketplaceInstallation({ data: { workspaceId, installationId: item.id } }); toast("Instalação revertida para a versão anterior."); await load(); }
    catch { toast("Não há rollback disponível para esta instalação."); }
    finally { setBusy(null); }
  }

  return <AppShell title="Minhas Instalações">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Marketplace</p><h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Minhas Instalações</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">Gerencie agentes instalados no workspace, acompanhe versões e reverta atualizações quando necessário.</p></div><Link to="/marketplace" className="text-sm font-medium text-accent hover:underline">Explorar Marketplace</Link></div>
    {loading ? <Card className="p-6 text-sm text-muted">Carregando instalações...</Card> : items.length === 0 ? <Card className="p-8 text-center"><p className="font-display text-lg font-semibold">Nenhuma instalação neste workspace</p><p className="mt-2 text-sm text-muted">Instale um produto do Marketplace para criar um agente versionado como rascunho.</p><Link to="/marketplace" className="mt-4 inline-flex text-sm font-medium text-accent hover:underline">Ver produtos</Link></Card> : <div className="grid gap-4">{items.map((item) => <Card key={item.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h2 className="font-display text-lg font-semibold">{item.agentName}</h2><Badge tone={item.status === "active" ? "live" : "neutral"}>{item.status}</Badge></div><p className="mt-1 text-sm text-muted">{item.productName} · versão {item.versionNumber}</p></div><Link to="/marketplace/installed/$installationId" params={{ installationId: item.id }} className="text-sm font-medium text-accent hover:underline">Configurar</Link></div><div className="mt-5 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => void update(item)} disabled={busy === item.id}>Atualizar versão</Button><Button variant="ghost" size="sm" onClick={() => void rollback(item)} disabled={busy === item.id}>Fazer rollback</Button></div></Card>)}</div>}
  </AppShell>;
}
