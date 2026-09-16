import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bot, LogIn, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { configureWorkspaceCrm, listMarketplaceProducts, listWorkspaceIntegrations } from "@/lib/multitenancy/api";
import { useNexo } from "@/lib/store";

type Product = Awaited<ReturnType<typeof listMarketplaceProducts>>[number];
type ProductManifest = { capabilities?: string[]; supportedConnectors?: string[]; requiredTools?: string[] };

export const Route = createFileRoute("/marketplace/")({ component: MarketplacePage });

function manifestOf(product: Product): ProductManifest {
  return product.manifest as ProductManifest;
}

function MarketplacePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [crmStatus, setCrmStatus] = useState<"pending" | "connected" | "disconnected" | "error" | null>(null);
  const [pipelineName, setPipelineName] = useState("Vendas");
  const [defaultStage, setDefaultStage] = useState("qualifying");
  const [savingCrm, setSavingCrm] = useState(false);
  const workspaceId = useNexo((s) => s.workspaceId);
  const backendReady = useNexo((s) => s.backendReady);
  const { user } = useCurrentUserState();
  const anonymous = !user;

  useEffect(() => {
    void listMarketplaceProducts({}).then(setProducts).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (anonymous || !workspaceId || !backendReady) return;
    void listWorkspaceIntegrations({ data: { workspaceId } }).then((items) => {
      const crm = items.find((item) => item.integrationKey === "crm.qualificacao");
      setCrmStatus(crm?.status ?? null);
      if (typeof crm?.config.pipelineName === "string") setPipelineName(crm.config.pipelineName);
      if (typeof crm?.config.defaultStage === "string") setDefaultStage(crm.config.defaultStage);
    });
  }, [anonymous, backendReady, workspaceId]);

  async function saveCrm() {
    if (anonymous) return toast("Entre ou crie uma conta para configurar o CRM.");
    if (!workspaceId) return toast("Selecione um workspace antes de configurar o CRM.");
    setSavingCrm(true);
    try {
      const result = await configureWorkspaceCrm({ data: { workspaceId, pipelineName, defaultStage, captureFields: ["name", "email", "phone", "need", "budget", "timeline"] } });
      setCrmStatus(result.status);
      toast("CRM e qualificação conectados ao workspace.");
    } catch {
      toast("Não foi possível configurar o CRM.");
    } finally {
      setSavingCrm(false);
    }
  }

  return (
    <AppShell title="Marketplace" allowAnonymous>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="font-display text-2xl font-semibold tracking-tight">Marketplace de agentes</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">Explore agentes operacionais prontos para atendimento, vendas e automação. Instalações e configurações ficam isoladas no workspace da sua organização.</p>
        </div>
        <Link to="/marketplace/installed" className="text-sm font-medium text-accent hover:underline">Minhas Instalações</Link>
      </div>

      {anonymous ? (
        <Card className="mb-6 border-accent/30 bg-accent/5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2"><p className="font-display text-lg font-semibold">Veja o catálogo em ação</p><Badge>Modo de exploração</Badge></div>
              <p className="mt-2 text-sm leading-relaxed text-muted">Você pode conhecer as capacidades e dependências dos agentes sem criar uma conta. Entre quando quiser instalar, customizar ou conectar um agente ao seu workspace.</p>
            </div>
            <Button asChild><Link to="/login"><LogIn className="size-4" />Entrar para instalar</Link></Button>
          </div>
        </Card>
      ) : (
        <Card className="mb-6 border-accent/30 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><p className="font-display text-lg font-semibold">CRM + Qualificação</p><Badge tone={crmStatus === "connected" ? "live" : crmStatus === "error" ? "danger" : "warn"}>{crmStatus === "connected" ? "Conectado" : crmStatus === "disconnected" ? "Desconectado" : "Não configurado"}</Badge></div><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">Integra a capacidade nativa de criar e qualificar leads, registrar estágio, score e campos confirmados no workspace.</p></div><Badge>Integração Nexo · risco médio</Badge></div>
          <div className="mt-5 grid gap-3 md:grid-cols-[1.2fr_1fr_auto] md:items-end"><div><Label htmlFor="crm-pipeline">Pipeline</Label><Input id="crm-pipeline" className="mt-1" value={pipelineName} onChange={(event) => setPipelineName(event.target.value)} placeholder="Vendas" /></div><div><Label htmlFor="crm-stage">Estágio inicial</Label><select id="crm-stage" className="mt-1 flex h-10 w-full rounded-md border border-border bg-bg px-3 text-sm text-fg" value={defaultStage} onChange={(event) => setDefaultStage(event.target.value)}><option value="new">Novo</option><option value="qualifying">Qualificando</option><option value="qualified">Qualificado</option></select></div><Button onClick={() => void saveCrm()} disabled={savingCrm}>{savingCrm ? "Salvando…" : crmStatus === "connected" ? "Atualizar configuração" : "Conectar ao workspace"}</Button></div>
          <div className="mt-4 grid gap-2 border-t border-border pt-4 text-xs text-muted sm:grid-cols-3"><span>Escopo: CRM nativo por workspace</span><span>Campos: nome, contato, necessidade, orçamento e prazo</span><span>Uso: ferramenta de qualificação do Agent Runtime</span></div>
        </Card>
      )}

      <div className="mb-3 font-display text-lg font-semibold">Agentes prontos</div>
      {loading ? <Card className="p-6 text-sm text-muted">Carregando catálogo...</Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{products.map((product) => { const manifest = manifestOf(product); return <Card key={product.id} className="flex flex-col p-5">
        <div className="flex items-start justify-between gap-3"><div className="flex size-10 items-center justify-center rounded-lg bg-accent/15 text-accent"><Bot className="size-5" /></div><Badge tone="live">Disponível</Badge></div>
        <p className="mt-5 font-display text-lg font-semibold">{product.name}</p><p className="mt-2 min-h-12 text-sm leading-relaxed text-muted">{product.description}</p>
        <div className="mt-5 flex flex-wrap gap-2"><Badge>{product.category}</Badge><Badge>{product.offerMode === "trial" ? "Trial interno" : product.offerMode}</Badge><Badge><ShieldCheck className="mr-1 inline size-3" /> {product.riskLevel}</Badge></div>
        <div className="mt-4 space-y-1 text-xs text-muted"><p>{manifest.capabilities?.[0] ?? "Capacidade operacional configurável"}</p><p>{manifest.requiredTools?.length ?? 0} ferramenta(s) nativa(s) declarada(s) · {manifest.supportedConnectors?.join(" / ") ?? "canais configuráveis"}</p></div>
        <Link className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline" to="/marketplace/agents/$productId" params={{ productId: product.id }}>Ver detalhes <ArrowRight className="size-4" /></Link>
      </Card>; })}{products.length === 0 && <Card className="p-6 text-sm text-muted"><Sparkles className="mb-2 size-5" />Nenhum agente publicado no catálogo.</Card>}</div>}
    </AppShell>
  );
}
