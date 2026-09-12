import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, GitBranch, Link2, Play, Plus, RefreshCw, Rocket, Save, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createWorkspaceWorkflow, getWorkspaceWorkflowDefinition, listWorkspaceWorkflowNodeRuns, listWorkspaceWorkflowRuns, listWorkspaceWorkflows, publishWorkspaceWorkflow, replayWorkspaceWorkflowRun, runWorkspaceWorkflow, saveWorkspaceWorkflowDefinition } from "@/lib/multitenancy/api";
import { validateWorkflowDefinition, type WorkflowValidationIssue } from "@/lib/workflows/compiler";
import type { JsonObject } from "@/lib/multitenancy/server";
import type { WorkflowNode } from "@/lib/workflows/server";
import { useNexo } from "@/lib/store";

export const Route = createFileRoute("/workflows")({ component: WorkflowsPage });

type Workflow = Awaited<ReturnType<typeof listWorkspaceWorkflows>>[number];
type WorkflowRun = Awaited<ReturnType<typeof listWorkspaceWorkflowRuns>>[number];
type Definition = { nodes: WorkflowNode[]; edges: { from: string; to: string; condition?: string }[] };
const emptyDefinition: Definition = { nodes: [], edges: [] };
const nodeLabels: Record<WorkflowNode["type"], string> = { agent: "Agente", tool: "Ferramenta", condition: "Condição", wait: "Espera", approval: "Aprovação", transform: "Transformação" };

function WorkflowsPage() {
  const workspaceId = useNexo((s) => s.workspaceId);
  const backendReady = useNexo((s) => s.backendReady);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [nodeRuns, setNodeRuns] = useState<Awaited<ReturnType<typeof listWorkspaceWorkflowNodeRuns>>>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [definition, setDefinition] = useState<Definition>(emptyDefinition);
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingDefinition, setLoadingDefinition] = useState(false);
  const [running, setRunning] = useState(false);
  const selected = workflows.find((workflow) => workflow.id === selectedId) ?? workflows[0] ?? null;
  const issues = useMemo(() => validateWorkflowDefinition(definition), [definition]);
  const canPublish = Boolean(selected && issues.length === 0);

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
    if (issues.length > 0) { toast("Corrija os critérios de validação antes de publicar."); return; }
    try { await saveWorkspaceWorkflowDefinition({ data: { workspaceId, workflowId: selected.id, definition } }); await publishWorkspaceWorkflow({ data: { workspaceId, workflowId: selected.id } }); toast("Versão publicada."); await load(); }
    catch { toast("Não foi possível publicar a versão."); }
  }
  async function run() {
    if (!workspaceId || !selected) return;
    if (running) return;
    setRunning(true);
    try {
      await runWorkspaceWorkflow({ data: { workspaceId, workflowId: selected.id, input: { source: "manual" }, idempotencyKey: `manual-ui:${workspaceId}:${selected.id}:${Date.now()}` } });
      toast("Run criado e processado.");
      await load();
    } catch { toast("O workflow precisa ter uma versão publicada."); }
    finally { setRunning(false); }
  }
  async function inspectRun(runId: string) {
    if (!workspaceId) return;
    setSelectedRunId(runId);
    setNodeRuns(await listWorkspaceWorkflowNodeRuns({ data: { workspaceId, runId } }));
  }
  async function replay(runId: string) {
    if (!workspaceId) return;
    try { await replayWorkspaceWorkflowRun({ data: { workspaceId, runId } }); toast("Replay criado com a mesma versão do run original."); await load(); } catch { toast("Não foi possível reprocessar este run."); }
  }
  function addNode(type: WorkflowNode["type"]) {
    const id = `${type}-${Date.now().toString(36)}`;
    const defaults: JsonObject = type === "condition" ? { field: "source", equals: "manual" } : type === "transform" ? { mapping: { source: "$.source" } } : {};
    setDefinition((current) => ({ ...current, nodes: [...current.nodes, { id, type, name: nodeLabels[type], config: defaults }] }));
  }
  function updateNode(id: string, patch: Partial<WorkflowNode>) {
    setDefinition((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === id ? { ...node, ...patch } : node) }));
  }
  function updateConfig(id: string, key: string, value: string) {
    setDefinition((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === id ? { ...node, config: { ...(node.config ?? {}), [key]: value } } : node) }));
  }
  function removeNode(id: string) {
    setDefinition((current) => ({ nodes: current.nodes.filter((node) => node.id !== id), edges: current.edges.filter((edge) => edge.from !== id && edge.to !== id) }));
  }
  function connectLast() {
    setDefinition((current) => current.nodes.length < 2 ? current : ({ ...current, edges: [...current.edges, { from: current.nodes[current.nodes.length - 2].id, to: current.nodes[current.nodes.length - 1].id }] }));
  }
  function removeEdge(from: string, to: string) {
    setDefinition((current) => ({ ...current, edges: current.edges.filter((edge) => !(edge.from === from && edge.to === to)) }));
  }

  if (!backendReady) return <AppShell title="Workflows"><Card className="p-6 text-sm text-muted">O backend persistente ainda está carregando.</Card></AppShell>;
  return <AppShell title="Workflows">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="font-display text-lg font-semibold">Automação orientada por agentes</p><p className="text-sm text-muted">Construa fluxos como uma sequência de nós, valide o caminho e publique somente versões executáveis.</p></div><Button size="sm" variant="secondary" onClick={() => void load()}><RefreshCw className="size-3.5" /> Atualizar</Button></div>
    <div className="mb-5 flex max-w-xl gap-2"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do novo workflow" onKeyDown={(event) => { if (event.key === "Enter") void create(); }} /><Button onClick={() => void create()}><Plus className="size-4" /> Criar</Button></div>
    <div className="grid gap-4 lg:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)]">
      <Card className="p-2"><div className="space-y-1">{workflows.map((workflow) => <button key={workflow.id} type="button" onClick={() => setSelectedId(workflow.id)} className={`w-full rounded-md p-3 text-left ${selected?.id === workflow.id ? "bg-elevated" : "hover:bg-elevated/60"}`}><div className="flex items-center gap-2"><GitBranch className="size-4 text-muted" /><span className="font-medium">{workflow.name}</span></div><div className="mt-1 text-xs text-muted">{workflow.status} · {workflow.versionNumber ? `v${workflow.versionNumber}` : "sem publicação"}</div></button>)}{workflows.length === 0 && <p className="p-3 text-sm text-muted">Nenhum workflow criado.</p>}</div></Card>
      <div className="space-y-4"><Card className="p-5">{selected ? <><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-display font-semibold">{selected.name}</p><p className="text-sm text-muted">{definition.nodes.length} nós · {definition.edges.length} conexões · {selected.status}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => void save()} disabled={running}><Save className="size-3.5" /> Salvar</Button><Button size="sm" variant="secondary" onClick={() => void publish()} disabled={!canPublish || running} title={!canPublish ? "Corrija os critérios de validação" : undefined}><Rocket className="size-3.5" /> Publicar</Button><Button size="sm" onClick={() => void run()} disabled={!selected.versionId || running}><Play className="size-3.5" /> {running ? "Executando…" : "Executar"}</Button></div></div>
        <div className="mt-5 rounded-lg border border-border bg-bg p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Validação de publicação</p><p className="mt-1 text-xs text-muted">Padrão trigger → transformação/decisão → ação, com um único ponto de entrada e todos os nós conectados.</p></div><Badge tone={issues.length === 0 ? "live" : "danger"}>{issues.length === 0 ? "Pronto" : `${issues.length} pendência(s)`}</Badge></div>{issues.length > 0 && <div className="mt-3 space-y-2">{issues.slice(0, 6).map((issue) => <ValidationIssue key={`${issue.code}-${issue.nodeId ?? "workflow"}`} issue={issue} />)}</div>}</div>
        <div className="mt-4 flex flex-wrap gap-2"><span className="mr-1 self-center text-xs text-muted">Adicionar nó:</span>{(["condition", "transform", "agent", "tool", "wait", "approval"] as WorkflowNode["type"][]).map((type) => <Button key={type} size="sm" variant="ghost" onClick={() => addNode(type)}>+ {nodeLabels[type]}</Button>)}<Button size="sm" variant="ghost" onClick={connectLast} disabled={definition.nodes.length < 2}><Link2 className="size-3.5" /> Conectar últimos</Button></div>
        <div className="mt-4 space-y-2">{loadingDefinition ? <p className="text-sm text-muted">Carregando definição...</p> : definition.nodes.map((node, index) => <NodeCard key={node.id} node={node} index={index} onUpdate={updateNode} onConfig={updateConfig} onRemove={removeNode} />)}{definition.nodes.length === 0 && <div className="rounded-md border border-dashed border-border p-5 text-sm text-muted">Comece pelo nó de entrada recomendado. Depois adicione decisões, agentes ou ferramentas e conecte cada etapa em sequência.</div>}</div>
        {definition.edges.length > 0 && <div className="mt-4 rounded-lg border border-border p-3"><p className="text-xs font-semibold uppercase tracking-wide text-subtle">Conexões do fluxo</p><div className="mt-2 space-y-2">{definition.edges.map((edge) => <div key={`${edge.from}-${edge.to}-${edge.condition ?? ""}`} className="flex items-center gap-2 text-xs"><Badge tone="neutral">{definition.nodes.find((node) => node.id === edge.from)?.name ?? edge.from}</Badge><span className="text-muted">→</span><Badge tone="neutral">{definition.nodes.find((node) => node.id === edge.to)?.name ?? edge.to}</Badge>{edge.condition && <span className="text-muted">quando {edge.condition}</span>}<Button size="icon" variant="ghost" className="ml-auto size-7" onClick={() => removeEdge(edge.from, edge.to)}><Trash2 className="size-3" /></Button></div>)}</div></div>}
      </> : <p className="text-sm text-muted">Selecione ou crie um workflow.</p>}</Card>
      <Card className="p-5"><div className="mb-3 flex items-center justify-between"><p className="font-display font-semibold">Histórico de runs</p><Badge tone="neutral">{runs.length}</Badge></div><div className="space-y-2">{runs.map((item) => <div key={item.id} className={`flex flex-wrap items-center gap-2 rounded-md bg-elevated p-3 text-xs ${selectedRunId === item.id ? "ring-1 ring-accent" : ""}`}><button type="button" className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left" onClick={() => void inspectRun(item.id)}><span>{item.status}</span><span className="text-muted">{new Date(item.createdAt).toLocaleString("pt-BR")}</span>{item.errorCode && <span className="text-danger">{item.errorCode}</span>}</button><Button size="icon" variant="ghost" className="size-7" title="Reprocessar este run" onClick={() => void replay(item.id)}><RotateCcw className="size-3.5" /></Button></div>)}{runs.length === 0 && <p className="text-sm text-muted">Nenhum run registrado.</p>}</div>{selectedRunId && <div className="mt-4 border-t border-border pt-4"><p className="text-xs font-semibold uppercase tracking-wide text-subtle">Nós do run selecionado</p><div className="mt-2 space-y-1">{nodeRuns.map((node) => <div key={node.id} className="flex items-center justify-between rounded bg-bg px-2 py-1.5 text-xs"><span>{node.nodeId}</span><span className="text-muted">{node.status}</span></div>)}{nodeRuns.length === 0 && <p className="text-xs text-muted">Nenhum nó registrado.</p>}</div></div>}</Card></div>
    </div>
  </AppShell>;
}

function NodeCard({ node, index, onUpdate, onConfig, onRemove }: { node: WorkflowNode; index: number; onUpdate: (id: string, patch: Partial<WorkflowNode>) => void; onConfig: (id: string, key: string, value: string) => void; onRemove: (id: string) => void }) {
  const tone = node.type === "agent" ? "live" : node.type === "tool" ? "warn" : "neutral";
  return <div className="rounded-lg border border-border bg-elevated/40 p-3"><div className="flex flex-wrap items-center gap-2"><span className="w-6 text-xs text-muted">{index + 1}</span><Input className="max-w-xs" value={node.name ?? ""} onChange={(event) => onUpdate(node.id, { name: event.target.value })} /><Badge tone={tone}>{nodeLabels[node.type]}</Badge><Button size="icon" variant="ghost" className="ml-auto" onClick={() => onRemove(node.id)}><Trash2 className="size-3.5" /></Button></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{node.type === "agent" && <Input placeholder="ID do agente" value={String(node.config?.agentId ?? "")} onChange={(event) => onConfig(node.id, "agentId", event.target.value)} />}{node.type === "tool" && <Input placeholder="Chave da ferramenta" value={String(node.config?.toolKey ?? "")} onChange={(event) => onConfig(node.id, "toolKey", event.target.value)} />}{node.type === "condition" && <><Input placeholder="Campo, ex.: lead.score" value={String(node.config?.field ?? "")} onChange={(event) => onConfig(node.id, "field", event.target.value)} /><Input placeholder="Valor esperado" value={String(node.config?.equals ?? "")} onChange={(event) => onConfig(node.id, "equals", event.target.value)} /></>}{node.type === "transform" && <Textarea className="sm:col-span-2" placeholder='Mapeamento JSON, ex.: {"leadName":"$.lead.name"}' value={JSON.stringify(node.config?.mapping ?? {}, null, 2)} onChange={(event) => { try { onUpdate(node.id, { config: { ...(node.config ?? {}), mapping: JSON.parse(event.target.value) } }); } catch { /* aguarda JSON válido */ } }} />}{node.type === "approval" && <Input placeholder="Título da aprovação" value={String(node.config?.title ?? "")} onChange={(event) => onConfig(node.id, "title", event.target.value)} />}</div></div>;
}

function ValidationIssue({ issue }: { issue: WorkflowValidationIssue }) { return <div className="flex items-start gap-2 text-xs text-danger"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /><span>{issue.message}{issue.nodeId ? ` (${issue.nodeId})` : ""}</span></div>; }
