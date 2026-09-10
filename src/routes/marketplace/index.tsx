import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bot, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { listMarketplaceProducts } from "@/lib/multitenancy/api";

type Product = Awaited<ReturnType<typeof listMarketplaceProducts>>[number];
export const Route = createFileRoute("/marketplace/")({ component: MarketplacePage });

function MarketplacePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { void listMarketplaceProducts({}).then(setProducts).finally(() => setLoading(false)); }, []);
  return <AppShell title="Marketplace">
    <div className="mb-7 max-w-3xl"><p className="font-display text-2xl font-semibold tracking-tight">Agentes prontos para o seu workspace</p><p className="mt-2 text-sm leading-relaxed text-muted">Instale agentes operacionais do Nexo, personalize o comportamento permitido e publique quando estiver pronto.</p></div>
    {loading ? <Card className="p-6 text-sm text-muted">Carregando catálogo...</Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{products.map((product) => <Card key={product.id} className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3"><div className="flex size-10 items-center justify-center rounded-lg bg-accent/15 text-accent"><Bot className="size-5" /></div><Badge tone="live">Disponível</Badge></div>
      <p className="mt-5 font-display text-lg font-semibold">{product.name}</p><p className="mt-2 min-h-12 text-sm leading-relaxed text-muted">{product.description}</p>
      <div className="mt-5 flex flex-wrap gap-2"><Badge>{product.category}</Badge><Badge>{product.offerMode === "trial" ? "Trial interno" : product.offerMode}</Badge><Badge><ShieldCheck className="mr-1 inline size-3" /> {product.riskLevel}</Badge></div>
      <Link className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline" to="/marketplace/agents/$productId" params={{ productId: product.id }}>Ver detalhes <ArrowRight className="size-4" /></Link>
    </Card>)}{products.length === 0 && <Card className="p-6 text-sm text-muted"><Sparkles className="mb-2 size-5" />Nenhum agente publicado no catálogo.</Card>}</div>}
  </AppShell>;
}
