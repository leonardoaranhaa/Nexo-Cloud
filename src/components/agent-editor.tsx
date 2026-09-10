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
import { Textarea } from "./ui/textarea";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";
import { Card } from "./ui/card";

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

  function patchBlueprint(field: keyof typeof blueprint, values: string[]) {
    patch({ developmentBlueprint: { ...blueprint, [field]: values } });
  }

  const show = (target: typeof section) => section === "all" || section === target;

  return (
    <div className="flex flex-col gap-5">
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

      {show("knowledge") && <Card className="flex flex-col gap-4 p-4" data-node="knowledge">
        <div className="flex items-center justify-between">
          <div className="font-display text-sm font-semibold">Base de conhecimento</div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              patch({
                knowledge: {
                  ...agent.knowledge,
                  faqs: [...agent.knowledge.faqs, { id: createId("faq"), q: "", a: "" }],
                },
              })
            }
          >
            <Plus className="size-3.5" />
            FAQ
          </Button>
        </div>
        <Field label="Notas internas" htmlFor="ed-notes">
          <Textarea
            id="ed-notes"
            className="min-h-20"
            value={agent.knowledge.notes}
            onChange={(e) =>
              patch({ knowledge: { ...agent.knowledge, notes: e.target.value } })
            }
          />
        </Field>
        <div className="flex flex-col gap-3">
          {agent.knowledge.faqs.length === 0 && (
            <p className="text-sm text-muted">Nenhum FAQ. Adicione pares pergunta/resposta.</p>
          )}
          {agent.knowledge.faqs.map((faq, i) => (
            <div key={faq.id} className="rounded-lg border border-border bg-bg p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs text-subtle">{String(i + 1).padStart(2, "0")}</span>
                <button
                  type="button"
                  className="rounded-md p-1 text-subtle hover:bg-elevated hover:text-fg"
                  aria-label="Remover FAQ"
                  onClick={() =>
                    patch({
                      knowledge: {
                        ...agent.knowledge,
                        faqs: agent.knowledge.faqs.filter((f) => f.id !== faq.id),
                      },
                    })
                  }
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <Input
                value={faq.q}
                placeholder="Pergunta"
                className="mb-2"
                onChange={(e) => {
                  const faqs = agent.knowledge.faqs.map((f) =>
                    f.id === faq.id ? { ...f, q: e.target.value } : f,
                  );
                  patch({ knowledge: { ...agent.knowledge, faqs } });
                }}
              />
              <Textarea
                value={faq.a}
                placeholder="Resposta"
                className="min-h-16"
                onChange={(e) => {
                  const faqs = agent.knowledge.faqs.map((f) =>
                    f.id === faq.id ? { ...f, a: e.target.value } : f,
                  );
                  patch({ knowledge: { ...agent.knowledge, faqs } });
                }}
              />
            </div>
          ))}
        </div>
      </Card>}

      {show("tools") && <Card className="flex flex-col gap-4 p-4" data-node="hours">
        <div className="font-display text-sm font-semibold">Ferramentas</div>
        <ToggleRow
          label="Horário de atendimento"
          hint="Fora do expediente o bot avisa e não chama a IA."
          checked={agent.tools.hoursEnabled}
          onCheckedChange={(v) => patch({ tools: { ...agent.tools, hoursEnabled: v } })}
        />
        {agent.tools.hoursEnabled && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Início" htmlFor="ed-hs">
              <Input
                id="ed-hs"
                type="time"
                value={agent.tools.hoursStart}
                onChange={(e) => patch({ tools: { ...agent.tools, hoursStart: e.target.value } })}
              />
            </Field>
            <Field label="Fim" htmlFor="ed-he">
              <Input
                id="ed-he"
                type="time"
                value={agent.tools.hoursEnd}
                onChange={(e) => patch({ tools: { ...agent.tools, hoursEnd: e.target.value } })}
              />
            </Field>
          </div>
        )}
        <ToggleRow
          label="Handoff para humano"
          hint="Palavras-chave desviam a conversa do modelo."
          checked={agent.tools.handoff}
          onCheckedChange={(v) => patch({ tools: { ...agent.tools, handoff: v } })}
        />
        {agent.tools.handoff && (
          <Field label="Palavras-chave" htmlFor="ed-kw">
            <Input
              id="ed-kw"
              value={agent.tools.handoffKeywords}
              onChange={(e) => patch({ tools: { ...agent.tools, handoffKeywords: e.target.value } })}
            />
          </Field>
        )}
        <ToggleRow
          label="Catálogo"
          hint="O agente pode citar itens da base como se fossem oferta."
          checked={agent.tools.catalog}
          onCheckedChange={(v) => patch({ tools: { ...agent.tools, catalog: v } })}
        />
        <ToggleRow
          label="Áudio transcrito"
          hint="Mensagens de voz entram como texto entre parênteses."
          checked={agent.tools.audio}
          onCheckedChange={(v) => patch({ tools: { ...agent.tools, audio: v } })}
        />
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
