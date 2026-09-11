import { useEffect, type ReactNode } from "react";
import { Play, Plus, Trash2 } from "lucide-react";
import type { Agent, FlowNodeId } from "@/lib/types";
import { PROVIDER_LABEL } from "@/lib/types";
import { LANGUAGE_LABEL } from "@/lib/labels";
import { useNexo } from "@/lib/store";
import { updateWorkspaceAgent, upsertWorkspaceAgentDevelopmentBlueprint } from "@/lib/multitenancy/api";
import { bindWorkspaceAgentConnection } from "@/lib/multitenancy/api";
import { uiAgentToPersisted } from "@/lib/multitenancy/adapter";
import { createId } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Textarea } from "./ui/textarea";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";
import { Card } from "./ui/card";
import { guidanceForWorkspaceGoal, type WorkspaceGoal } from "@/lib/workspace-goal";

export function AgentEditor({
  agent,
  focusNode,
  onRunScenario,
  section = "all",
}: {
  agent: Agent;
  focusNode?: FlowNodeId;
  onRunScenario?: (scenario: string) => void;
  section?: "all" | "configuration" | "knowledge" | "tools" | "tests";
}) {
  const connections = useNexo((s) => s.connections);
  const updateAgent = useNexo((s) => s.updateAgent);
  const workspaceId = useNexo((s) => s.workspaceId);
  const backendReady = useNexo((s) => s.backendReady);
  const workspaceGoal = useNexo((s) => s.workspaces.find((workspace) => workspace.id === s.workspaceId)?.onboardingGoal ?? null);
  const workspaceGuidance = guidanceForWorkspaceGoal(workspaceGoal as WorkspaceGoal);

  useEffect(() => {
    if (!backendReady || !workspaceId) return;
    const timer = window.setTimeout(() => {
      void Promise.all([
        updateWorkspaceAgent({ data: { id: agent.id, workspaceId, ...uiAgentToPersisted(agent) } }),
        agent.developmentBlueprint
          ? upsertWorkspaceAgentDevelopmentBlueprint({
              data: {
                workspaceId,
                agentId: agent.id,
                agentType: agent.template,
                objectives: agent.developmentBlueprint.objectives,
                capabilities: agent.developmentBlueprint.capabilities,
                guardrails: agent.developmentBlueprint.guardrails,
                testScenarios: agent.developmentBlueprint.testScenarios,
              },
            })
          : Promise.resolve(),
      ]).catch((error) => console.error("[agent] autosave failed", error));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [agent, backendReady, workspaceId]);

  function patch(p: Partial<Agent>) {
    updateAgent(agent.id, p);
  }

  const blueprint = agent.developmentBlueprint ?? {
    objectives: [],
    capabilities: [],
    guardrails: [],
    testScenarios: [],
  };
  const activeConnection = connections.find((connection) => connection.id === agent.connectionId);
  const completeFaqs = agent.knowledge.faqs.filter((faq) => faq.q.trim() && faq.a.trim()).length;

  function patchBlueprint(field: keyof typeof blueprint, values: string[]) {
    patch({ developmentBlueprint: { ...blueprint, [field]: values } });
  }

  const show = (target: typeof section) => section === "all" || section === target;

  return (
    <div className="flex flex-col gap-5">
      {show("configuration") && workspaceGuidance && <Card className="border-accent/30 bg-elevated/40 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">Direção do workspace</div><div className="mt-1 font-display text-sm font-semibold">{workspaceGuidance.title}</div><p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">{workspaceGuidance.description}</p></div><span className="rounded-full border border-accent/30 px-2 py-1 text-[10px] font-semibold text-accent">Sugestões contextuais</span></div><div className="mt-3 flex flex-wrap gap-2">{workspaceGuidance.nextSteps.map((nextStep) => <span key={nextStep} className="rounded-full border border-border bg-bg px-2.5 py-1 text-xs text-muted">{nextStep}</span>)}</div></Card>}
      {show("configuration") && <Card className="flex flex-col gap-4 p-4">
        <div className="font-display text-sm font-semibold">Identidade</div>
        <Field label="Nome" htmlFor="ed-name">
          <Input
            id="ed-name"
            value={agent.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </Field>
        <Field label="Persona" htmlFor="ed-persona">
          <Textarea
            id="ed-persona"
            className="min-h-20"
            value={agent.persona}
            onChange={(e) => patch({ persona: e.target.value })}
          />
        </Field>
        <Field label="Saudação" htmlFor="ed-welcome">
          <Textarea
            id="ed-welcome"
            className="min-h-20"
            value={agent.welcomeMessage}
            onChange={(e) => patch({ welcomeMessage: e.target.value })}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Canal" htmlFor="ed-conn">
            <select
              id="ed-conn"
              value={agent.connectionId ?? ""}
              onChange={(e) => {
                const connectionId = e.target.value || null;
                patch({ connectionId });
                if (backendReady && workspaceId) {
                  void bindWorkspaceAgentConnection({
                    data: { agentId: agent.id, workspaceId, connectionId },
                  }).catch((error) => console.error("[agent] connection binding failed", error));
                }
              }}
              className="flex h-10 w-full rounded-md border border-border bg-bg px-3 text-sm text-fg focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none"
            >
              <option value="">Sem conexão</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {PROVIDER_LABEL[c.provider]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Idioma" htmlFor="ed-lang">
            <select
              id="ed-lang"
              value={agent.language}
              onChange={(e) => patch({ language: e.target.value as Agent["language"] })}
              className="flex h-10 w-full rounded-md border border-border bg-bg px-3 text-sm text-fg focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none"
            >
              {Object.entries(LANGUAGE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>}

      {show("configuration") && <Card className="flex flex-col gap-5 p-4" data-node="blueprint">
        <div>
          <div className="font-display text-sm font-semibold">Blueprint operacional</div>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Defina o resultado esperado, o que o agente pode fazer e os limites que devem ser respeitados.
            As alterações são salvas no workspace automaticamente.
          </p>
        </div>
        <BlueprintListEditor
          title="Objetivos"
          hint="Resultados que o agente deve perseguir."
          values={blueprint.objectives}
          placeholder="Ex.: qualificar o lead antes de encaminhar"
          onChange={(values) => patchBlueprint("objectives", values)}
        />
        <BlueprintListEditor
          title="Capacidades"
          hint="Ações e comportamentos permitidos ao agente."
          values={blueprint.capabilities}
          placeholder="Ex.: consultar FAQ publicada"
          onChange={(values) => patchBlueprint("capabilities", values)}
        />
        <BlueprintListEditor
          title="Guardrails"
          hint="Limites, condições de segurança e situações de handoff."
          values={blueprint.guardrails}
          placeholder="Ex.: não inventar preço ou disponibilidade"
          onChange={(values) => patchBlueprint("guardrails", values)}
        />
      </Card>}

      {show("configuration") && <Card className="flex flex-col gap-4 p-4" data-node="agent">
        <div className="font-display text-sm font-semibold">
          Prompt de sistema{focusNode === "agent" ? " · nó ativo" : ""}
        </div>
        <Textarea
          id="ed-prompt"
          className="min-h-44"
          value={agent.systemPrompt}
          onChange={(e) => patch({ systemPrompt: e.target.value })}
        />
        <div className="grid gap-4">
          <SliderRow
            label="Temperatura"
            value={agent.temperature}
            display={agent.temperature.toFixed(1)}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => patch({ temperature: v })}
          />
          <SliderRow
            label="Máximo de tokens"
            value={agent.maxTokens}
            display={String(agent.maxTokens)}
            min={80}
            max={400}
            step={10}
            onChange={(v) => patch({ maxTokens: Math.round(v) })}
          />
          <SliderRow
            label="Janela de memória"
            value={agent.memoryWindow}
            display={`${agent.memoryWindow} turnos`}
            min={4}
            max={24}
            step={1}
            onChange={(v) => patch({ memoryWindow: Math.round(v) })}
          />
        </div>
      </Card>}

      {show("knowledge") && <div className="flex flex-col gap-4" data-node="knowledge">
        <div><div className="font-display text-lg font-semibold">Fontes de conhecimento</div><p className="mt-1 text-sm leading-relaxed text-muted">Cada fonte possui disponibilidade e escopo próprios. O runtime só usa conteúdo configurado e aprovado neste agente.</p></div>
        <ContextualToolCard title="Notas internas" description="Contexto operacional privado usado como referência pelo agente durante a resposta." enabled={Boolean(agent.knowledge.notes.trim())} state={agent.knowledge.notes.trim() ? "Ativo" : "Disponível"} stateTone={agent.knowledge.notes.trim() ? "live" : "neutral"} dependency="Nenhuma" scope="Runtime · contexto interno" risk="Baixo" onToggle={() => document.getElementById("ed-notes")?.focus()} actionLabel="Configurar">
          <Field label="Conteúdo da fonte" htmlFor="ed-notes"><Textarea id="ed-notes" className="min-h-24" value={agent.knowledge.notes} placeholder="Descreva contexto aprovado para este agente." onChange={(e) => patch({ knowledge: { ...agent.knowledge, notes: e.target.value } })} /></Field>
        </ContextualToolCard>
        <ContextualToolCard title="FAQ publicada" description="Pares de pergunta e resposta que o agente pode consultar em modo somente leitura." enabled={completeFaqs > 0} state={completeFaqs === agent.knowledge.faqs.length && completeFaqs > 0 ? "Ativo" : agent.knowledge.faqs.length > 0 ? "Configuração pendente" : "Disponível"} stateTone={completeFaqs === agent.knowledge.faqs.length && completeFaqs > 0 ? "live" : agent.knowledge.faqs.length > 0 ? "warn" : "neutral"} dependency="Pares pergunta/resposta completos" scope="Runtime · somente leitura" risk="Médio" onToggle={() => { if (agent.knowledge.faqs.length === 0) patch({ knowledge: { ...agent.knowledge, faqs: [{ id: createId("faq"), q: "", a: "" }] } }); }} actionLabel="Configurar">
          <div className="flex flex-col gap-3"><div className="flex items-center justify-between"><span className="text-xs text-muted">{completeFaqs} de {agent.knowledge.faqs.length} entradas completas</span><Button size="sm" variant="secondary" onClick={() => patch({ knowledge: { ...agent.knowledge, faqs: [...agent.knowledge.faqs, { id: createId("faq"), q: "", a: "" }] } })}><Plus className="size-3.5" />Adicionar FAQ</Button></div>{agent.knowledge.faqs.length === 0 && <p className="text-sm text-muted">Nenhuma entrada. Adicione a primeira pergunta e resposta.</p>}{agent.knowledge.faqs.map((faq, i) => <div key={faq.id} className="rounded-lg border border-border bg-bg p-3"><div className="mb-2 flex items-center justify-between"><span className="font-mono text-xs text-subtle">{String(i + 1).padStart(2, "0")}</span><button type="button" className="rounded-md p-1 text-subtle hover:bg-elevated hover:text-fg" aria-label="Remover FAQ" onClick={() => patch({ knowledge: { ...agent.knowledge, faqs: agent.knowledge.faqs.filter((f) => f.id !== faq.id) } })}><Trash2 className="size-3.5" /></button></div><Input value={faq.q} placeholder="Pergunta" className="mb-2" onChange={(e) => patch({ knowledge: { ...agent.knowledge, faqs: agent.knowledge.faqs.map((f) => f.id === faq.id ? { ...f, q: e.target.value } : f) } })} /><Textarea value={faq.a} placeholder="Resposta" className="min-h-16" onChange={(e) => patch({ knowledge: { ...agent.knowledge, faqs: agent.knowledge.faqs.map((f) => f.id === faq.id ? { ...f, a: e.target.value } : f) } })} /></div>)}</div>
        </ContextualToolCard>
      </div>}

      {show("tools") && <Card className="flex flex-col gap-5 p-4" data-node="hours">
        <div>
          <div className="font-display text-sm font-semibold">Capacidades do agente</div>
          <p className="mt-1 text-xs leading-relaxed text-muted">Cada capacidade possui escopo, dependências e risco próprios. Ative somente o que faz sentido para este agente e workspace.</p>
        </div>
        <div className="grid gap-3">
          <ContextualToolCard
            title="Horário de atendimento"
            description="Fora do expediente, o runtime informa o horário e não chama o modelo."
            enabled={agent.tools.hoursEnabled}
            state={agent.tools.hoursEnabled ? "Ativo" : "Disponível"}
            stateTone={agent.tools.hoursEnabled ? "live" : "neutral"}
            dependency="Nenhuma"
            scope="Runtime · pré-resposta"
            risk="Baixo"
            onToggle={() => patch({ tools: { ...agent.tools, hoursEnabled: !agent.tools.hoursEnabled } })}
          >
            {agent.tools.hoursEnabled && <div className="grid grid-cols-2 gap-3 border-t border-border pt-3"><Field label="Início" htmlFor="ed-hs"><Input id="ed-hs" type="time" value={agent.tools.hoursStart} onChange={(e) => patch({ tools: { ...agent.tools, hoursStart: e.target.value } })} /></Field><Field label="Fim" htmlFor="ed-he"><Input id="ed-he" type="time" value={agent.tools.hoursEnd} onChange={(e) => patch({ tools: { ...agent.tools, hoursEnd: e.target.value } })} /></Field></div>}
          </ContextualToolCard>
          <ContextualToolCard
            title="Handoff para humano"
            description="Desvia a conversa quando o cliente pede uma pessoa ou uma situação exige revisão."
            enabled={agent.tools.handoff}
            state={agent.tools.handoff && activeConnection?.status === "connected" && agent.tools.handoffKeywords.trim() ? "Ativo" : agent.tools.handoff ? "Configuração pendente" : "Disponível"}
            stateTone={agent.tools.handoff && activeConnection?.status === "connected" && agent.tools.handoffKeywords.trim() ? "live" : agent.tools.handoff ? "warn" : "neutral"}
            dependency="Canal conectado + palavras-chave"
            scope="Conversa · transferência"
            risk="Médio"
            onToggle={() => patch({ tools: { ...agent.tools, handoff: !agent.tools.handoff } })}
          >
            {agent.tools.handoff && <Field label="Palavras-chave" htmlFor="ed-kw"><Input id="ed-kw" value={agent.tools.handoffKeywords} onChange={(e) => patch({ tools: { ...agent.tools, handoffKeywords: e.target.value } })} /></Field>}
          </ContextualToolCard>
          <ContextualToolCard
            title="Catálogo"
            description="Permite citar itens aprovados da base de conhecimento sem inventar oferta."
            enabled={agent.tools.catalog}
            state={agent.tools.catalog && agent.knowledge.faqs.length > 0 ? "Ativo" : agent.tools.catalog ? "Base pendente" : "Disponível"}
            stateTone={agent.tools.catalog && agent.knowledge.faqs.length > 0 ? "live" : agent.tools.catalog ? "warn" : "neutral"}
            dependency="Base de conhecimento publicada"
            scope="Conhecimento · somente leitura"
            risk="Médio"
            onToggle={() => patch({ tools: { ...agent.tools, catalog: !agent.tools.catalog } })}
          />
          <ContextualToolCard
            title="Áudio transcrito"
            description="Converte mensagens de voz em texto antes de enviá-las ao runtime."
            enabled={agent.tools.audio}
            state={agent.tools.audio && activeConnection?.status === "connected" ? "Ativo" : agent.tools.audio ? "Canal pendente" : "Disponível"}
            stateTone={agent.tools.audio && activeConnection?.status === "connected" ? "live" : agent.tools.audio ? "warn" : "neutral"}
            dependency="Canal conectado com entrada de áudio"
            scope="Entrada · pré-runtime"
            risk="Médio"
            onToggle={() => patch({ tools: { ...agent.tools, audio: !agent.tools.audio } })}
          />
        </div>
      </Card>}

      {show("tests") && <Card className="flex flex-col gap-5 p-4" data-node="tests">
        <div>
          <div className="font-display text-sm font-semibold">Cenários de teste</div>
          <p className="mt-1 text-xs leading-relaxed text-muted">Defina conversas concretas para validar o comportamento antes da publicação.</p>
        </div>
        <BlueprintListEditor
          title="Cenários"
          hint="Exemplos que devem ser executados no Agent Runtime."
          values={blueprint.testScenarios}
          placeholder="Ex.: cliente pergunta preço e informa o orçamento"
          onChange={(values) => patchBlueprint("testScenarios", values)}
          onRun={onRunScenario}
        />
      </Card>}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function ContextualToolCard({
  title,
  description,
  enabled,
  state,
  stateTone,
  dependency,
  scope,
  risk,
  onToggle,
  actionLabel,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  state: string;
  stateTone: "neutral" | "live" | "warn";
  dependency: string;
  scope: string;
  risk: string;
  onToggle: () => void;
  actionLabel?: string;
  children?: ReactNode;
}) {
  return <div className="rounded-lg border border-border bg-bg p-4">
    <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><div className="text-sm font-medium">{title}</div><Badge tone={stateTone}>{state}</Badge></div><p className="mt-1 text-xs leading-relaxed text-muted">{description}</p></div>{actionLabel ? <Button size="sm" variant="secondary" onClick={onToggle}>{actionLabel}</Button> : <Switch checked={enabled} onCheckedChange={onToggle} aria-label={title} />}</div>
    <div className="mt-3 grid gap-2 border-t border-border pt-3 text-xs sm:grid-cols-3"><Meta label="Dependência" value={dependency} /><Meta label="Escopo" value={scope} /><Meta label="Risco" value={risk} /></div>
    {children && <div className="mt-3">{children}</div>}
  </div>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[0.65rem] uppercase tracking-wide text-subtle">{label}</div><div className="mt-1 leading-relaxed text-muted">{value}</div></div>;
}

function SliderRow({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="font-mono text-xs text-muted">{display}</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange(v[0] ?? value)}
      />
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <p className="mt-0.5 text-xs text-muted">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function BlueprintListEditor({
  title,
  hint,
  values,
  placeholder,
  onChange,
  onRun,
}: {
  title: string;
  hint: string;
  values: string[];
  placeholder: string;
  onChange: (values: string[]) => void;
  onRun?: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{title}</div>
          <p className="mt-0.5 text-xs text-muted">{hint}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onChange([...values, ""])}
        >
          <Plus className="size-3.5" />
          Adicionar
        </Button>
      </div>
      {values.length === 0 && <p className="text-xs text-subtle">Nenhum item definido.</p>}
      <div className="flex flex-col gap-2">
        {values.map((value, index) => (
          <div key={`${title}-${index}`} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-center font-mono text-xs text-subtle">
              {String(index + 1).padStart(2, "0")}
            </span>
            <Input
              value={value}
              placeholder={placeholder}
              aria-label={`${title} ${index + 1}`}
              onChange={(event) => {
                const next = [...values];
                next[index] = event.target.value;
                onChange(next);
              }}
            />
            {onRun && (
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={!value.trim()}
                aria-label={`Executar ${title.toLowerCase()} ${index + 1}`}
                onClick={() => onRun(value.trim())}
              >
                <Play className="size-3.5" />
              </Button>
            )}
            <button
              type="button"
              className="rounded-md p-2 text-subtle hover:bg-elevated hover:text-fg"
              aria-label={`Remover ${title.toLowerCase()} ${index + 1}`}
              onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
