import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import type { Agent } from "@/lib/types";
import { PROVIDER_LABEL } from "@/lib/types";
import { n8nExport, pythonExport } from "@/lib/codegen";
import { useNexo } from "@/lib/store";
import { webhookUrl } from "@/lib/webhooks";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { CodeBlock } from "./code-block";
import { Segmented } from "./segmented";
import { useState } from "react";

export function PublishPanel({ agent }: { agent: Agent }) {
  const connections = useNexo((s) => s.connections);
  const updateAgent = useNexo((s) => s.updateAgent);
  const updateConnection = useNexo((s) => s.updateConnection);
  const log = useNexo((s) => s.log);
  const connection = connections.find((c) => c.id === agent.connectionId);
  const [track, setTrack] = useState<"n8n" | "python">(
    connection?.provider === "meta" ? "python" : "n8n",
  );

  const py = pythonExport(agent, connection);
  const n8n = n8nExport(agent, connection);
  const hook = connection ? webhookUrl(connection) : "crie uma conexão primeiro";

  function goLive() {
    if (!connection) {
      toast("Ligue um canal antes de publicar.");
      return;
    }
    if (connection.status !== "connected") {
      toast("Pareie o QR ou confirme o Phone number ID.");
      return;
    }
    updateAgent(agent.id, { status: "live" });
    updateConnection(connection.id, { lastEventAt: Date.now() });
    log("publish", `${agent.name} publicado em ${connection.name}`);
    toast("Agente no ar no canal de teste.");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3 p-4">
          <div className="font-display text-sm font-semibold">Publicar</div>
          <p className="text-sm leading-relaxed text-muted">
            O playground já cria e testa. Publicar gera o fluxo real: n8n (no-code) ou Flask
            (Python) com memória por telefone.
          </p>
          <div className="flex flex-wrap gap-2">
            {connection ? (
              <Badge tone={connection.status === "connected" ? "live" : "warn"}>
                {connection.name} · {PROVIDER_LABEL[connection.provider]}
              </Badge>
            ) : (
              <Badge tone="warn">Sem conexão</Badge>
            )}
            <Badge tone={agent.status === "live" ? "live" : "neutral"}>
              {agent.status === "live" ? "No ar" : "Rascunho"}
            </Badge>
          </div>
          <div className="rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs break-all text-muted">
            {hook}
          </div>
          <Button onClick={goLive} variant="live">
            Marcar como no ar
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/guide">Ver passo a passo</Link>
          </Button>
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <div className="font-display text-sm font-semibold">Oficial vs. não oficial</div>
          <p className="text-sm leading-relaxed text-muted">
            <span className="text-fg">Meta Cloud API</span> — segura, por conversa, exige
            verificação da empresa. <span className="text-fg">Evolution / Z-API</span> — QR
            rápido, custo baixo, risco de bloqueio se disparar em massa.
          </p>
          <p className="text-sm leading-relaxed text-muted">
            Respostas curtas. Áudios entram transcritos. Não invente estoque nem preço.
          </p>
        </Card>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <Segmented
          value={track}
          onChange={setTrack}
          options={[
            { id: "n8n", label: "n8n + Evolution" },
            { id: "python", label: "Python + Meta" },
          ]}
        />
        {track === "n8n" ? (
          <div className="flex flex-col gap-3">
            <ol className="flex flex-col gap-2 text-sm text-muted">
              {N8N_STEPS.map((s, i) => (
                <li key={s} className="flex gap-3 rounded-lg border border-border bg-surface px-3 py-2">
                  <span className="font-mono text-xs text-subtle">{String(i + 1).padStart(2, "0")}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            <CodeBlock code={n8n} filename={`${slug(agent.name)}.n8n.json`} />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <ol className="flex flex-col gap-2 text-sm text-muted">
              {PY_STEPS.map((s, i) => (
                <li key={s} className="flex gap-3 rounded-lg border border-border bg-surface px-3 py-2">
                  <span className="font-mono text-xs text-subtle">{String(i + 1).padStart(2, "0")}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            <CodeBlock code={py} filename={`${slug(agent.name)}.py`} />
          </div>
        )}
      </div>
    </div>
  );
}

function slug(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "agente";
}

const N8N_STEPS = [
  "Suba a Evolution API e escaneie o QR da conexão.",
  "Importe o JSON abaixo em um workflow novo.",
  "Aponte o modelo OpenAI-compatible para api.x.ai, modelo grok-4.5.",
  "Ligue a memória Window Buffer na chave do telefone.",
  "No HTTP Request, use sendText da instância Evolution.",
  "Cole o webhook da Evolution no nó inicial e dispare uma mensagem de teste.",
];

const PY_STEPS = [
  "Crie o app WhatsApp na Meta e verifique a empresa.",
  "Guarde PHONE_NUMBER_ID, WHATSAPP_TOKEN e XAI_API_KEY.",
  "Suba o Flask abaixo com /webhook GET (verify) e POST.",
  "A memória é um deque por telefone — não misture conversas.",
  "Horário e handoff rodam antes do Grok.",
  "Aponte o webhook da Meta para o seu domínio público.",
];
