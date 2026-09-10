import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { GitBranch, Play, Plus, RefreshCw, Rocket, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createWorkspaceWorkflow, getWorkspaceWorkflowDefinition, listWorkspaceWorkflowRuns, listWorkspaceWorkflows, publishWorkspaceWorkflow, runWorkspaceWorkflow, saveWorkspaceWorkflowDefinition } from "@/lib/multitenancy/api";
import type { WorkflowNode } from "@/lib/workflows/server";
import { useNexo } from "@/lib/store";

export const Route = createFileRoute("/workflows")({ component: WorkflowsPage });

type Workflow = Awaited<ReturnType<typeof listWorkspaceWorkflows>>[number];
type WorkflowRun = Awaited<ReturnType<typeof listWorkspaceWorkflowRuns>>[number];
type Definition = { nodes: WorkflowNode[]; edges: { from: string; to: string; condition?: string }[] };
const emptyDefinition: Definition = { nodes: [], edges: [] };

function WorkflowsPage() {
  const workspaceId = useNexo((s) => s.workspaceId);
  const backendReady = useNexo((s) => s.backendReady);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [definition, setDefinition] = useState<Definition>(emptyDefinition);
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingDefinition, setLoadingDefinition] = useState(false);
  const selected = workflows.find((workflow) => workflow.id === selectedId) ?? workflows[0] ?? null;

  const load = useCallback(async () => {
    if (!backendReady || !workspaceId) return;
    try {
      const next = await listWorkspaceWorkflows({ data: { workspaceId } });
      setWorkflows(next);
      const activeId = selectedId ?? next[0]?.id;
      if (activeId) setRuns(await listWorkspaceWorkflowRuns({ data: { workspaceId, workflowId: activeId } }));
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? null);
    } catch { toast("Não foi possível carregar os workflows."); }
  }, [backendReady, selectedId, workspaceId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!workspaceId || !selected?.id) return;
    setLoadingDefinition(true);
    void getWorkspaceWorkflowDefinition({ data: { workspaceId, workflowId: selected.id } }).then(setDefinition).catch(() => setDefinition(emptyDefinition)).finally(() => setLoadingDefinition(false));
  }, [selected?.id, workspaceId]);

  async function create() {
    if (!workspaceId || !name.trim()) return;
    try { const workflow = await createWorkspaceWorkflow({ data: { workspaceId, name: name.trim() } }); setName(""); setSelectedId(workflow.id); toast("Workflow criado como rascunho."); await load(); }
    catch { toast("Não foi possível criar o workflow."); }
  }
  async function save() {
    if (!workspaceId || !selected) return;
    try { await saveWorkspaceWorkflowDefinition({ data: { workspaceId, workflowId: selected.id, definition } }); toast("Definição salva."); }
    catch { toast("Não foi possível salvar a definição."); }
  }
  async function publish() {
    if (!workspaceId || !selected) return;
    try { await save(); await publishWorkspaceWorkflow({ data: { workspaceId, workflowId: selected.id } }); toast("Versão publicada."); await load(); }
    catch { toast("Não foi possível publicar a versão."); }
  }
  async function run() {
    if (!workspaceId || !selected) return;
    try { await runWorkspaceWorkflow({ data: { workspaceId, workflowId: selected.id, input: { source: "manual" } } }); toast("Run criado e processado."); await load(); }
    catch { toast("O workflow precisa ter uma versão publicada."); }
  }
  function addNode(type: WorkflowNode["type"]) {
    const id = `${type}-${Date.now().toString(36)}`;
    setDefinition((current) => ({ ...current, nodes: [...current.nodes, { id, type, name: type === "condition" ? "Condição" : type === "approval" ? "Aprovação humana" : type === "wait" ? "Espera" : type === "agent" ? "Agente" : "Ferramenta", config: {} }] }));
  }
  function removeNode(id: string) {
    setDefinition((current) => ({ nodes: current.nodes.filter((node) => node.id !== id), edges: current.edges.filter((edge) => edge.from !== id && edge.to !== id) }));
  }
  function connectLast() {
    setDefinition((current) => current.nodes.length < 2 ? current : ({ ...current, edges: [...current.edges, { from: current.nodes[current.nodes.length - 2].id, to: current.nodes[current.nodes.length - 1].id }] }));
  }

  if (!backendReady) return <AppShell title="Workflows"><Card className="p-6 text-sm text-muted">O backend persistente ainda está carregando.</Card></AppShell>;
  return <AppShell title="Workflows">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="font-display text-lg font-semibold">Automação orientada por agentes</p><p className="text-sm text-muted">Editor declarativo, versões publicadas e histórico de runs.</p></div><Button size="sm" variant="secondary" onClick={() => void load}><RefreshCw className="size-3.5" /> Atualizar</Button></div>
    <div className="mb-5 flex max-w-xl gap-2"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do novo workflow" onKeyDown={(event) => { if (event.key === "Enter") void create(); }} /><Button onClick={() => void create()}><Plus className="size-4" /> Criar</Button></div>
    <div className="grid gap-4 lg:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)]">
      <Card className="p-2"><div className="space-y-1">{workflows.map((workflow) => <button key={workflow.id} type="button" onClick={() => setSelectedId(workflow.id)} className={`w-full rounded-md p-3 text-left ${selected?.id === workflow.id ? "bg-elevated" : "hover:bg-elevated/60"}`}><div className="flex items-center gap-2"><GitBranch className="size-4 text-muted" /><span className="font-medium">{workflow.name}</span></div><div className="mt-1 text-xs text-muted">{workflow.status} · {workflow.versionNumber ? `v${workflow.versionNumber}` : "sem publicação"}</div></button>)}{workflows.length === 0 && <p className="p-3 text-sm text-muted">Nenhum workflow criado.</p>}</div></Card>
      <div className="space-y-4"><Card className="p-5">{selected ? <><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-display font-semibold">{selected.name}</p><p className="text-sm text-muted">{definition.nodes.length} nós · {definition.edges.length} conexões · {selected.status}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => void save()}><Save className="size-3.5" /> Salvar</Button><Button size="sm" variant="secondary" onClick={() => void publish()}><Rocket className="size-3.5" /> Publicar</Button><Button size="sm" onClick={() => void run()} disabled={!selected.versionId}><Play className="size-3.5" /> Executar</Button></div></div>
        <div className="mt-5 flex flex-wrap gap-2"><span className="mr-1 self-center text-xs text-muted">Adicionar:</span>{(["condition", "agent", "tool", "wait", "approval"] as WorkflowNode["type"][]).map((type) => <Button key={type} size="sm" variant="ghost" onClick={() => addNode(type)}>+ {type}</Button>)}<Button size="sm" variant="ghost" onClick={connectLast} disabled={definition.nodes.length < 2}>Conectar últimos</Button></div>
        <div className="mt-4 space-y-2">{loadingDefinition ? <p className="text-sm text-muted">Carregando definição...</p> : definition.nodes.map((node, index) => <div key={node.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-elevated/40 p-3"><span className="w-6 text-xs text-muted">{index + 1}</span><Input className="max-w-xs" value={node.name ?? ""} onChange={(event) => setDefinition((current) => ({ ...current, nodes: current.nodes.map((item) => item.id === node.id ? { ...item, name: event.target.value } : item) }))} /><Badge tone={node.type === "tool" ? "warn" : node.type === "agent" ? "live" : "neutral"}>{node.type}</Badge><span className="text-xs text-muted">{definition.edges.filter((edge) => edge.from === node.id || edge.to === node.id).length} conexões</span><Button size="icon" variant="ghost" className="ml-auto" onClick={() => removeNode(node.id)}><Trash2 className="size-3.5" /></Button></div>)}{definition.nodes.length === 0 && <div className="rounded-md border border-dashed border-border p-5 text-sm text-muted">Comece adicionando um nó. A definição é salva como JSON versionado no backend.</div>}</div>
      </> : <p className="text-sm text-muted">Selecione ou crie um workflow.</p>}</Card>
      <Card className="p-5"><div className="mb-3 flex items-center justify-between"><p className="font-display font-semibold">Histórico de runs</p><Badge tone="neutral">{runs.length}</Badge></div><div className="space-y-2">{runs.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-elevated p-3 text-xs"><span>{item.status}</span><span className="text-muted">{new Date(item.createdAt).toLocaleString("pt-BR")}</span>{item.errorCode && <span className="text-danger">{item.errorCode}</span>}</div>)}{runs.length === 0 && <p className="text-sm text-muted">Nenhum run registrado.</p>}</div></Card></div>
    </div>
  </AppShell>;
}
