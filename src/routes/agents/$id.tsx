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
import type { Agent, FlowNodeId } from "@/lib/types";
import { archiveWorkspaceAgent, updateWorkspaceAgent } from "@/lib/multitenancy/api";
import { uiAgentToPersisted } from "@/lib/multitenancy/adapter";
import { useWorkspaceData } from "@/lib/multitenancy/use-workspace-data";

type Tab = "configuration" | "knowledge" | "tools" | "tests" | "versions" | "publication" | "create" | "test" | "publish";
type Search = { tab?: Tab };

export const Route = createFileRoute("/agents/$id")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const tab = s.tab;
    if (tab === "create") return { tab: "configuration" };
    if (tab === "test") return { tab: "tests" };
    if (tab === "publish") return { tab: "publication" };
    if (tab === "configuration" || tab === "knowledge" || tab === "tools" || tab === "tests" || tab === "versions" || tab === "publication") return { tab };
    return { tab: "configuration" };
  },
  component: AgentStudioPage,
});

function AgentStudioPage() {
  const { id } = Route.useParams();
  const { tab = "configuration" } = Route.useSearch();
  const navigate = useNavigate();
  const agent = useNexo((s) => s.agents.find((a) => a.id === id));
  const connections = useNexo((s) => s.connections);
  const duplicateAgent = useNexo((s) => s.duplicateAgent);
  const removeAgent = useNexo((s) => s.removeAgent);
  const updateAgent = useNexo((s) => s.updateAgent);
  const workspaceId = useNexo((s) => s.workspaceId);
  const backendReady = useNexo((s) => s.backendReady);
  const { refresh } = useWorkspaceData();
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

  async function persistAgent(next: Agent) {
    if (!backendReady || !workspaceId) return;
    await updateWorkspaceAgent({ data: { id: next.id, workspaceId, ...uiAgentToPersisted(next) } });
  }

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
                void navigate({ to: "/agents/$id", params: { id: nid }, search: { tab: "configuration" } });
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
              void (async () => {
                if (backendReady) {
                  await archiveWorkspaceAgent({ data: { id: agent.id } });
                  await refresh(workspaceId ?? undefined);
                }
                removeAgent(agent.id);
                toast("Agente removido");
                void navigate({ to: "/agents" });
              })().catch(() => toast("Não foi possível remover o agente."));
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
          {agent.status !== "live" ? (
            <Button
              size="sm"
              variant="live"
              onClick={() => setTab("publication")}
            >
              Revisar publicação
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const next = { ...agent, status: "paused" as const, updatedAt: Date.now() };
                updateAgent(agent.id, { status: "paused" });
                void persistAgent(next).then(() => toast("Agente pausado")).catch(() => toast("Falha ao pausar."));
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

      <div className="mb-6 overflow-x-auto pb-1">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { id: "configuration", label: "Configuração" },
            { id: "knowledge", label: "Conhecimento" },
            { id: "tools", label: "Ferramentas" },
            { id: "tests", label: "Testes" },
            { id: "versions", label: "Versões" },
            { id: "publication", label: "Publicação" },
          ]}
        />
      </div>

      {tab === "configuration" && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <AgentEditor
            agent={agent}
            section="configuration"
            focusNode={focusNode}
            onRunScenario={(scenario) => {
              setTab("tests");
              void send(scenario);
              toast("Cenário enviado para o Agent Runtime");
            }}
          />
          <div className="xl:sticky xl:top-20 h-fit">
            <p className="mb-3 text-xs tracking-wide text-subtle uppercase">Pipeline</p>
            <div className="xl:max-w-full overflow-x-auto">
              <FlowCanvas agent={agent} selected={focusNode} onSelect={setFocusNode} />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Clique num nó para lembrar o papel dele. As mudanças no formulário já entram no
              próximo teste — não existe botão salvar.
            </p>
            <Button className="mt-4 w-full" onClick={() => setTab("tests")}>
              Abrir testes
            </Button>
          </div>
        </div>
      )}

      {tab === "knowledge" && <AgentEditor agent={agent} section="knowledge" focusNode={focusNode} />}
      {tab === "tools" && <AgentEditor agent={agent} section="tools" focusNode={focusNode} />}
      {tab === "tests" && <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"><AgentEditor agent={agent} section="tests" onRunScenario={(scenario) => { void send(scenario); toast("Cenário enviado para o Agent Runtime"); }} /><AgentTestPanel agent={agent} messages={messages} busy={busy} onSend={(t, k) => void send(t, k)} onClear={clear} /></div>}
      {tab === "versions" && <PublishPanel agent={agent} mode="versions" />}
      {tab === "publication" && <PublishPanel agent={agent} mode="publication" />}
    </AppShell>
  );
}
