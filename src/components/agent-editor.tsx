import type { ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Agent, FlowNodeId } from "@/lib/types";
import { PROVIDER_LABEL } from "@/lib/types";
import { LANGUAGE_LABEL } from "@/lib/labels";
import { useNexo } from "@/lib/store";
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
}: {
  agent: Agent;
  focusNode?: FlowNodeId;
}) {
  const connections = useNexo((s) => s.connections);
  const updateAgent = useNexo((s) => s.updateAgent);

  function patch(p: Partial<Agent>) {
    updateAgent(agent.id, p);
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4 p-4">
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
              onChange={(e) => patch({ connectionId: e.target.value || null })}
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
      </Card>

      <Card className="flex flex-col gap-4 p-4" data-node="agent">
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
      </Card>

      <Card className="flex flex-col gap-4 p-4" data-node="knowledge">
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
      </Card>

      <Card className="flex flex-col gap-4 p-4" data-node="hours">
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
      </Card>
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
