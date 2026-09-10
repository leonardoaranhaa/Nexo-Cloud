import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listWorkspaceAgentRuntimeExecutions } from "@/lib/multitenancy/api";
import { useNexo } from "@/lib/store";

export const Route = createFileRoute("/runs")({ component: RuntimeRunsPage });

type Execution = Awaited<ReturnType<typeof listWorkspaceAgentRuntimeExecutions>>[number];
type Filter = "all" | "running" | "succeeded" | "failed" | "skipped";

function statusTone(status: Execution["status"]) {
  if (status === "succeeded") return "live" as const;
  if (status === "failed") return "danger" as const;
  if (status === "running") return "warn" as const;
  return "neutral" as const;
}

function statusLabel(status: Execution["status"]) {
  return status === "succeeded" ? "Sucesso" : status === "failed" ? "Falha" : status === "running" ? "Executando" : "Ignorada";
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
}

function RuntimeRunsPage() {
  const workspaceId = useNexo((s) => s.workspaceId);
  const backendReady = useNexo((s) => s.backendReady);
  const [filter, setFilter] = useState<Filter>("all");
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = executions.find((execution) => execution.id === selectedId) ?? null;

  const load = useCallback(async () => {
    if (!backendReady || !workspaceId) return;
    try {
      const next = await listWorkspaceAgentRuntimeExecutions({ data: { workspaceId, status: filter === "all" ? undefined : filter } });
      setExecutions(next);
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? null);
    } catch {
      toast("Não foi possível carregar as execuções.");
    }
  }, [backendReady, filter, workspaceId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => { void load(); }, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (!backendReady) {
    return <AppShell title="Execuções"><Card className="p-6 text-sm text-muted">O backend persistente ainda está carregando.</Card></AppShell>;
  }

  return (
    <AppShell title="Execuções">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-lg font-semibold">Agent Runtime</p>
          <p className="text-sm text-muted">Logs sanitizados de jobs, decisões e respostas.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void load}><RefreshCw className="size-3.5" /> Atualizar</Button>
      </div>
      <div className="mb-4 flex flex-wrap gap-1">
        {(["all", "running", "succeeded", "failed", "skipped"] as Filter[]).map((item) => (
          <Button key={item} size="sm" variant={filter === item ? "default" : "ghost"} onClick={() => setFilter(item)}>
            {item === "all" ? "Todas" : item === "running" ? "Executando" : item === "succeeded" ? "Sucesso" : item === "failed" ? "Falhas" : "Ignoradas"}
          </Button>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <Card className="overflow-hidden p-0">
          <div className="divide-y divide-border">
            {executions.map((execution) => (
              <button key={execution.id} type="button" onClick={() => setSelectedId(execution.id)} className={`w-full p-4 text-left hover:bg-elevated/60 ${selectedId === execution.id ? "bg-elevated" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Activity className="size-4 text-muted" />
                  <span className="font-medium">{execution.agentName}</span>
                  <Badge tone={statusTone(execution.status)}>{statusLabel(execution.status)}</Badge>
                  <span className="ml-auto text-xs text-muted">{dateTime(execution.createdAt)}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span>Decisão: {execution.reason ?? "—"}</span>
                  <span>Contato: {execution.externalContactId}</span>
                  <span>Tentativa: {execution.attemptCount}</span>
                  {execution.durationMs !== null && <span>{execution.durationMs} ms</span>}
                </div>
              </button>
            ))}
            {executions.length === 0 && <div className="p-6 text-sm text-muted">Nenhuma execução registrada.</div>}
          </div>
        </Card>
        <Card className="min-h-64 p-4">
          {selected ? (
            <div className="space-y-4">
              <div>
                <p className="font-display font-semibold">Detalhes da execução</p>
                <p className="mt-1 break-all text-xs text-muted">Trace: {selected.traceId}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md bg-elevated p-2"><div className="text-muted">Provider</div><div>{selected.aiProvider ?? "local"}</div></div>
                <div className="rounded-md bg-elevated p-2"><div className="text-muted">Modelo</div><div>{selected.modelName ?? "fallback"}</div></div>
                <div className="rounded-md bg-elevated p-2"><div className="text-muted">Histórico</div><div>{selected.historyCount} mensagens</div></div>
                <div className="rounded-md bg-elevated p-2"><div className="text-muted">Saída</div><div>{selected.outputChars} caracteres</div></div>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">Etapas</p>
                <div className="space-y-2">
                  {selected.steps.map((step, index) => {
                    const value = step as { name?: string; status?: string; durationMs?: number };
                    return <div key={`${value.name}-${index}`} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs"><span>{value.name ?? "etapa"}</span><span className="text-muted">{value.status ?? "ok"}{value.durationMs ? ` · ${value.durationMs} ms` : ""}</span></div>;
                  })}
                </div>
              </div>
              {selected.errorMessage && <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-xs text-danger">{selected.errorCode}: {selected.errorMessage}</div>}
            </div>
          ) : <p className="text-sm text-muted">Selecione uma execução para ver os detalhes sanitizados.</p>}
        </Card>
      </div>
    </AppShell>
  );
}
