import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AgentEditor } from "@/components/agent-editor";
import { AgentTestPanel } from "@/components/agent-test-panel";
import { AppShell } from "@/components/app-shell";
import { FlowCanvas } from "@/components/flow-canvas";
import { PublishPanel } from "@/components/publish-panel";
import { Segmented } from "@/components/segmented";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/status-dot";
import { AGENT_STATUS_LABEL } from "@/lib/labels";
import { useAgentChat } from "@/lib/use-agent-chat";
import { useNexo } from "@/lib/store";
import { PROVIDER_LABEL } from "@/lib/types";
import { useState } from "react";
import type { FlowNodeId } from "@/lib/types";

type Tab = "create" | "test" | "publish";
type Search = { tab?: Tab };

export const Route = createFileRoute("/agents/$id")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const tab = s.tab;
    if (tab === "create" || tab === "test" || tab === "publish") return { tab };
    return { tab: "create" };
  },
  component: AgentStudioPage,
});

function AgentStudioPage() {
  const { id } = Route.useParams();
  const { tab = "create" } = Route.useSearch();
  const navigate = useNavigate();
  const agent = useNexo((s) => s.agents.find((a) => a.id === id));
  const connections = useNexo((s) => s.connections);
  const duplicateAgent = useNexo((s) => s.duplicateAgent);
  const removeAgent = useNexo((s) => s.removeAgent);
  const updateAgent = useNexo((s) => s.updateAgent);
  const { messages, busy, send, clear } = useAgentChat(id);
  const [focusNode, setFocusNode] = useState<FlowNodeId>("agent");

  if (!agent) {
    return (
      <AppShell title="Agente">
        <p className="text-sm text-muted">Esse agente não está no workspace.</p>
        <Button className="mt-4" asChild>
          <Link to="/agents">Voltar</Link>
        </Button>
      </AppShell>
    );
  }

  const connection = connections.find((c) => c.id === agent.connectionId);

  function setTab(next: Tab) {
    void navigate({
      to: "/agents/$id",
      params: { id },
      search: { tab: next },
      replace: true,
    });
  }

  return (
    <AppShell
      title={agent.name}
      action={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const nid = duplicateAgent(agent.id);
              if (nid) {
                toast("Cópia criada");
                void navigate({ to: "/agents/$id", params: { id: nid }, search: { tab: "create" } });
              }
            }}
          >
            <Copy className="size-3.5" />
            <span className="hidden sm:inline">Duplicar</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-danger hover:text-danger"
            onClick={() => {
              removeAgent(agent.id);
              toast("Agente removido");
              void navigate({ to: "/agents" });
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
          {agent.status !== "live" ? (
            <Button
              size="sm"
              variant="live"
              onClick={() => {
                updateAgent(agent.id, { status: "live" });
                toast("Agente no ar");
              }}
            >
              Publicar
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                updateAgent(agent.id, { status: "paused" });
                toast("Agente pausado");
              }}
            >
              Pausar
            </Button>
          )}
        </div>
      }
    >
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <StatusDot status={agent.status} />
        <Badge tone={agent.status === "live" ? "live" : "neutral"}>
          {AGENT_STATUS_LABEL[agent.status]}
        </Badge>
        <Badge>{connection ? `${connection.name} · ${PROVIDER_LABEL[connection.provider]}` : "Sem canal"}</Badge>
        <span className="text-xs text-muted">{agent.knowledge.faqs.length} FAQs</span>
      </div>

      <div className="mb-6 max-w-lg">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { id: "create", label: "Criar" },
            { id: "test", label: "Testar" },
            { id: "publish", label: "Publicar" },
          ]}
        />
      </div>

      {tab === "create" && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <AgentEditor agent={agent} focusNode={focusNode} />
          <div className="xl:sticky xl:top-20 h-fit">
            <p className="mb-3 text-xs tracking-wide text-subtle uppercase">Pipeline</p>
            <div className="xl:max-w-full overflow-x-auto">
              <FlowCanvas agent={agent} selected={focusNode} onSelect={setFocusNode} />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Clique num nó para lembrar o papel dele. As mudanças no formulário já entram no
              próximo teste — não existe botão salvar.
            </p>
            <Button className="mt-4 w-full" onClick={() => setTab("test")}>
              Testar no telefone
            </Button>
          </div>
        </div>
      )}

      {tab === "test" && (
        <AgentTestPanel
          agent={agent}
          messages={messages}
          busy={busy}
          onSend={(t, k) => void send(t, k)}
          onClear={clear}
        />
      )}

      {tab === "publish" && <PublishPanel agent={agent} />}
    </AppShell>
  );
}
