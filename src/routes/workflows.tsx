import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { GitBranch, Play, Plus, RefreshCw, Rocket } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createWorkspaceWorkflow, listWorkspaceWorkflowRuns, listWorkspaceWorkflows, publishWorkspaceWorkflow, runWorkspaceWorkflow } from "@/lib/multitenancy/api";
import { useNexo } from "@/lib/store";

export const Route = createFileRoute("/workflows")({ component: WorkflowsPage });

type Workflow = Awaited<ReturnType<typeof listWorkspaceWorkflows>>[number];
type WorkflowRun = Awaited<ReturnType<typeof listWorkspaceWorkflowRuns>>[number];

function WorkflowsPage() {
  const workspaceId = useNexo((s) => s.workspaceId);
  const backendReady = useNexo((s) => s.backendReady);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = workflows.find((workflow) => workflow.id === selectedId) ?? workflows[0] ?? null;

  const load = useCallback(async () => {
    if (!backendReady || !workspaceId) return;
    try {
      const next = await listWorkspaceWorkflows({ data: { workspaceId } });
      setWorkflows(next);
      const nextRuns = await listWorkspaceWorkflowRuns({ data: { workspaceId, workflowId: selectedId ?? next[0]?.id } });
      setRuns(nextRuns);
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? null);
    } catch {
      toast("Não foi possível carregar os workflows.");
    }
  }, [backendReady, selectedId, workspaceId]);

  useEffect(() => { void load(); }, [load]);

  async function create() {
    if (!workspaceId || !name.trim()) return;
    try {
      const workflow = await createWorkspaceWorkflow({ data: { workspaceId, name: name.trim() } });
      setName("");
      setSelectedId(workflow.id);
      toast("Workflow criado como rascunho.");
      await load();
    } catch { toast("Não foi possível criar o workflow."); }
  }

  async function publish() {
    if (!workspaceId || !selected) return;
    try { await publishWorkspaceWorkflow({ data: { workspaceId, workflowId: selected.id } }); toast("Versão publicada."); await load(); }
    catch { toast("Publique uma definição válida antes de executar."); }
  }

  async function run() {
    if (!workspaceId || !selected) return;
    try { await runWorkspaceWorkflow({ data: { workspaceId, workflowId: selected.id, input: { source: "manual" } } }); toast("Run criado e processado."); await load(); }
    catch { toast("O workflow precisa ter uma versão publicada."); }
  }

  if (!backendReady) return <AppShell title="Workflows"><Card className="p-6 text-sm text-muted">O backend persistente ainda está carregando.</Card></AppShell>;

  return (
    <AppShell title="Workflows">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><p className="font-display text-lg font-semibold">Automação orientada por agentes</p><p className="text-sm text-muted">Crie versões publicadas e acompanhe runs manuais.</p></div>
        <Button size="sm" variant="secondary" onClick={() => void load}><RefreshCw className="size-3.5" /> Atualizar</Button>
      </div>
      <div className="mb-5 flex max-w-xl gap-2"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do novo workflow" onKeyDown={(event) => { if (event.key === "Enter") void create(); }} /><Button onClick={() => void create()}><Plus className="size-4" /> Criar</Button></div>
      <div className="grid gap-4 lg:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)]">
        <Card className="p-2"><div className="space-y-1">{workflows.map((workflow) => <button key={workflow.id} type="button" onClick={() => setSelectedId(workflow.id)} className={`w-full rounded-md p-3 text-left ${selected?.id === workflow.id ? "bg-elevated" : "hover:bg-elevated/60"}`}><div className="flex items-center gap-2"><GitBranch className="size-4 text-muted" /><span className="font-medium">{workflow.name}</span></div><div className="mt-1 text-xs text-muted">{workflow.status} · {workflow.versionNumber ? `v${workflow.versionNumber}` : "sem publicação"}</div></button>)}{workflows.length === 0 && <p className="p-3 text-sm text-muted">Nenhum workflow criado.</p>}</div></Card>
        <div className="space-y-4">
          <Card className="p-5">{selected ? <><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-display font-semibold">{selected.name}</p><p className="text-sm text-muted">{selected.description || "Sem descrição"}</p></div><div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => void publish()}><Rocket className="size-3.5" /> Publicar</Button><Button size="sm" onClick={() => void run()} disabled={!selected.versionId}><Play className="size-3.5" /> Executar</Button></div></div><div className="mt-5 rounded-md border border-dashed border-border p-4 text-sm text-muted">Editor visual e nós de agente/ferramenta serão conectados na próxima fatia. A execução manual atual valida o control plane e registra condições, espera e aprovação.</div></> : <p className="text-sm text-muted">Selecione ou crie um workflow.</p>}</Card>
          <Card className="p-5"><div className="mb-3 flex items-center justify-between"><p className="font-display font-semibold">Histórico de runs</p><Badge tone="neutral">{runs.length}</Badge></div><div className="space-y-2">{runs.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-elevated p-3 text-xs"><span>{item.status}</span><span className="text-muted">{new Date(item.createdAt).toLocaleString("pt-BR")}</span>{item.errorCode && <span className="text-danger">{item.errorCode}</span>}</div>)}{runs.length === 0 && <p className="text-sm text-muted">Nenhum run registrado.</p>}</div></Card>
        </div>
      </div>
    </AppShell>
  );
}
