import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import type { ReactNode } from "react";
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

type PublishPanelMode = "publication" | "versions";
type Version = { id: string; versionNumber: number; status: "draft" | "published" | "retired"; publishedAt: string | null };
type ReadinessTone = "neutral" | "live" | "warn" | "danger";

export function PublishPanel({ agent, mode = "publication" }: { agent: Agent; mode?: PublishPanelMode }) {
  const connections = useNexo((s) => s.connections);
  const updateAgent = useNexo((s) => s.updateAgent);
  const updateConnection = useNexo((s) => s.updateConnection);
  const log = useNexo((s) => s.log);
  const workspaceId = useNexo((s) => s.workspaceId);
  const backendReady = useNexo((s) => s.backendReady);
  const { refresh } = useWorkspaceData();
  const [versions, setVersions] = useState<Version[]>([]);
  const connection = connections.find((c) => c.id === agent.connectionId);
  const hook = connection ? webhookUrl(connection) : "Crie uma conexão antes de publicar";
  const showPublication = mode === "publication";
  const channelReady = connection?.status === "connected";
  const testConfigured = Boolean(agent.developmentBlueprint?.testScenarios.some((scenario) => scenario.trim()));
  const handoffConfigured = agent.tools.handoff && Boolean(agent.tools.handoffKeywords.trim());
  const canPublish = channelReady && testConfigured;

  useEffect(() => {
    if (!backendReady || !workspaceId) return;
    void listWorkspaceAgentVersions({ data: { workspaceId, agentId: agent.id } }).then(setVersions).catch(() => setVersions([]));
  }, [agent.id, backendReady, workspaceId]);

  async function goLive() {
    if (!connection || !channelReady) { toast("Conecte um canal antes de publicar."); return; }
    if (!testConfigured) { toast("Adicione pelo menos um cenário de teste antes de publicar."); return; }
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

  return <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
    <div className="flex flex-col gap-4">
      {showPublication && <>
        <ReadinessCard title="Canal de operação" description="O agente precisa de um canal conectado para receber e responder eventos." state={channelReady ? "Pronto" : connection ? "Conexão pendente" : "Não configurado"} tone={channelReady ? "live" : "danger"} dependency="Conector validado e pareado" scope="Ingress · egress" risk="Alto" action={<Button size="sm" variant="secondary" asChild><Link to="/connections">{connection ? "Ver conexão" : "Configurar canal"}</Link></Button>} />
        <ReadinessCard title="Cenários de teste" description="Uma versão candidata precisa ter pelo menos um cenário definido para validação conversacional." state={testConfigured ? "Configurado" : "Configuração pendente"} tone={testConfigured ? "live" : "warn"} dependency="Blueprint com cenários" scope="Agent Runtime · validação" risk="Médio" action={<Button size="sm" variant="secondary" asChild><Link to="/agents/$id" params={{ id: agent.id }} search={{ tab: "tests" }}>{testConfigured ? "Revisar testes" : "Configurar testes"}</Link></Button>} />
        <ReadinessCard title="Handoff para humano" description="Um caminho de transferência reduz risco quando a conversa exige julgamento ou intervenção operacional." state={handoffConfigured ? "Configurado" : "Recomendado"} tone={handoffConfigured ? "live" : "warn"} dependency="Handoff habilitado + palavras-chave" scope="Conversa · transferência" risk="Alto" action={!handoffConfigured ? <Button size="sm" variant="secondary" asChild><Link to="/agents/$id" params={{ id: agent.id }} search={{ tab: "tools" }}>Configurar handoff</Link></Button> : undefined} />
        <ReadinessCard title="Versão candidata" description="As alterações atuais serão congeladas em uma versão persistida quando a publicação for concluída." state={agent.status === "live" ? "No ar" : "Pronta para revisão"} tone={agent.status === "live" ? "live" : "neutral"} dependency="Autosave do workspace" scope="Workspace · ambiente atual" risk="Médio" />
      </>}
      <Card className="flex flex-col gap-3 p-4"><div className="font-display text-sm font-semibold">Histórico de versões</div>{versions.length === 0 ? <p className="text-sm leading-relaxed text-muted">Nenhuma versão persistida foi encontrada neste workspace.</p> : <div className="flex flex-col gap-2">{versions.map((version) => <div key={version.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"><div><div className="text-sm">v{version.versionNumber}</div><div className="text-xs text-muted">{version.status === "published" ? "Publicada" : version.status === "retired" ? "Retirada" : "Rascunho"}</div></div>{version.status === "retired" && <Button size="sm" variant="secondary" onClick={() => void rollback(version.id)}>Fazer rollback</Button>}</div>)}</div>}</Card>
    </div>
    {showPublication ? <Card className="p-6"><div className="font-display text-sm font-semibold">Publicação controlada</div><p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">O Nexo verifica os requisitos do workspace antes de criar uma nova versão publicada.</p><div className="mt-5 rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs break-all text-muted">Webhook: {hook}</div><div className="mt-4 flex flex-wrap gap-2">{connection ? <Badge tone={channelReady ? "live" : "warn"}>{connection.name} · {PROVIDER_LABEL[connection.provider]}</Badge> : <Badge tone="danger">Sem conexão</Badge>}<Badge tone={agent.status === "live" ? "live" : "neutral"}>{agent.status === "live" ? "No ar" : "Rascunho"}</Badge></div><Button className="mt-5" onClick={() => void goLive()} variant="live" disabled={!canPublish}>Publicar versão</Button>{!canPublish && <p className="mt-3 text-xs text-warn">{!channelReady ? "Conecte um canal validado para continuar." : "Adicione um cenário de teste para continuar."}</p>}<div className="mt-8"><div className="font-display text-sm font-semibold">Escopo da operação</div><div className="mt-3 grid gap-2 sm:grid-cols-2"><Check label="Canal conectado" done={channelReady} /><Check label="Cenário de teste configurado" done={testConfigured} /><Check label="Handoff configurado" done={handoffConfigured} /><Check label="Histórico persistido" done={backendReady} /></div></div></Card> : <Card className="p-6"><div className="font-display text-sm font-semibold">Controle de versões</div><p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">Cada publicação cria uma versão persistida no workspace. Versões retiradas podem ser restauradas como uma nova publicação.</p><div className="mt-5 rounded-lg border border-border bg-bg p-4 text-sm"><div className="text-muted">Estado atual</div><div className="mt-1 font-medium">{agent.status === "live" ? "Versão publicada no ar" : "Rascunho em preparação"}</div></div></Card>}
  </div>;
}

function ReadinessCard({ title, description, state, tone, dependency, scope, risk, action }: { title: string; description: string; state: string; tone: ReadinessTone; dependency: string; scope: string; risk: string; action?: ReactNode }) {
  return <Card className="p-4"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><div className="font-display text-sm font-semibold">{title}</div><Badge tone={tone}>{state}</Badge></div><p className="mt-1 text-xs leading-relaxed text-muted">{description}</p></div>{action}</div><div className="mt-3 grid gap-2 border-t border-border pt-3 text-xs sm:grid-cols-3"><Meta label="Dependência" value={dependency} /><Meta label="Escopo" value={scope} /><Meta label="Risco" value={risk} /></div></Card>;
}

function Meta({ label, value }: { label: string; value: string }) { return <div><div className="text-[0.65rem] uppercase tracking-wide text-subtle">{label}</div><div className="mt-1 leading-relaxed text-muted">{value}</div></div>; }
function Check({ label, done = true }: { label: string; done?: boolean }) { return <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"><span className={`size-2 rounded-full ${done ? "bg-live" : "bg-warn"}`} /><span className={done ? "text-muted" : "text-fg"}>{label}</span></div>; }
