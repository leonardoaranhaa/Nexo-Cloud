import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import type { Agent } from "@/lib/types";
import { PROVIDER_LABEL } from "@/lib/types";
import { useNexo } from "@/lib/store";
import { webhookUrl } from "@/lib/webhooks";
import { listWorkspaceAgentVersions, publishWorkspaceAgent, rollbackWorkspaceAgent } from "@/lib/multitenancy/api";
import { useWorkspaceData } from "@/lib/multitenancy/use-workspace-data";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { useEffect, useState } from "react";

export function PublishPanel({ agent }: { agent: Agent }) {
  const connections = useNexo((s) => s.connections);
  const updateAgent = useNexo((s) => s.updateAgent);
  const updateConnection = useNexo((s) => s.updateConnection);
  const log = useNexo((s) => s.log);
  const workspaceId = useNexo((s) => s.workspaceId);
  const backendReady = useNexo((s) => s.backendReady);
  const { refresh } = useWorkspaceData();
  const [versions, setVersions] = useState<Array<{ id: string; versionNumber: number; status: "draft" | "published" | "retired"; publishedAt: string | null }>>([]);
  const connection = connections.find((c) => c.id === agent.connectionId);
  const hook = connection ? webhookUrl(connection) : "Crie uma conexão antes de publicar";

  useEffect(() => {
    if (!backendReady || !workspaceId) return;
    void listWorkspaceAgentVersions({ data: { workspaceId, agentId: agent.id } }).then(setVersions).catch(() => setVersions([]));
  }, [agent.id, backendReady, workspaceId]);

  async function goLive() {
    if (!connection) { toast("Ligue um canal antes de publicar."); return; }
    if (connection.status !== "connected") { toast("Conecte o canal antes de publicar."); return; }
    try {
      if (backendReady && workspaceId) { await publishWorkspaceAgent({ data: { workspaceId, agentId: agent.id } }); await refresh(workspaceId); }
      else updateAgent(agent.id, { status: "live" });
      updateConnection(connection.id, { lastEventAt: Date.now() });
      log("publish", `${agent.name} publicado em ${connection.name}`);
      toast("Agente publicado com versão persistida.");
      if (backendReady && workspaceId) setVersions(await listWorkspaceAgentVersions({ data: { workspaceId, agentId: agent.id } }));
    } catch { toast("Não foi possível publicar a versão do agente."); }
  }

  async function rollback(versionId: string) {
    if (!backendReady || !workspaceId) return;
    try { await rollbackWorkspaceAgent({ data: { workspaceId, agentId: agent.id, versionId } }); await refresh(workspaceId); setVersions(await listWorkspaceAgentVersions({ data: { workspaceId, agentId: agent.id } })); toast("Rollback publicado como uma nova versão."); }
    catch { toast("Não foi possível fazer rollback dessa versão."); }
  }

  return <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]"><div className="flex flex-col gap-4"><Card className="flex flex-col gap-3 p-4"><div className="font-display text-sm font-semibold">Publicação controlada</div><p className="text-sm leading-relaxed text-muted">Publique uma versão revisada do agente no canal conectado. O Nexo mantém o histórico, o status e a possibilidade de rollback.</p><div className="flex flex-wrap gap-2">{connection ? <Badge tone={connection.status === "connected" ? "live" : "warn"}>{connection.name} · {PROVIDER_LABEL[connection.provider]}</Badge> : <Badge tone="warn">Sem conexão</Badge>}<Badge tone={agent.status === "live" ? "live" : "neutral"}>{agent.status === "live" ? "No ar" : "Rascunho"}</Badge></div><div className="rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs break-all text-muted">Webhook: {hook}</div><Button onClick={goLive} variant="live">Publicar versão</Button><Button variant="secondary" asChild><Link to="/guide">Ver orientação operacional</Link></Button></Card><Card className="flex flex-col gap-3 p-4"><div className="font-display text-sm font-semibold">Regras de operação</div><p className="text-sm leading-relaxed text-muted">O runtime aplica horário, conhecimento, handoff, ferramentas e políticas do workspace antes de responder.</p><p className="text-sm leading-relaxed text-muted">Use o Inbox para acompanhar conversas e Execuções para investigar cada turno.</p></Card>{backendReady && versions.length > 0 && <Card className="flex flex-col gap-3 p-4"><div className="font-display text-sm font-semibold">Histórico de versões</div><div className="flex flex-col gap-2">{versions.map((version) => <div key={version.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"><div><div className="text-sm">v{version.versionNumber}</div><div className="text-xs text-muted">{version.status === "published" ? "Publicada" : version.status === "retired" ? "Retirada" : "Rascunho"}</div></div>{version.status === "retired" && <Button size="sm" variant="secondary" onClick={() => void rollback(version.id)}>Fazer rollback</Button>}</div>)}</div></Card>}</div><Card className="p-6"><div className="flex size-10 items-center justify-center rounded-xl bg-accent/10 text-accent"><span className="font-display text-lg">✓</span></div><h2 className="mt-5 font-display text-2xl font-semibold">Pronto para operar?</h2><p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">Antes de publicar, confirme que o agente tem um objetivo claro, conhecimento suficiente, canal conectado e um caminho de handoff para situações que exigem uma pessoa.</p><div className="mt-6 grid gap-2 sm:grid-cols-2"><Check label="Objetivo e persona revisados" /><Check label="Canal conectado" done={Boolean(connection?.status === "connected")} /><Check label="Teste conversacional concluído" /><Check label="Handoff configurado" done={agent.tools.handoff} /></div></Card></div>;
}

function Check({ label, done = true }: { label: string; done?: boolean }) { return <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"><span className={`size-2 rounded-full ${done ? "bg-live" : "bg-warn"}`} /><span className={done ? "text-muted" : "text-fg"}>{label}</span></div>; }
