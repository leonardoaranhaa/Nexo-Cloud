import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Download, Lock, LogIn, Plug, Rocket } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getMarketplaceProduct, installWorkspaceMarketplaceProduct } from "@/lib/multitenancy/api";
import { useNexo } from "@/lib/store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

type Product = Awaited<ReturnType<typeof getMarketplaceProduct>>;
type ProductManifest = {
  editableFields?: string[];
  protectedComponents?: string[];
  supportedConnectors?: string[];
  requiredTools?: string[];
  capabilities?: string[];
  objectives?: string[];
  guardrails?: string[];
};
export const Route = createFileRoute("/marketplace/agents/$productId")({ component: ProductPage });

function ProductPage() {
  const { productId } = Route.useParams();
  const workspaceId = useNexo((s) => s.workspaceId);
  const { user } = useCurrentUserState();
  const anonymous = !user;
  const [product, setProduct] = useState<Product | null>(null);
  const [installing, setInstalling] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { void getMarketplaceProduct({ data: { productId } }).then(setProduct).catch(() => toast("Produto não encontrado.")); }, [productId]);
  if (!product) return <AppShell title="Marketplace" allowAnonymous><Card className="p-6 text-sm text-muted">Carregando produto...</Card></AppShell>;
  const manifest = product.manifest as ProductManifest;
  async function install() {
    if (anonymous) return toast("Entre ou crie uma conta para instalar este agente.");
    if (!workspaceId) return toast("Selecione um workspace antes de instalar.");
    setInstalling(true);
    try { const result = await installWorkspaceMarketplaceProduct({ data: { workspaceId, productId } }); toast("Agente instalado como rascunho."); void navigate({ to: "/marketplace/installed/$installationId", params: { installationId: result.id } }); }
    catch { toast("Não foi possível instalar o agente."); } finally { setInstalling(false); }
  }
  return <AppShell title="Marketplace" allowAnonymous><Link to="/marketplace" className="mb-6 inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"><ArrowLeft className="size-4" /> Voltar ao catálogo</Link>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]"><main className="space-y-5"><Card className="p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><Badge tone="live">Nexo Cloud</Badge><h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">{product.name}</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{product.description}</p></div><Badge>v{product.versionNumber}</Badge></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="rounded-md bg-elevated p-3"><p className="text-xs text-muted">Categoria</p><p className="mt-1 text-sm font-medium">{product.category}</p></div><div className="rounded-md bg-elevated p-3"><p className="text-xs text-muted">Oferta</p><p className="mt-1 text-sm font-medium">{product.offerMode === "trial" ? "Trial interno" : product.offerMode}</p></div><div className="rounded-md bg-elevated p-3"><p className="text-xs text-muted">Risco</p><p className="mt-1 text-sm font-medium">{product.riskLevel}</p></div></div></Card>
      <Card className="p-6"><h2 className="font-display font-semibold">Capacidades incluídas</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{(manifest.capabilities ?? []).map((item) => <p key={item} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-success" />{item}</p>)}</div><div className="mt-6 border-t border-border pt-5"><h3 className="text-sm font-semibold">Objetivos operacionais</h3><div className="mt-3 space-y-2 text-sm text-muted">{(manifest.objectives ?? []).map((item) => <p key={item}>• {item}</p>)}</div></div></Card>
      <Card className="p-6"><h2 className="font-display font-semibold">O que será instalado</h2><div className="mt-4 space-y-3 text-sm">{["Um agente draft isolado no workspace", "Manifesto e versão inicial do produto", "Entitlement interno para uso do agente", "Configuração pronta para customização"].map((item) => <p key={item} className="flex items-center gap-2"><Check className="size-4 text-success" />{item}</p>)}</div><div className="mt-6 border-t border-border pt-5"><h3 className="text-sm font-semibold">Guardrails do produto</h3><div className="mt-3 space-y-2 text-sm text-muted">{(manifest.guardrails ?? []).map((item) => <p key={item}>• {item}</p>)}</div></div></Card>
    </main><aside className="space-y-4"><Card className="p-5">{anonymous ? <><Button className="w-full" asChild><Link to="/login"><LogIn className="size-4" /> Entrar para instalar</Link></Button><p className="mt-3 text-center text-xs text-muted">Crie uma conta para instalar este agente no seu workspace.</p></> : <><Button className="w-full" onClick={() => void install()} disabled={installing}><Download className="size-4" /> {installing ? "Instalando..." : "Instalar no workspace"}</Button><p className="mt-3 text-center text-xs text-muted">A instalação é idempotente e começa como rascunho.</p></>}</Card><Card className="p-5"><h2 className="font-display font-semibold">Dependências operacionais</h2><div className="mt-4 space-y-3 text-sm"><p className="flex gap-2"><Plug className="size-4 shrink-0 text-muted" /> {manifest.supportedConnectors?.length ? `Canais compatíveis: ${manifest.supportedConnectors.join(", ")}` : "Canais configuráveis no workspace"}</p><p className="flex gap-2"><Rocket className="size-4 shrink-0 text-muted" /> Publicação manual após teste</p><p className="flex gap-2"><Lock className="size-4 shrink-0 text-muted" /> Componentes críticos protegidos</p></div></Card><Card className="p-5"><h2 className="font-display font-semibold">Ferramentas declaradas</h2><div className="mt-3 flex flex-wrap gap-2">{(manifest.requiredTools ?? []).map((tool) => <Badge key={tool}>{tool}</Badge>)}</div></Card><Card className="p-5"><h2 className="font-display font-semibold">Campos editáveis</h2><div className="mt-3 flex flex-wrap gap-2">{(manifest.editableFields ?? []).map((field) => <Badge key={field}>{field}</Badge>)}</div></Card></aside></div>
  </AppShell>;
}
