import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { AGENT_TEMPLATES, type AgentTemplateId } from "@/lib/templates";
import { generateAgent } from "@/lib/ai";
import { useNexo } from "@/lib/store";
import { createId } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PROVIDER_LABEL } from "@/lib/types";
import { bindWorkspaceAgentConnection, createWorkspaceAgent, updateWorkspaceAgent } from "@/lib/multitenancy/api";
import { useWorkspaceData } from "@/lib/multitenancy/use-workspace-data";
import { guidanceForWorkspaceGoal, type WorkspaceGoal } from "@/lib/workspace-goal";

export function CreateAgentDialog({ triggerLabel = "Novo agente" }: { triggerLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"template" | "brief">("brief");
  const [template, setTemplate] = useState<AgentTemplateId>("support");
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [connectionId, setConnectionId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const addAgent = useNexo((s) => s.addAgent);
  const workspaceId = useNexo((s) => s.workspaceId);
  const backendReady = useNexo((s) => s.backendReady);
  const connections = useNexo((s) => s.connections);
  const workspaceGoal = useNexo((s) => s.workspaces.find((workspace) => workspace.id === s.workspaceId)?.onboardingGoal ?? null);
  const guidance = guidanceForWorkspaceGoal(workspaceGoal as WorkspaceGoal);
  const navigate = useNavigate();
  const { refresh } = useWorkspaceData();

  useEffect(() => {
    if (open && guidance) setTemplate(guidance.recommendedTemplate);
  }, [open, guidance]);

  async function persistOrCreate(draft: typeof AGENT_TEMPLATES[number]["draft"], nextName: string) {
    if (backendReady && workspaceId) {
      const created = await createWorkspaceAgent({
        data: {
          workspaceId,
          name: nextName,
          persona: draft.persona,
          welcomeMessage: draft.welcomeMessage,
          systemPrompt: draft.systemPrompt,
          agentType: template,
        },
      });
      await updateWorkspaceAgent({
        data: {
          workspaceId,
          id: created.id,
          name: nextName,
          persona: draft.persona,
          welcomeMessage: draft.welcomeMessage,
          systemPrompt: draft.systemPrompt,
          language: draft.language,
          status: "draft",
          temperature: draft.temperature,
          maxTokens: draft.maxTokens,
          memoryWindow: draft.memoryWindow,
          knowledge: draft.knowledge,
          tools: draft.tools,
        },
      });
      if (connectionId) {
        await bindWorkspaceAgentConnection({
          data: { agentId: created.id, workspaceId, connectionId },
        });
      }
      await refresh(workspaceId);
      return created.id;
    }
    return addAgent({ ...draft, name: nextName, status: "draft", connectionId: connectionId || null });
  }

  async function fromTemplate() {
    const t = AGENT_TEMPLATES.find((x) => x.id === template)!;
    setBusy(true);
    try {
      const id = await persistOrCreate(t.draft, name.trim() || t.title);
      setOpen(false);
      void navigate({ to: "/agents/$id", params: { id }, search: { tab: "create" } });
    } catch {
      toast("Não foi possível salvar o agente.");
    } finally {
      setBusy(false);
    }
  }

  async function fromBrief() {
    if (brief.trim().length < 8) {
      toast("Descreva o negócio em algumas frases.");
      return;
    }
    setBusy(true);
    try {
      const res = await generateAgent({ data: { brief } });
      if (!res.ok) {
        toast(res.error);
        return;
      }
      const t = AGENT_TEMPLATES.find((x) => x.id === "support")!;
      const draft = {
        ...t.draft,
        persona: res.persona,
        welcomeMessage: res.welcomeMessage,
        systemPrompt: res.systemPrompt,
        knowledge: {
          notes: res.notes,
          faqs: res.faqs.map((f) => ({ ...f, id: createId("faq") })),
        },
        template: "support",
      };
      const id = await persistOrCreate(draft, name.trim() || res.name);
      toast("Agente criado. Ajuste o prompt e teste no telefone.");
      setOpen(false);
      setBrief("");
      void navigate({ to: "/agents/$id", params: { id }, search: { tab: "create" } });
    } catch {
      toast("Falha ao gerar. Tente um modelo pronto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent title="Criar agente" className="max-h-[min(90dvh,720px)] overflow-y-auto">
        <p className="mt-1 text-sm text-muted">
          Descreva o resultado desejado ou escolha um template. Depois revise, teste e publique uma versão do agente.
        </p>
        {guidance && <div className="mt-4 rounded-lg border border-accent/40 bg-elevated/60 p-3"><div className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">Recomendação para este workspace</div><div className="mt-1 text-sm font-medium">{guidance.title}</div><p className="mt-1 text-xs leading-relaxed text-muted">{guidance.description}</p></div>}
        <div className="mt-4 mb-3 grid grid-cols-2 gap-1 rounded-md bg-bg p-1">
          <button
            type="button"
            className={cn(
              "h-9 rounded-sm text-sm",
              tab === "brief" ? "bg-elevated text-fg" : "text-muted",
            )}
            onClick={() => setTab("brief")}
          >
            Descrição do agente
          </button>
          <button
            type="button"
            className={cn(
              "h-9 rounded-sm text-sm",
              tab === "template" ? "bg-elevated text-fg" : "text-muted",
            )}
            onClick={() => setTab("template")}
          >
            Modelo
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-name">Nome</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Clara — Atendimento"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-conn">Conexão</Label>
            <select
              id="agent-conn"
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-border bg-bg px-3 text-sm text-fg focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none"
            >
              <option value="">Sem canal ainda</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {PROVIDER_LABEL[c.provider]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {tab === "template" ? (
          <div className="mt-4 grid gap-2">
            {AGENT_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplate(t.id)}
                className={cn(
                  "rounded-lg border px-3 py-3 text-left",
                  template === t.id ? "border-accent bg-elevated" : "border-border bg-bg",
                )}
                >
                <div className="flex items-center gap-2 text-sm font-medium">{t.title}{guidance?.recommendedTemplate === t.id && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">Recomendado</span>}</div>
                <div className="mt-0.5 text-xs text-muted">{t.blurb}</div>
              </button>
            ))}
            <div className="mt-2 flex justify-end">
              <Button onClick={() => void fromTemplate()} disabled={busy}>Configurar modelo</Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="brief">Briefing</Label>
              <Textarea
                id="brief"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Ex.: Clínica odontológica em Curitiba. Quero um agente que agenda avaliações, fala de clareamento e passa para a recepção se pedirem preço de implante."
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(guidance?.briefs ?? SAMPLE_BRIEFS).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setBrief(s)}
                  className="rounded-full border border-border bg-bg px-2.5 py-1 text-left text-xs text-muted hover:text-fg"
                >
                  {s.slice(0, 42)}…
                </button>
              ))}
            </div>
            <Button onClick={() => void fromBrief()} disabled={busy}>
              <Sparkles className="size-4" />
              {busy ? "Gerando…" : "Gerar agente"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const SAMPLE_BRIEFS = [
  "Clínica odontológica em Curitiba. Agenda avaliações, fala de clareamento e passa preço de implante para a recepção.",
  "Pet shop com delivery em Porto Alegre. Toma pedido, informa prazo e transfere se houver reclamação.",
  "Imobiliária em Pinheiros. Qualifica aluguel ou compra, bairro e faixa de valor, depois passa ao corretor.",
];
