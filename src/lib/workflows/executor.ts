import { randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";
import type { JsonObject } from "../multitenancy/server.ts";
import { compileWorkflowDefinition, evaluateCondition } from "./compiler.ts";
import { claimWorkflowRun, completeWorkflowRun, failOrRetryWorkflowRun, type ClaimedWorkflowRun } from "./queue.ts";
import type { WorkflowDefinition, WorkflowNode } from "./server.ts";

type Json = JsonObject;
export type WorkflowNodeHandlers = {
  agent: (node: WorkflowNode, input: Json, run: ClaimedWorkflowRun) => Promise<Json>;
  tool: (node: WorkflowNode, input: Json, run: ClaimedWorkflowRun) => Promise<Json>;
};

const unavailableHandlers: WorkflowNodeHandlers = {
  async agent() { throw new Error("WORKFLOW_AGENT_HANDLER_UNAVAILABLE"); },
  async tool() { throw new Error("WORKFLOW_TOOL_HANDLER_UNAVAILABLE"); },
};

function asObject(value: unknown): Json { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function nodeById(definition: WorkflowDefinition, id: string) { return definition.nodes.find((node) => node.id === id); }
function nextNode(definition: WorkflowDefinition, node: WorkflowNode, output: Json): string | null {
  const candidates = definition.edges.filter((edge) => edge.from === node.id);
  if (node.type === "condition") {
    const branch = Boolean(output.result);
    const edge = candidates.find((item) => (item.condition ?? "").toLowerCase() === (branch ? "true" : "false")) ?? candidates.find((item) => !item.condition);
    return edge?.to ?? null;
  }
  return candidates.find((item) => !item.condition)?.to ?? candidates[0]?.to ?? null;
}

export async function runNextWorkflowRun(sql: Sql, workerId: string, handlers: WorkflowNodeHandlers = unavailableHandlers): Promise<{ status: "idle" | "succeeded" | "waiting" | "queued" | "failed"; runId?: string; reason?: string }> {
  const run = await claimWorkflowRun(sql, workerId);
  if (!run) return { status: "idle" };
  try {
    const version = await sql.query<{ definition: unknown }>(`select definition from workflow_versions where id = $1`, [run.workflow_version_id]);
    if (!version[0]) throw new Error("WORKFLOW_VERSION_NOT_FOUND");
    const compiled = compileWorkflowDefinition(asObject(version[0].definition) as unknown as WorkflowDefinition);
    let currentId: string | null = (await sql.query<{ current_node_id: string | null }>(`select current_node_id from workflow_runs where id = $1`, [run.id]))[0]?.current_node_id ?? compiled.order[0] ?? null;
    let context = asObject(run.context);
    const input = asObject(run.input);
    if (!currentId) return await completeWorkflowRun(sql, run.id, workerId, { context }) ? { status: "succeeded", runId: run.id } : { status: "failed", runId: run.id };
    while (currentId) {
      const node = nodeById(compiled, currentId);
      if (!node) throw new Error("WORKFLOW_NODE_NOT_FOUND");
      await sql.query(`update workflow_runs set current_node_id = $1, context = $2::jsonb where id = $3 and claimed_by = $4`, [node.id, JSON.stringify(context), run.id, workerId]);
      const previous = await sql.query<{ id: string; status: string; output: unknown }>(`select id, status, output from workflow_node_runs where run_id = $1 and node_id = $2 order by started_at desc limit 1`, [run.id, node.id]);
      if (previous[0] && node.type === "wait") {
        const resumed = await sql.query<{ resume_requested: boolean }>(`update workflow_runs set resume_requested = false, resume_reason = null where id = $1 and claimed_by = $2 and resume_requested = true returning resume_requested`, [run.id, workerId]);
        if (resumed[0]) { context = { ...context, [node.id]: asObject(previous[0].output) }; currentId = nextNode(compiled, node, asObject(previous[0].output)); continue; }
      }
      if (previous[0] && node.type === "approval") {
        const approval = await sql.query<{ status: string; reason: string }>(`select status, reason from workflow_approvals where node_run_id = $1 order by created_at desc limit 1`, [previous[0].id]);
        if (approval[0]?.status === "approved") { await sql.query(`update workflow_runs set resume_requested = false, resume_reason = null where id = $1 and claimed_by = $2`, [run.id, workerId]); const output = { approved: true, reason: approval[0].reason }; context = { ...context, [node.id]: output }; currentId = nextNode(compiled, node, output); continue; }
        if (approval[0]?.status === "rejected" || approval[0]?.status === "expired") throw new Error(`WORKFLOW_APPROVAL_${approval[0].status.toUpperCase()}`);
        await sql.query(`update workflow_runs set status = 'waiting', claimed_by = null, lease_until = null where id = $1 and claimed_by = $2`, [run.id, workerId]);
        return { status: "waiting", runId: run.id };
      }
      const nodeRunId = randomUUID();
      await sql.query(`insert into workflow_node_runs (id, run_id, node_id, node_type, status, input, started_at) values ($1,$2,$3,$4,'running',$5::jsonb,current_timestamp)`, [nodeRunId, run.id, node.id, node.type, JSON.stringify({ ...input, ...context })]);
      let output: Json;
      if (node.type === "condition") output = { result: evaluateCondition(node.config, { ...input, ...context } as JsonObject) };
      else if (node.type === "wait") {
        await sql.query(`update workflow_node_runs set status = 'waiting', output = $1::jsonb, finished_at = current_timestamp where id = $2`, [JSON.stringify({ waiting: true }), nodeRunId]);
        await sql.query(`update workflow_runs set status = 'waiting', claimed_by = null, lease_until = null where id = $1 and claimed_by = $2`, [run.id, workerId]);
        return { status: "waiting", runId: run.id };
      } else if (node.type === "approval") {
        await sql.query(`insert into workflow_approvals (id, run_id, node_run_id, workspace_id, requested_by, reason, expires_at) values ($1,$2,$3,$4,$5,$6,current_timestamp + interval '30 minutes')`, [randomUUID(), run.id, nodeRunId, run.workspace_id, "workflow", typeof node.config?.title === "string" ? node.config.title : "Aprovação necessária"]);
        await sql.query(`update workflow_node_runs set status = 'waiting', output = $1::jsonb, finished_at = current_timestamp where id = $2`, [JSON.stringify({ waiting: "approval" }), nodeRunId]);
        await sql.query(`update workflow_runs set status = 'waiting', claimed_by = null, lease_until = null where id = $1 and claimed_by = $2`, [run.id, workerId]);
        return { status: "waiting", runId: run.id };
      } else if (node.type === "agent") output = await handlers.agent(node, { ...input, ...context }, run);
      else output = await handlers.tool(node, { ...input, ...context }, run);
      context = { ...context, [node.id]: output };
      await sql.query(`update workflow_node_runs set status = 'succeeded', output = $1::jsonb, finished_at = current_timestamp where id = $2`, [JSON.stringify(output), nodeRunId]);
      currentId = nextNode(compiled, node, output);
    }
    const done = await completeWorkflowRun(sql, run.id, workerId, { context });
    return done ? { status: "succeeded", runId: run.id } : { status: "failed", runId: run.id, reason: "WORKFLOW_LEASE_LOST" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "WORKFLOW_EXECUTION_FAILED";
    const status = await failOrRetryWorkflowRun(sql, run.id, workerId, reason.slice(0, 120), reason);
    return { status: status === "lost" ? "failed" : status, runId: run.id, reason };
  }
}
