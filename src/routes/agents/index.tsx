import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Copy, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CreateAgentDialog } from "@/components/create-agent-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusDot } from "@/components/status-dot";
import { AGENT_STATUS_LABEL, TEMPLATE_LABEL } from "@/lib/labels";
import { useNexo } from "@/lib/store";
import { PROVIDER_LABEL } from "@/lib/types";
import { formatRelative } from "@/lib/utils";
import { toast } from "sonner";
import { archiveWorkspaceAgent, createWorkspaceAgent } from "@/lib/multitenancy/api";
import { useWorkspaceData } from "@/lib/multitenancy/use-workspace-data";

export const Route = createFileRoute("/agents/")({ component: AgentsPage });

function AgentsPage() {
  const agents = useNexo((s) => s.agents);
  const connections = useNexo((s) => s.connections);
  const duplicateAgent = useNexo((s) => s.duplicateAgent);
  const removeAgent = useNexo((s) => s.removeAgent);
  const workspaceId = useNexo((s) => s.workspaceId);
  const backendReady = useNexo((s) => s.backendReady);
  const { refresh } = useWorkspaceData();
  const navigate = useNavigate();

  return (
    <AppShell
      title="Agentes"
      action={
        <div className="flex gap-2">
          <Button variant="secondary" asChild>
            <Link to="/create">Assistente</Link>
          </Button>
          <CreateAgentDialog />
        </div>
      }
    >
      <p className="mb-6 max-w-2xl text-sm leading-relaxed text-muted">
        Cada agente combina objetivo, instruções, conhecimento, ferramentas e canais. Revise o
        comportamento, teste a conversa e publique uma versão controlada.
      </p>

      {agents.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted">Nenhum agente ainda.</p>
          <div className="mt-4 flex justify-center">
            <CreateAgentDialog triggerLabel="Criar o primeiro" />
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {agents.map((a) => {
            const conn = connections.find((c) => c.id === a.connectionId);
            return (
              <Card key={a.id} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    to="/agents/$id"
                    params={{ id: a.id }}
                    search={{ tab: "create" }}
                    className="min-w-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-display font-semibold tracking-tight">{a.name}</span>
                      <StatusDot status={a.status} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{a.persona || a.welcomeMessage}</p>
                  </Link>
                  <Badge tone={a.status === "live" ? "live" : a.status === "paused" ? "warn" : "neutral"}>
                    {AGENT_STATUS_LABEL[a.status]}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-muted">
                  <Badge>{TEMPLATE_LABEL[a.template] ?? a.template}</Badge>
                  <Badge>
                    {conn ? `${conn.name} · ${PROVIDER_LABEL[conn.provider]}` : "Sem canal"}
                  </Badge>
                  <span className="self-center">{a.knowledge.faqs.length} FAQs</span>
                  <span className="self-center">atualizado {formatRelative(a.updatedAt)}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" asChild>
                    <Link to="/agents/$id" params={{ id: a.id }} search={{ tab: "test" }}>
                      Testar
                    </Link>
                  </Button>
                  <Button size="sm" variant="secondary" asChild>
                    <Link to="/agents/$id" params={{ id: a.id }} search={{ tab: "create" }}>
                      Editar
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void (async () => {
                        if (backendReady && workspaceId) {
                          const created = await createWorkspaceAgent({
                            data: {
                              workspaceId,
                              name: `${a.name} (cópia)`,
                              persona: a.persona,
                              welcomeMessage: a.welcomeMessage,
                              systemPrompt: a.systemPrompt,
                              agentType: a.template,
                            },
                          });
                          await refresh(workspaceId);
                          toast("Cópia criada");
                          void navigate({ to: "/agents/$id", params: { id: created.id }, search: { tab: "create" } });
                          return;
                        }
                        const id = duplicateAgent(a.id);
                        if (id) toast("Cópia criada");
                      })().catch(() => toast("Não foi possível duplicar o agente."));
                    }}
                  >
                    <Copy className="size-3.5" />
                    Duplicar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger hover:text-danger"
                    onClick={() => {
                      void (async () => {
                        if (backendReady) {
                          await archiveWorkspaceAgent({ data: { id: a.id } });
                          await refresh(workspaceId ?? undefined);
                        }
                        removeAgent(a.id);
                        toast("Agente removido");
                      })().catch(() => toast("Não foi possível remover o agente."));
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
