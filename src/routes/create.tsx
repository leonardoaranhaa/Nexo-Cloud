import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { CreateConnectionDialog } from "@/components/create-connection-dialog";
import { PhonePreview } from "@/components/phone-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusDot } from "@/components/status-dot";
import { generateAgent } from "@/lib/ai";
import { AGENT_TEMPLATES, type AgentTemplateId } from "@/lib/templates";
import { useAgentChat } from "@/lib/use-agent-chat";
import { useNexo } from "@/lib/store";
import { PROVIDER_HINT, PROVIDER_LABEL } from "@/lib/types";
import { cn, createId } from "@/lib/utils";

export const Route = createFileRoute("/create")({ component: CreateWizard });

const STEPS = [
  { id: 1, label: "Canal" },
  { id: 2, label: "Agente" },
  { id: 3, label: "Revisão" },
  { id: 4, label: "Teste" },
] as const;

const SAMPLE_BRIEFS = [
  "Clínica odontológica em Curitiba. Agenda avaliações, fala de clareamento e passa preço de implante para a recepção.",
  "Pet shop com delivery em Porto Alegre. Toma pedido, informa prazo e transfere se houver reclamação.",
  "Escritório de advocacia trabalhista. Qualifica se é reclamação trabalhista ou consulta, pede cidade e passa à secretaria.",
];

function CreateWizard() {
  const navigate = useNavigate();
  const connections = useNexo((s) => s.connections);
  const addAgent = useNexo((s) => s.addAgent);
  const updateAgent = useNexo((s) => s.updateAgent);
  const agents = useNexo((s) => s.agents);

  const [step, setStep] = useState(1);
  const [connectionId, setConnectionId] = useState<string | null>(
    connections.find((c) => c.status === "connected")?.id ?? connections[0]?.id ?? null,
  );
  const [source, setSource] = useState<"brief" | "template">("brief");
  const [template, setTemplate] = useState<AgentTemplateId>("support");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    persona: "",
    welcomeMessage: "",
    systemPrompt: "",
    notes: "",
  });

  const agent = agents.find((a) => a.id === agentId);
  const chat = useAgentChat(agentId ?? undefined);

  async function goReview() {
    if (source === "brief") {
      if (brief.trim().length < 8) {
        toast("Descreva o negócio em algumas frases.");
        return;
      }
      setBusy(true);
      try {
        const res = await generateAgent({ data: { brief } });
        const t = AGENT_TEMPLATES.find((x) => x.id === "support")!;
        if (!res.ok) {
          toast(res.error + " — usando modelo de atendimento.");
          setDraft({
            name: t.title,
            persona: t.draft.persona,
            welcomeMessage: t.draft.welcomeMessage,
            systemPrompt: t.draft.systemPrompt,
            notes: t.draft.knowledge.notes,
          });
          const id = addAgent({
            ...t.draft,
            name: t.title,
            status: "draft",
            connectionId,
          });
          setAgentId(id);
          setStep(3);
          return;
        }
        const id = addAgent({
          ...t.draft,
          name: res.name,
          persona: res.persona,
          welcomeMessage: res.welcomeMessage,
          systemPrompt: res.systemPrompt,
          knowledge: {
            notes: res.notes,
            faqs: res.faqs.map((f) => ({ ...f, id: createId("faq") })),
          },
          status: "draft",
          connectionId,
          template: "support",
        });
        setAgentId(id);
        setDraft({
          name: res.name,
          persona: res.persona,
          welcomeMessage: res.welcomeMessage,
          systemPrompt: res.systemPrompt,
          notes: res.notes,
        });
        setStep(3);
      } catch {
        toast("Falha ao gerar. Tente um modelo.");
      } finally {
        setBusy(false);
      }
      return;
    }

    const t = AGENT_TEMPLATES.find((x) => x.id === template)!;
    const id = addAgent({
      ...t.draft,
      name: t.title,
      status: "draft",
      connectionId,
    });
    setAgentId(id);
    setDraft({
      name: t.title,
      persona: t.draft.persona,
      welcomeMessage: t.draft.welcomeMessage,
      systemPrompt: t.draft.systemPrompt,
      notes: t.draft.knowledge.notes,
    });
    setStep(3);
  }

  function persistDraft() {
    if (!agentId) return;
    updateAgent(agentId, {
      name: draft.name || "Novo agente",
      persona: draft.persona,
      welcomeMessage: draft.welcomeMessage,
      systemPrompt: draft.systemPrompt,
      knowledge: {
        faqs: agent?.knowledge.faqs ?? [],
        notes: draft.notes,
      },
      connectionId,
    });
  }

  return (
    <AppShell
      title="Criar agente"
      action={
        <Button variant="ghost" asChild>
          <Link to="/agents">Sair</Link>
        </Button>
      }
    >
      <ol className="mb-8 grid grid-cols-4 gap-2">
        {STEPS.map((s) => (
          <li key={s.id} className="flex flex-col gap-1">
            <div
              className={cn(
                "h-1 rounded-full",
                step >= s.id ? "bg-accent" : "bg-elevated",
              )}
            />
            <span className={cn("text-xs", step === s.id ? "text-fg" : "text-subtle")}>
              {s.label}
            </span>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section className="max-w-2xl">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Escolha o canal</h2>
          <p className="mt-2 text-sm text-muted">
            O WhatsApp só vira API com um middleware. Evolution lê QR; Meta é a via oficial.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            {connections.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setConnectionId(c.id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-4 py-3 text-left",
                  connectionId === c.id ? "border-accent bg-elevated" : "border-border bg-surface",
                )}
              >
                <StatusDot status={c.status} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-muted">
                    {PROVIDER_LABEL[c.provider]} · {PROVIDER_HINT[c.provider]}
                  </div>
                </div>
                <Badge tone={c.status === "connected" ? "live" : "warn"}>{c.status}</Badge>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setConnectionId(null)}
              className={cn(
                "rounded-xl border px-4 py-3 text-left text-sm",
                connectionId === null ? "border-accent bg-elevated" : "border-border bg-surface text-muted",
              )}
            >
              Continuar sem canal — ligo depois
            </button>
          </div>
          <div className="mt-4">
            <CreateConnectionDialog
              triggerLabel="Nova conexão"
              onCreated={(id) => setConnectionId(id)}
            />
          </div>
          <div className="mt-6 flex justify-end">
            <Button onClick={() => setStep(2)}>Continuar</Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="max-w-2xl">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Como o agente nasce</h2>
          <p className="mt-2 text-sm text-muted">
            Descreva o resultado esperado ou comece de um modelo pronto. O Nexo prepara persona,
            regras, saudação e conhecimento inicial para revisão.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-1 rounded-md bg-bg p-1">
            <button
              type="button"
              className={cn("h-9 rounded-sm text-sm", source === "brief" ? "bg-elevated text-fg" : "text-muted")}
              onClick={() => setSource("brief")}
            >
              Descrição do agente
            </button>
            <button
              type="button"
              className={cn("h-9 rounded-sm text-sm", source === "template" ? "bg-elevated text-fg" : "text-muted")}
              onClick={() => setSource("template")}
            >
              Modelo
            </button>
          </div>

          {source === "brief" ? (
            <div className="mt-4 flex flex-col gap-3">
              <Label htmlFor="wiz-brief">Briefing</Label>
              <Textarea
                id="wiz-brief"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Negócio, tom, o que o bot pode e não pode responder."
              />
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_BRIEFS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setBrief(s)}
                    className="rounded-full border border-border bg-surface px-2.5 py-1 text-left text-xs text-muted hover:text-fg"
                  >
                    {s.slice(0, 36)}…
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 grid gap-2">
              {AGENT_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplate(t.id)}
                  className={cn(
                    "rounded-lg border px-3 py-3 text-left",
                    template === t.id ? "border-accent bg-elevated" : "border-border bg-surface",
                  )}
                >
                  <div className="text-sm font-medium">{t.title}</div>
                  <div className="mt-0.5 text-xs text-muted">{t.blurb}</div>
                </button>
              ))}
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Voltar
            </Button>
            <Button onClick={() => void goReview()} disabled={busy}>
              <Sparkles className="size-4" />
              {busy ? "Gerando…" : source === "brief" ? "Gerar e revisar" : "Revisar modelo"}
            </Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Revisão</h2>
            <p className="mt-2 mb-4 text-sm text-muted">
              Isto já é um agente salvo como rascunho. Ajuste o tom antes de testar.
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-name">Nome</Label>
                <Input
                  id="d-name"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-persona">Persona</Label>
                <Textarea
                  id="d-persona"
                  className="min-h-20"
                  value={draft.persona}
                  onChange={(e) => setDraft({ ...draft, persona: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-welcome">Saudação</Label>
                <Textarea
                  id="d-welcome"
                  className="min-h-20"
                  value={draft.welcomeMessage}
                  onChange={(e) => setDraft({ ...draft, welcomeMessage: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-prompt">Prompt</Label>
                <Textarea
                  id="d-prompt"
                  className="min-h-40"
                  value={draft.systemPrompt}
                  onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Voltar
              </Button>
              <Button
                onClick={() => {
                  persistDraft();
                  setStep(4);
                }}
              >
                Testar no telefone
              </Button>
            </div>
          </div>
          <Card className="h-fit p-4">
            <div className="font-display text-sm font-semibold">Configuração inicial</div>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Persona, saudação, regras de WhatsApp e FAQs. No próximo passo você manda uma
              mensagem real — horário, handoff e base já entram no fluxo.
            </p>
            {agent && agent.knowledge.faqs.length > 0 && (
              <ul className="mt-4 flex flex-col gap-2">
                {agent.knowledge.faqs.map((f) => (
                  <li key={f.id} className="rounded-md border border-border bg-bg px-3 py-2">
                    <div className="text-xs font-medium">{f.q}</div>
                    <div className="mt-0.5 text-xs text-muted">{f.a}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      )}

      {step === 4 && agent && (
        <section className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <PhonePreview
            agent={{ ...agent, ...draft, name: draft.name || agent.name }}
            messages={chat.messages}
            busy={chat.busy}
            onSend={(t, k) => {
              persistDraft();
              void chat.send(t, k);
            }}
            onClear={chat.clear}
          />
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Prova de tom</h2>
            <p className="mt-2 text-sm text-muted">
              Mande uma dúvida da base, peça um humano, simule um áudio. Se o texto estiver
              curto e no caráter certo, publique.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {(agent.knowledge.faqs.slice(0, 3).map((f) => f.q).concat("Quero falar com um humano")).map(
                (q) => (
                  <button
                    key={q}
                    type="button"
                    className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted hover:text-fg"
                    onClick={() => {
                      persistDraft();
                      void chat.send(q);
                    }}
                  >
                    {q}
                  </button>
                ),
              )}
            </div>
            <div className="mt-8 flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  persistDraft();
                  void navigate({
                    to: "/agents/$id",
                    params: { id: agent.id },
                    search: { tab: "publish" },
                  });
                }}
              >
                Publicar no Nexo Cloud
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  persistDraft();
                  void navigate({
                    to: "/agents/$id",
                    params: { id: agent.id },
                    search: { tab: "create" },
                  });
                }}
              >
                Ajustar configuração
              </Button>
            </div>
          </div>
        </section>
      )}
    </AppShell>
  );
}
