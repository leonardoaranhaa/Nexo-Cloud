import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, LoaderCircle, Play, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { Agent } from "@/lib/types";
import type { AgentVersionRecord } from "@/lib/multitenancy/server";
import {
  getWorkspaceAgentEvaluationHarnessRun,
  listWorkspaceAgentEvaluationHarnessRuns,
  listWorkspaceAgentVersions,
  runWorkspaceAgentEvaluationHarness,
} from "@/lib/multitenancy/api";
import { useNexo } from "@/lib/store";
import {
  formatHarnessDate,
  formatHarnessNumber,
  formatHarnessPercent,
  parseHarnessRunDetail,
  parseHarnessRunSummary,
  summarizeHarnessSnapshot,
  type HarnessComparisonView,
  type HarnessMetricsView,
  type HarnessRunDetailView,
  type HarnessRunSummaryView,
} from "@/lib/agent-engineering/harness-view";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

const METRICS: Array<{ key: keyof HarnessMetricsView; label: string; description: string; kind: "percent" | "number" | "milliseconds" }> = [
  { key: "successRate", label: "Sucesso", description: "Cenários aprovados", kind: "percent" },
  { key: "avgTokens", label: "Tokens médios", description: "Estimativa por resposta", kind: "number" },
  { key: "avgLatencyMs", label: "Latência média", description: "Tempo de avaliação", kind: "milliseconds" },
  { key: "toolErrorRate", label: "Erro de tool", description: "Cenários com falha de tool", kind: "percent" },
  { key: "handoffRate", label: "Handoff", description: "Cenários transferidos", kind: "percent" },
  { key: "guardrailViolationCount", label: "Guardrails", description: "Violações detectadas", kind: "number" },
];

const selectClassName = "mt-2 flex h-10 w-full rounded-md border border-border bg-bg px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70";

type Version = Pick<AgentVersionRecord, "id" | "versionNumber" | "status" | "createdAt" | "publishedAt">;

export function EvaluationHarnessPanel({ agent }: { agent: Agent }) {
  const workspaceId = useNexo((state) => state.workspaceId);
  const backendReady = useNexo((state) => state.backendReady);
  const [versions, setVersions] = useState<Version[]>([]);
  const [runs, setRuns] = useState<HarnessRunSummaryView[]>([]);
  const [detail, setDetail] = useState<HarnessRunDetailView | null>(null);
  const [baselineVersionId, setBaselineVersionId] = useState("");
  const [candidateVersionId, setCandidateVersionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!backendReady || !workspaceId) {
        setLoading(false);
        setVersions([]);
        setRuns([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const versionRows = await listWorkspaceAgentVersions({ data: { workspaceId, agentId: agent.id } });
        const runRows = agent.developmentBlueprintId
          ? await listWorkspaceAgentEvaluationHarnessRuns({
              data: { workspaceId, agentId: agent.id, blueprintId: agent.developmentBlueprintId },
            })
          : [];
        if (cancelled) return;
        setVersions(versionRows);
        setRuns(runRows.map(parseHarnessRunSummary).filter((run): run is HarnessRunSummaryView => run !== null));
        setBaselineVersionId((current) => current && versionRows.some((version) => version.id === current) ? current : defaultBaseline(versionRows)?.id ?? "");
        setCandidateVersionId((current) => current && versionRows.some((version) => version.id === current) ? current : defaultCandidate(versionRows)?.id ?? "");
      } catch {
        if (!cancelled) {
          setError("Não foi possível carregar as versões e avaliações deste agente.");
          setVersions([]);
          setRuns([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [agent.id, agent.developmentBlueprintId, backendReady, refreshTick, workspaceId]);

  const selectedBaseline = useMemo(() => versions.find((version) => version.id === baselineVersionId), [baselineVersionId, versions]);
  const selectedCandidate = useMemo(() => versions.find((version) => version.id === candidateVersionId), [candidateVersionId, versions]);
  const canRun = Boolean(
    backendReady &&
    workspaceId &&
    agent.developmentBlueprintId &&
    selectedBaseline &&
    selectedCandidate &&
    baselineVersionId !== candidateVersionId
  );

  async function runComparison() {
    if (!workspaceId || !agent.developmentBlueprintId || !baselineVersionId || !candidateVersionId) return;
    if (baselineVersionId === candidateVersionId) {
      setError("Escolha duas versões diferentes para comparar.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const result = await runWorkspaceAgentEvaluationHarness({
        data: {
          workspaceId,
          agentId: agent.id,
          blueprintId: agent.developmentBlueprintId,
          baselineVersionId,
          candidateVersionId,
        },
      });
      const parsedDetail = parseHarnessRunDetail(result);
      const parsedSummary = parseHarnessRunSummary(result);
      if (!parsedDetail || !parsedSummary) throw new Error("EVALUATION_RESULT_INVALID");
      setDetail(parsedDetail);
      setRuns((current) => [parsedSummary, ...current.filter((run) => run.id !== parsedSummary.id)]);
      toast(parsedDetail.regressionCount > 0 ? "Comparação concluída com regressões detectadas." : "Comparação concluída sem regressões.");
    } catch {
      setError("A comparação não pôde ser concluída. Verifique se as versões e os cenários estão disponíveis.");
    } finally {
      setRunning(false);
    }
  }

  async function inspectRun(runId: string) {
    if (!workspaceId) return;
    setLoadingRunId(runId);
    setError(null);
    try {
      const result = await getWorkspaceAgentEvaluationHarnessRun({ data: { workspaceId, runId } });
      const parsed = parseHarnessRunDetail(result);
      if (!parsed) throw new Error("EVALUATION_RUN_NOT_FOUND");
      setDetail(parsed);
    } catch {
      setError("Não foi possível abrir os detalhes desta avaliação.");
    } finally {
      setLoadingRunId(null);
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="evaluation-harness-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-accent" />
            <h2 id="evaluation-harness-title" className="font-display text-lg font-semibold">Evaluation Harness</h2>
            <Badge tone="accent">Offline</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">
            Compare versões do mesmo agente com os cenários do blueprint antes de publicar. Esta avaliação é somente leitura operacional: não envia mensagens, não chama tools e não promove versões.
          </p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => setRefreshTick((value) => value + 1)} disabled={loading || running}>
          <RefreshCw className="size-3.5" /> Atualizar
        </Button>
      </div>

      {!backendReady && <Notice tone="warn" title="Backend persistente indisponível" description="A comparação exige versões e cenários salvos no workspace. O modo local sem backend não libera uma avaliação simulada." />}
      {error && <Notice tone="danger" title="Não foi possível concluir" description={error} />}

      {backendReady && loading && <Card className="flex items-center gap-3 p-5 text-sm text-muted"><LoaderCircle className="size-4 animate-spin" />Carregando versões e avaliações deste agente…</Card>}

      {backendReady && !loading && !agent.developmentBlueprintId && (
        <Notice tone="warn" title="Blueprint ainda não persistido" description="Configure objetivos, capacidades, guardrails e cenários na seção acima. O painel será habilitado depois que o blueprint for salvo no workspace." />
      )}

      {backendReady && !loading && agent.developmentBlueprintId && versions.length < 2 && (
        <Notice tone="warn" title="São necessárias duas versões" description="A harness compara uma baseline e uma candidata. Crie ou publique uma nova versão para habilitar a execução." />
      )}

      {backendReady && !loading && agent.developmentBlueprintId && versions.length >= 2 && (
        <Card className="p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
            <VersionSelect label="Baseline" hint="Versão de referência" value={baselineVersionId} versions={versions} onChange={setBaselineVersionId} />
            <VersionSelect label="Candidata" hint="Versão sob teste" value={candidateVersionId} versions={versions} onChange={setCandidateVersionId} />
            <Button type="button" variant="default" className="lg:mb-0.5" onClick={() => void runComparison()} disabled={!canRun || running}>
              {running ? <LoaderCircle className="animate-spin" /> : <Play />}
              {running ? "Comparando…" : "Executar comparação"}
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted">
            <span>Escopo: {agent.name}</span>
            <span className="text-subtle">·</span>
            <span>{agent.developmentBlueprint?.testScenarios.length ?? 0} cenário(s) configurado(s)</span>
            <span className="text-subtle">·</span>
            <span>Sem efeitos externos</span>
          </div>
        </Card>
      )}

      {detail ? <EvaluationDetail agent={agent} detail={detail} versions={versions} /> : <Card className="border-dashed p-5"><p className="text-sm font-medium">Nenhuma avaliação selecionada</p><p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">Execute uma comparação ou abra uma avaliação do histórico para ver métricas, contratos e resultado por cenário.</p></Card>}

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-sm font-semibold">Histórico de avaliações</h3>
            <p className="mt-1 text-xs text-muted">Runs anteriores deste agente e blueprint no workspace atual.</p>
          </div>
          <Badge>{runs.length} {runs.length === 1 ? "run" : "runs"}</Badge>
        </div>
        {runs.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border p-4 text-sm text-muted">Nenhuma comparação persistida ainda.</p>
        ) : (
          <div className="mt-4 grid gap-2">
            {runs.map((run) => (
              <button key={run.id} type="button" onClick={() => void inspectRun(run.id)} disabled={loadingRunId !== null} className="flex w-full flex-wrap items-center gap-3 rounded-lg border border-border bg-bg p-3 text-left transition-colors hover:border-accent/40 hover:bg-elevated/50 disabled:opacity-60">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-elevated text-accent">{loadingRunId === run.id ? <LoaderCircle className="size-4 animate-spin" /> : run.regressionCount > 0 ? <XCircle className="size-4 text-danger" /> : <CheckCircle2 className="size-4 text-live" />}</span>
                <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2 text-sm font-medium"><span>{versionLabel(run.baselineVersionId, versions)} → {versionLabel(run.candidateVersionId, versions)}</span><Badge tone={run.regressionCount > 0 ? "danger" : "live"}>{run.regressionCount > 0 ? `${run.regressionCount} regressão(ões)` : "Sem regressões"}</Badge></span><span className="mt-1 block text-xs text-muted">{formatHarnessDate(run.createdAt)} · {run.scenarioCount} cenário(s){run.durationMs === null ? "" : ` · ${formatHarnessNumber(run.durationMs)} ms`}</span></span>
                <ChevronDown className="size-4 -rotate-90 text-subtle" />
              </button>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}

function VersionSelect({ label, hint, value, versions, onChange }: { label: string; hint: string; value: string; versions: Version[]; onChange: (value: string) => void }) {
  return <label className="block min-w-0"><span className="text-sm font-medium">{label}</span><span className="ml-2 text-xs text-muted">{hint}</span><select className={selectClassName} value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>{versions.map((version) => <option key={version.id} value={version.id}>{`v${version.versionNumber} · ${versionStatusLabel(version.status)} · ${formatHarnessDate(version.createdAt)}`}</option>)}</select></label>;
}

function EvaluationDetail({ agent, detail, versions }: { agent: Agent; detail: HarnessRunDetailView; versions: Version[] }) {
  const baselineContract = summarizeHarnessSnapshot(detail.baselineSnapshot);
  const candidateContract = summarizeHarnessSnapshot(detail.candidateSnapshot);
  const guardrails = agent.developmentBlueprint?.guardrails.filter(Boolean).slice(0, 8) ?? [];
  return <div className="flex flex-col gap-4">
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-base font-semibold">Resultado da comparação</h3><Badge tone={detail.regressionCount > 0 ? "danger" : "live"}>{detail.regressionCount > 0 ? `${detail.regressionCount} regressão(ões)` : "Sem regressões"}</Badge></div><p className="mt-1 text-xs text-muted">{versionLabel(detail.baselineVersionId, versions)} como baseline · {versionLabel(detail.candidateVersionId, versions)} como candidata · executado em {formatHarnessDate(detail.createdAt)}</p></div><Badge tone="accent">{detail.scenarioCount} cenários</Badge>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {METRICS.map((metric) => <MetricComparison key={metric.key} label={metric.label} description={metric.description} kind={metric.kind} baseline={detail.baselineMetrics[metric.key]} candidate={detail.candidateMetrics[metric.key]} />)}
      </div>
    </Card>

    <Card className="p-4">
      <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" /><div><h3 className="font-display text-sm font-semibold">Contrato de engenharia observado</h3><p className="mt-1 text-xs leading-relaxed text-muted">A comparação congela a configuração e as tools sanitizadas de cada versão. Guardrails e cenários continuam definidos no blueprint do agente.</p></div></div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2"><ContractCard title={`Baseline · ${versionLabel(detail.baselineVersionId, versions)}`} contract={baselineContract} /><ContractCard title={`Candidata · ${versionLabel(detail.candidateVersionId, versions)}`} contract={candidateContract} /></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><ContractFact label="Guardrails do blueprint" value={guardrails.length ? guardrails.join(" · ") : "Nenhum guardrail definido"} /><ContractFact label="Cenários de acionamento" value={`${detail.scenarioCount} cenário(s) executado(s) em modo offline`} /></div>
    </Card>

    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-display text-sm font-semibold">Comparação por cenário</h3><p className="mt-1 text-xs text-muted">Respostas e diferenças sanitizadas; regressão significa que um cenário aprovado passou a falhar.</p></div><Badge tone={detail.regressionCount > 0 ? "danger" : "live"}>{detail.regressionCount} regressão(ões)</Badge></div>
      <div className="mt-4 flex flex-col gap-3">{detail.comparisons.map((comparison) => <ScenarioComparison key={comparison.scenarioId} comparison={comparison} />)}</div>
    </Card>
  </div>;
}

function MetricComparison({ label, description, kind, baseline, candidate }: { label: string; description: string; kind: "percent" | "number" | "milliseconds"; baseline: number; candidate: number }) {
  return <div className="rounded-lg border border-border bg-bg p-3"><div className="flex items-start justify-between gap-2"><div><div className="text-sm font-medium">{label}</div><div className="mt-0.5 text-[11px] text-muted">{description}</div></div><span className="text-[10px] uppercase tracking-wide text-subtle">B4</span></div><div className="mt-3 grid grid-cols-2 gap-3"><MetricValue label="Baseline" value={formatMetric(baseline, kind)} /><MetricValue label="Candidata" value={formatMetric(candidate, kind)} emphasis={candidate !== baseline} /></div></div>;
}

function MetricValue({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div><div className="text-[10px] uppercase tracking-wide text-subtle">{label}</div><div className={`mt-1 font-mono text-base ${emphasis ? "text-accent" : "text-fg"}`}>{value}</div></div>;
}

function ContractCard({ title, contract }: { title: string; contract: ReturnType<typeof summarizeHarnessSnapshot> }) {
  return <div className="rounded-lg border border-border bg-bg p-3"><div className="text-xs font-semibold uppercase tracking-wide text-accent">{title}</div><div className="mt-3 grid gap-3"><ContractFact label="Modelo" value={contract.model} /><ContractFact label="Persona" value={contract.persona} /><div><div className="text-[10px] uppercase tracking-wide text-subtle">Prompt</div><p className="mt-1 max-h-24 overflow-hidden text-xs leading-relaxed text-muted">{contract.prompt}</p></div><div><div className="text-[10px] uppercase tracking-wide text-subtle">Tools autorizadas</div><div className="mt-1 flex flex-wrap gap-1.5">{contract.toolKeys.length ? contract.toolKeys.map((key) => <Badge key={key}>{key}</Badge>) : <span className="text-xs text-muted">Nenhuma tool autorizada</span>}</div></div></div></div>;
}

function ContractFact({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] uppercase tracking-wide text-subtle">{label}</div><div className="mt-1 text-xs leading-relaxed text-muted">{value}</div></div>;
}

function ScenarioComparison({ comparison }: { comparison: HarnessComparisonView }) {
  const candidatePassed = comparison.candidate.status === "passed";
  return <details open={comparison.regression} className={`rounded-lg border bg-bg ${comparison.regression ? "border-danger/40" : "border-border"}`}><summary className="flex cursor-pointer list-none items-center gap-3 p-3"><span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${comparison.regression ? "bg-danger/15 text-danger" : candidatePassed ? "bg-live/15 text-live" : "bg-warn/15 text-warn"}`}>{comparison.regression ? <XCircle className="size-4" /> : candidatePassed ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}</span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{comparison.scenarioName}</span><span className="mt-0.5 block text-xs text-muted">Baseline {comparison.baseline.status === "passed" ? "aprovada" : "falhou"} · candidata {candidatePassed ? "aprovada" : "falhou"}</span></span><Badge tone={comparison.regression ? "danger" : candidatePassed ? "live" : "warn"}>{comparison.regression ? "Regressão" : candidatePassed ? "Aprovado" : "Falha"}</Badge><ChevronDown className="size-4 text-subtle" /></summary><div className="grid gap-3 border-t border-border p-3 lg:grid-cols-2"><ScenarioSide label="Baseline" result={comparison.baseline} /><ScenarioSide label="Candidata" result={comparison.candidate} /><div className="lg:col-span-2"><div className="text-[10px] uppercase tracking-wide text-subtle">Diferenças observadas</div>{comparison.differences.length ? <div className="mt-2 flex flex-wrap gap-1.5">{comparison.differences.map((difference) => <Badge key={difference} tone={comparison.regression ? "danger" : "neutral"}>{difference}</Badge>)}</div> : <p className="mt-1 text-xs text-muted">Nenhuma diferença estrutural registrada.</p>}</div></div></details>;
}

function ScenarioSide({ label, result }: { label: string; result: { status: "passed" | "failed"; reply: string; nextAction: string; toolsCalled: string[]; handoff: boolean; outputTokens: number; failures: string[] } }) {
  return <div className="rounded-md border border-border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold">{label}</span><Badge tone={result.status === "passed" ? "live" : "danger"}>{result.status === "passed" ? "Aprovado" : "Falha"}</Badge></div><p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-fg">{result.reply || "Sem resposta registrada"}</p><div className="mt-3 grid gap-2 text-[11px] text-muted sm:grid-cols-3"><span>Próxima ação: {result.nextAction || "—"}</span><span>Handoff: {result.handoff ? "sim" : "não"}</span><span>Tokens: {formatHarnessNumber(result.outputTokens)}</span></div>{result.toolsCalled.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5"><span className="self-center text-[10px] uppercase tracking-wide text-subtle">Tools</span>{result.toolsCalled.map((tool) => <Badge key={tool}>{tool}</Badge>)}</div>}{result.failures.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5"><span className="self-center text-[10px] uppercase tracking-wide text-danger">Falhas</span>{result.failures.map((failure) => <Badge key={failure} tone="danger">{failure}</Badge>)}</div>}</div>;
}

function Notice({ tone, title, description }: { tone: "warn" | "danger"; title: string; description: string }) {
  return <Card className={`flex items-start gap-3 p-4 ${tone === "danger" ? "border-danger/40" : "border-warn/40"}`}><AlertCircle className={`mt-0.5 size-4 shrink-0 ${tone === "danger" ? "text-danger" : "text-warn"}`} /><div><div className="text-sm font-medium">{title}</div><p className="mt-1 text-xs leading-relaxed text-muted">{description}</p></div></Card>;
}

function defaultBaseline(versions: Version[]): Version | undefined {
  return versions.find((version) => version.status === "published") ?? versions[versions.length - 1];
}

function defaultCandidate(versions: Version[]): Version | undefined {
  const baseline = defaultBaseline(versions);
  return versions.find((version) => version.id !== baseline?.id && version.status === "draft") ?? versions.find((version) => version.id !== baseline?.id);
}

function versionLabel(versionId: string, versions: Version[]): string {
  const version = versions.find((item) => item.id === versionId);
  return version ? `v${version.versionNumber}` : `versão ${versionId.slice(0, 8)}`;
}

function versionStatusLabel(status: Version["status"]): string {
  return status === "published" ? "publicada" : status === "retired" ? "retirada" : "rascunho";
}

function formatMetric(value: number, kind: "percent" | "number" | "milliseconds"): string {
  if (kind === "percent") return formatHarnessPercent(value);
  if (kind === "milliseconds") return `${formatHarnessNumber(value)} ms`;
  return formatHarnessNumber(value);
}
