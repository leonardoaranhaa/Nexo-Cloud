import { createFileRoute, Link } from "@tanstack/react-router";
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

export const Route = createFileRoute("/agents/")({ component: AgentsPage });

function AgentsPage() {
  const agents = useNexo((s) => s.agents);
  const connections = useNexo((s) => s.connections);
  const duplicateAgent = useNexo((s) => s.duplicateAgent);
  const removeAgent = useNexo((s) => s.removeAgent);

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
        Cada agente é um briefing + prompt + base + canal. O Grok cria o rascunho; o telefone
        prova o tom; n8n ou Python publicam.
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
                      const id = duplicateAgent(a.id);
                      if (id) toast("Cópia criada");
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
                      removeAgent(a.id);
                      toast("Agente removido");
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
