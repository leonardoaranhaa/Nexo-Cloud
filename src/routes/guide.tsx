import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ArchitectureStrip } from "@/components/architecture-strip";
import { CodeBlock } from "@/components/code-block";
import { Segmented } from "@/components/segmented";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { n8nExport, pythonExport } from "@/lib/codegen";
import { useNexo } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/guide")({ component: GuidePage });

function GuidePage() {
  const agents = useNexo((s) => s.agents);
  const connections = useNexo((s) => s.connections);
  const [track, setTrack] = useState<"n8n" | "python">("n8n");
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [done, setDone] = useState<Record<string, boolean>>({});

  const agent = agents.find((a) => a.id === agentId) ?? agents[0];
  const connection = connections.find((c) => c.id === agent?.connectionId);

  const code = useMemo(() => {
    if (!agent) return "";
    return track === "n8n" ? n8nExport(agent, connection) : pythonExport(agent, connection);
  }, [agent, connection, track]);

  const steps = track === "n8n" ? N8N : PYTHON;

  function toggle(id: string) {
    setDone((s) => ({ ...s, [id]: !s[id] }));
  }

  return (
    <AppShell title="Caminhos">
      <section className="max-w-3xl">
        <h2 className="font-display text-3xl font-semibold tracking-tight">Do estúdio ao WhatsApp</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted md:text-base">
          Três partes: a API do WhatsApp, o motor de IA e a camada que liga os dois. O Nexo
          cria o agente e testa o tom; estes caminhos publicam o mesmo fluxo.
        </p>
      </section>

      <section className="mt-8">
        <ArchitectureStrip />
      </section>

      <section className="mt-10 grid gap-3 md:grid-cols-2">
        <Card className="p-4">
          <Badge tone="live">Oficial</Badge>
          <h3 className="mt-3 font-display text-lg font-semibold">Meta Cloud API</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Sem risco de banimento do número, paga por conversa, exige verificação da empresa
            na Meta. Melhor para operação séria.
          </p>
        </Card>
        <Card className="p-4">
          <Badge tone="warn">QR / Baileys</Badge>
          <h3 className="mt-3 font-display text-lg font-semibold">Evolution e Z-API</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Barato e rápido de parear. Evite disparo em massa. Ideal para validar o agente
            antes de migrar para a Cloud API.
          </p>
        </Card>
      </section>

      <section className="mt-10 max-w-xl">
        <Segmented
          value={track}
          onChange={setTrack}
          options={[
            { id: "n8n", label: "No-code · n8n + Evolution" },
            { id: "python", label: "Código · Python + Meta" },
          ]}
        />
      </section>

      <section className="mt-6 flex flex-wrap items-center gap-3">
        <label className="text-xs text-muted" htmlFor="guide-agent">
          Agente exportado
        </label>
        <select
          id="guide-agent"
          value={agent?.id ?? ""}
          onChange={(e) => setAgentId(e.target.value)}
          className="h-10 rounded-md border border-border bg-bg px-3 text-sm text-fg focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none"
        >
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <ol className="flex flex-col gap-2">
          {steps.map((s, i) => {
            const key = `${track}-${s.id}`;
            const on = !!done[key];
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className={cn(
                    "flex w-full gap-3 rounded-xl border px-3 py-3 text-left",
                    on ? "border-live/40 bg-live/10" : "border-border bg-surface",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                      on ? "border-live bg-live text-live-fg" : "border-border text-subtle",
                    )}
                  >
                    {on ? <Check className="size-3" /> : <span className="font-mono text-[0.65rem]">{i + 1}</span>}
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{s.title}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted">{s.body}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="flex min-w-0 flex-col gap-3">
          <CodeBlock
            code={code}
            filename={track === "n8n" ? `${fileSlug(agent?.name)}.n8n.json` : `${fileSlug(agent?.name)}.py`}
          />
          <Card className="p-4">
            <h3 className="font-display text-sm font-semibold">Cuidados de mensagem</h3>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm text-muted">
              <li>Limite o tamanho: 1 a 4 frases. WhatsApp pune bloco de markdown.</li>
              <li>Áudio entra transcrito (Whisper / Gemini / o próprio Grok). O playground já simula isso.</li>
              <li>Memória por telefone — nunca misture conversas no mesmo buffer.</li>
              <li>Handoff e horário devem rodar antes do modelo, como no canvas.</li>
            </ul>
          </Card>
        </div>
      </section>
    </AppShell>
  );
}

function fileSlug(name?: string) {
  return (
    name
      ?.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "agente"
  );
}

const N8N = [
  {
    id: "evo",
    title: "Subir a Evolution API",
    body: "Instância local ou na nuvem. Abra o manager, crie a instância com o mesmo nome da conexão Nexo e escaneie o QR — o painel de conexões simula essa leitura.",
  },
  {
    id: "webhook",
    title: "Webhook no n8n",
    body: "Nó Webhook POST. A Evolution dispara messages.upsert. Extraia phone e text com o nó Set do JSON exportado.",
  },
  {
    id: "model",
    title: "Motor Grok",
    body: "Nó OpenAI-compatible apontando para api.x.ai, modelo grok-4.5. Cole o system prompt gerado no estúdio.",
  },
  {
    id: "memory",
    title: "Memória Window Buffer",
    body: "sessionKey = telefone. contextWindowLength igual à janela do agente. Sem isso o bot esquece o tamanho que o cliente pediu.",
  },
  {
    id: "send",
    title: "HTTP Request de volta",
    body: "POST /message/sendText/{instance} com number e text. Header apikey da Evolution. No Meta, Graph /{phone-number-id}/messages.",
  },
  {
    id: "test",
    title: "Provar no número real",
    body: "Mande a mesma pergunta que você usou no telefone do Nexo. Se o tom divergir, volte ao prompt — não ao n8n.",
  },
];

const PYTHON = [
  {
    id: "meta",
    title: "App na Meta",
    body: "WhatsApp Cloud API, verificação da empresa, Phone number ID e token permanente. VERIFY_TOKEN = nexo-verify no Flask.",
  },
  {
    id: "env",
    title: "Variáveis",
    body: "XAI_API_KEY, WHATSAPP_TOKEN, PHONE_NUMBER_ID. PROVIDER=meta. O script já lê Evolution se você trocar o provedor.",
  },
  {
    id: "webhook",
    title: "Flask /webhook",
    body: "GET resolve o desafio da Meta. POST extrai from + text. O parser também aceita o envelope da Evolution.",
  },
  {
    id: "memory",
    title: "deque por telefone",
    body: "defaultdict(deque) com maxlen da janela. Cada número tem o próprio histórico — requisito para atendimento real.",
  },
  {
    id: "guards",
    title: "Horário e handoff",
    body: "Rodam antes do Grok. Palavras-chave e expediente são os mesmos do estúdio, compilados no script.",
  },
  {
    id: "send",
    title: "Graph API",
    body: "POST graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages com messaging_product=whatsapp. Suba com um túnel HTTPS público.",
  },
];
