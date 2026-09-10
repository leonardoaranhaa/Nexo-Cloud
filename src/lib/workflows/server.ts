import { randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";
import { requireWorkspaceAccess, type JsonObject, type JsonValue } from "../multitenancy/server.ts";

export type WorkflowNode = { id: string; type: "agent" | "condition" | "wait" | "approval" | "tool"; name?: string; config?: JsonObject };
export type WorkflowDefinition = { nodes: WorkflowNode[]; edges: { from: string; to: string; condition?: string }[] };
export type WorkflowRecord = {
  id: string; workspaceId: string; name: string; slug: string; description: string;
  status: "draft" | "active" | "paused" | "archived"; triggerType: string; versionNumber: number | null;
  versionId: string | null; createdAt: string; updatedAt: string;
};
export type WorkflowRunRecord = {
  id: string; workflowId: string; workflowName: string; workflowVersionId: string; status: string;
  input: JsonObject; output: JsonObject; currentNodeId: string | null; correlationId: string;
  attempts: number; errorCode: string | null; errorMessage: string | null; createdAt: string; finishedAt: string | null;
};

function slugify(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "workflow";
}

function object(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function safeJson(value: unknown, depth = 0): JsonValue {
  if (depth > 4 || value === null || typeof value === "boolean" || typeof value === "number") return value as JsonValue;
  if (typeof value === "string") return value.slice(0, 2000);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => safeJson(item, depth + 1));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 50).map(([key, item]) => [key.slice(0, 80), safeJson(item, depth + 1)]));
  return null;
}

function normalizeDefinition(value: unknown): WorkflowDefinition {
  const input = object(value);
  const nodes = Array.isArray(input.nodes) ? input.nodes.slice(0, 100).map((raw) => {
    const node = object(raw);
    const type = node.type;
    if (!["agent", "condition", "wait", "approval", "tool"].includes(String(type))) throw new Error("WORKFLOW_NODE_TYPE_INVALID");
    return { id: String(node.id || randomUUID()).slice(0, 100), type: type as WorkflowNode["type"], name: typeof node.name === "string" ? node.name.slice(0, 120) : undefined, config: object(safeJson(node.config)) };
  }) : [];
  const edges = Array.isArray(input.edges) ? input.edges.slice(0, 200).map((raw) => {
    const edge = object(raw);
    return { from: String(edge.from || "").slice(0, 100), to: String(edge.to || "").slice(0, 100), condition: typeof edge.condition === "string" ? edge.condition.slice(0, 160) : undefined };
  }).filter((edge) => edge.from && edge.to) : [];
  return { nodes, edges };
}

export async function createWorkflow(sql: Sql, userId: string, input: { workspaceId: string; name: string; description?: string; triggerType?: string }): Promise<WorkflowRecord> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const id = randomUUID();
  const slug = `${slugify(input.name)}-${id.slice(0, 8)}`;
  await sql.query(`insert into workflows (id, workspace_id, name, slug, description, trigger_type, created_by, updated_by) values ($1,$2,$3,$4,$5,$6,$7,$7)`, [id, input.workspaceId, input.name.trim().slice(0, 120), slug, (input.description ?? "").slice(0, 500), input.triggerType ?? "manual", userId]);
  const versionId = randomUUID();
  await sql.query(`insert into workflow_versions (id, workflow_id, version_number, definition, created_by) values ($1,$2,1,$3::jsonb,$4)`, [versionId, id, JSON.stringify({ nodes: [], edges: [] }), userId]);
  await sql.query(`insert into workflow_triggers (id, workflow_id, type) values ($1,$2,$3)`, [randomUUID(), id, input.triggerType ?? "manual"]);
  const rows = await listWorkflows(sql, userId, { workspaceId: input.workspaceId });
  const created = rows.find((item) => item.id === id);
  if (!created) throw new Error("WORKFLOW_CREATE_FAILED");
  return created;
}

export async function saveWorkflowDefinition(sql: Sql, userId: string, input: { workspaceId: string; workflowId: string; definition: unknown }): Promise<void> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const workflow = await sql.query<{ id: string }>(`select id from workflows where id = $1 and workspace_id = $2 and deleted_at is null`, [input.workflowId, input.workspaceId]);
  if (!workflow[0]) throw new Error("WORKFLOW_NOT_FOUND");
  const definition = normalizeDefinition(input.definition);
  await sql.query(`update workflow_versions set definition = $1::jsonb where workflow_id = $2 and status = 'draft'`, [JSON.stringify(definition), input.workflowId]);
  await sql.query(`update workflows set updated_by = $1, updated_at = current_timestamp where id = $2 and workspace_id = $3`, [userId, input.workflowId, input.workspaceId]);
}

export async function publishWorkflow(sql: Sql, userId: string, input: { workspaceId: string; workflowId: string }): Promise<void> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "publish");
  const rows = await sql.query<{ id: string; version_number: number }>(`select v.id, v.version_number from workflow_versions v join workflows w on w.id = v.workflow_id where v.workflow_id = $1 and w.workspace_id = $2 and v.status = 'draft' order by v.version_number desc limit 1`, [input.workflowId, input.workspaceId]);
  if (!rows[0]) throw new Error("WORKFLOW_VERSION_NOT_FOUND");
  await sql.query(`update workflow_versions set status = 'retired' where workflow_id = $1 and status = 'published'`, [input.workflowId]);
  await sql.query(`update workflow_versions set status = 'published', published_by = $1, published_at = current_timestamp where id = $2`, [userId, rows[0].id]);
  const nextId = randomUUID();
  await sql.query(`insert into workflow_versions (id, workflow_id, version_number, definition, created_by) select $1, workflow_id, version_number + 1, definition, $2 from workflow_versions where id = $3`, [nextId, userId, rows[0].id]);
  await sql.query(`update workflows set status = 'active', updated_by = $1, updated_at = current_timestamp where id = $2 and workspace_id = $3`, [userId, input.workflowId, input.workspaceId]);
}

export async function listWorkflows(sql: Sql, userId: string, input: { workspaceId: string }): Promise<WorkflowRecord[]> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  return sql.query<WorkflowRecord>(`select w.id, w.workspace_id as "workspaceId", w.name, w.slug, w.description, w.status, w.trigger_type as "triggerType", w.created_at as "createdAt", w.updated_at as "updatedAt", v.id as "versionId", v.version_number as "versionNumber" from workflows w left join lateral (select id, version_number from workflow_versions where workflow_id = w.id and status = 'published' order by version_number desc limit 1) v on true where w.workspace_id = $1 and w.deleted_at is null order by w.updated_at desc`, [input.workspaceId]);
}

export async function runWorkflowManually(sql: Sql, userId: string, input: { workspaceId: string; workflowId: string; input?: JsonObject; idempotencyKey?: string }): Promise<WorkflowRunRecord> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "operate");
  const version = await sql.query<{ id: string; definition: unknown }>(`select v.id, v.definition from workflow_versions v join workflows w on w.id = v.workflow_id where v.workflow_id = $1 and w.workspace_id = $2 and v.status = 'published' limit 1`, [input.workflowId, input.workspaceId]);
  if (!version[0]) throw new Error("WORKFLOW_NOT_PUBLISHED");
  const idempotencyKey = input.idempotencyKey?.slice(0, 160) || `manual:${randomUUID()}`;
  const existing = await sql.query<{ id: string }>(`select id from workflow_runs where workspace_id = $1 and idempotency_key = $2`, [input.workspaceId, idempotencyKey]);
  if (existing[0]) return getWorkflowRun(sql, userId, { workspaceId: input.workspaceId, runId: existing[0].id });
  const runId = randomUUID();
  const inputValue = object(safeJson(input.input ?? {}));
  await sql.query(`insert into workflow_runs (id, workspace_id, workflow_id, workflow_version_id, status, input, correlation_id, idempotency_key, attempts, started_at) values ($1,$2,$3,$4,'running',$5::jsonb,$6,$7,1,current_timestamp)`, [runId, input.workspaceId, input.workflowId, version[0].id, JSON.stringify(inputValue), randomUUID(), idempotencyKey]);
  const definition = normalizeDefinition(version[0].definition);
  let status: "succeeded" | "waiting" | "failed" = "succeeded";
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  for (const node of definition.nodes) {
    await sql.query(`insert into workflow_node_runs (id, run_id, node_id, node_type, status, input, started_at) values ($1,$2,$3,$4,'running',$5::jsonb,current_timestamp)`, [randomUUID(), runId, node.id, node.type, JSON.stringify(inputValue)]);
    if (node.type === "wait" || node.type === "approval") {
      status = "waiting";
      await sql.query(`update workflow_node_runs set status = 'waiting', output = $1::jsonb, finished_at = current_timestamp where run_id = $2 and node_id = $3 and status = 'running'`, [JSON.stringify({ waiting: node.type }), runId, node.id]);
      break;
    }
    if (node.type === "agent" || node.type === "tool") {
      status = "failed";
      errorCode = node.type === "agent" ? "WORKFLOW_AGENT_NODE_DEFERRED" : "WORKFLOW_TOOL_NODE_DEFERRED";
      errorMessage = "Este nó será conectado ao runtime de ferramentas na próxima fatia.";
      await sql.query(`update workflow_node_runs set status = 'failed', error_code = $1, error_message = $2, finished_at = current_timestamp where run_id = $3 and node_id = $4 and status = 'running'`, [errorCode, errorMessage, runId, node.id]);
      break;
    }
    await sql.query(`update workflow_node_runs set status = 'succeeded', output = $1::jsonb, finished_at = current_timestamp where run_id = $2 and node_id = $3 and status = 'running'`, [JSON.stringify({ evaluated: true }), runId, node.id]);
  }
  await sql.query(`update workflow_runs set status = $1, output = $2::jsonb, error_code = $3, error_message = $4, finished_at = case when $1 in ('succeeded','failed') then current_timestamp else null end where id = $5`, [status, JSON.stringify({ nodeCount: definition.nodes.length }), errorCode, errorMessage, runId]);
  return getWorkflowRun(sql, userId, { workspaceId: input.workspaceId, runId });
}

export async function listWorkflowRuns(sql: Sql, userId: string, input: { workspaceId: string; workflowId?: string }): Promise<WorkflowRunRecord[]> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  const params: unknown[] = [input.workspaceId];
  const filter = input.workflowId ? (params.push(input.workflowId), "and r.workflow_id = $2") : "";
  return sql.query<WorkflowRunRecord>(`select r.id, r.workflow_id as "workflowId", w.name as "workflowName", r.workflow_version_id as "workflowVersionId", r.status, r.input, r.output, r.current_node_id as "currentNodeId", r.correlation_id as "correlationId", r.attempts, r.error_code as "errorCode", r.error_message as "errorMessage", r.created_at as "createdAt", r.finished_at as "finishedAt" from workflow_runs r join workflows w on w.id = r.workflow_id where r.workspace_id = $1 ${filter} order by r.created_at desc limit 100`, params);
}

async function getWorkflowRun(sql: Sql, userId: string, input: { workspaceId: string; runId: string }): Promise<WorkflowRunRecord> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  const rows = await sql.query<WorkflowRunRecord>(`select r.id, r.workflow_id as "workflowId", w.name as "workflowName", r.workflow_version_id as "workflowVersionId", r.status, r.input, r.output, r.current_node_id as "currentNodeId", r.correlation_id as "correlationId", r.attempts, r.error_code as "errorCode", r.error_message as "errorMessage", r.created_at as "createdAt", r.finished_at as "finishedAt" from workflow_runs r join workflows w on w.id = r.workflow_id where r.id = $1 and r.workspace_id = $2`, [input.runId, input.workspaceId]);
  if (!rows[0]) throw new Error("WORKFLOW_RUN_NOT_FOUND");
  return rows[0];
}
