import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getWorkspaceMarketplaceInstallation, updateWorkspaceMarketplaceCustomization } from "@/lib/multitenancy/api";
import { useNexo } from "@/lib/store";

type Installation = Awaited<ReturnType<typeof getWorkspaceMarketplaceInstallation>>;
export const Route = createFileRoute("/marketplace/installed/$installationId")({ component: CustomizeInstallationPage });

function CustomizeInstallationPage() {
  const { installationId } = Route.useParams();
  const workspaceId = useNexo((state) => state.workspaceId);
  const [installation, setInstallation] = useState<Installation | null>(null);
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    void getWorkspaceMarketplaceInstallation({ data: { workspaceId, installationId } })
      .then((result) => {
        setInstallation(result);
        const values = result.customizations;
        setName(typeof values.name === "string" ? values.name : result.agentName);
        setPersona(typeof values.persona === "string" ? values.persona : "");
        setWelcomeMessage(typeof values.welcomeMessage === "string" ? values.welcomeMessage : "");
      })
      .catch(() => toast("Não foi possível carregar a instalação."))
      .finally(() => setLoading(false));
  }, [installationId, workspaceId]);

  async function save() {
    if (!workspaceId || !installation) return;
    if (!name.trim()) return toast("Informe um nome para o agente.");
    setSaving(true);
    try {
      await updateWorkspaceMarketplaceCustomization({ data: { workspaceId, installationId, customizations: { name: name.trim(), persona: persona.trim(), welcomeMessage: welcomeMessage.trim() } } });
      setInstallation((current) => current ? { ...current, agentName: name.trim(), customizations: { ...current.customizations, name: name.trim(), persona: persona.trim(), welcomeMessage: welcomeMessage.trim() } } : current);
      toast("Customização salva.");
    } catch { toast("Não foi possível salvar a customização."); }
    finally { setSaving(false); }
  }

  return <AppShell title="Customizar instalação">
    <Link to="/marketplace" className="mb-6 inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"><ArrowLeft className="size-4" /> Voltar ao Marketplace</Link>
    {loading ? <Card className="p-6 text-sm text-muted">Carregando instalação...</Card> : !installation ? <Card className="p-6 text-sm text-muted">Instalação não encontrada.</Card> : <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card className="p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><Badge tone="neutral">Rascunho</Badge><h1 className="mt-3 font-display text-2xl font-semibold tracking-tight">{installation.productName}</h1><p className="mt-2 text-sm text-muted">Personalize os campos permitidos pelo produto. O manifesto e os componentes protegidos permanecem sob controle do Nexo.</p></div><Badge>v{installation.versionNumber}</Badge></div>
        <div className="mt-7 space-y-5"><label className="block"><span className="mb-2 block text-sm font-medium">Nome do agente</span><Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Atendimento da ACME" /></label><label className="block"><span className="mb-2 block text-sm font-medium">Persona</span><Textarea value={persona} maxLength={500} onChange={(event) => setPersona(event.target.value)} placeholder="Descreva como o agente deve se comportar, seu tom e sua postura." /><span className="mt-1 block text-xs text-muted">Até 500 caracteres.</span></label><label className="block"><span className="mb-2 block text-sm font-medium">Mensagem inicial</span><Textarea value={welcomeMessage} maxLength={1000} onChange={(event) => setWelcomeMessage(event.target.value)} placeholder="Olá! Como posso ajudar?" /><span className="mt-1 block text-xs text-muted">Até 1.000 caracteres.</span></label></div>
        <div className="mt-7 flex justify-end"><Button onClick={() => void save()} disabled={saving}><Save className="size-4" /> {saving ? "Salvando..." : "Salvar customização"}</Button></div>
      </Card>
      <aside><Card className="p-5"><p className="font-display font-semibold">Próximo passo</p><p className="mt-2 text-sm leading-relaxed text-muted">Depois de salvar, conecte um canal, teste o agente e publique a primeira versão operacional.</p><Link to="/agents/$id" params={{ id: installation.agentId }} search={{ tab: "test" }} className="mt-4 inline-flex text-sm font-medium text-accent hover:underline">Testar agente</Link></Card></aside>
    </div>}
  </AppShell>;
}
