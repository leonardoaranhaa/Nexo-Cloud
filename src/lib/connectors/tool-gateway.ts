import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";
import type { JsonObject } from "../multitenancy/server.ts";
import { configuredSecretProvider, type SecretProvider } from "./secrets.ts";
import { EvolutionTextDispatcher } from "./evolution-messaging.ts";
import type { ConnectorContext } from "./runtime.ts";
import type { ClaimedWorkflowRun } from "../workflows/queue.ts";
import type { WorkflowNode } from "../workflows/server.ts";
import { McpRuntime } from "./mcp-runtime.ts";
import {
  assertConnectionInWorkspace,
  assertPublishedWorkflowAgent,
  assertPublishedToolPermission,
  assertPublishedWorkflowApproval,
  assertPublishedWorkflowRun,
  assertPublishedWorkflowToolSnapshot,
  resolvePublishedAgentVersion,
  validateToolInput,
  validateToolOutput,
  workflowToolIdempotencyKey,
  workflowToolSnapshot,
} from "./tool-registry.ts";

function object(value: unknown): JsonObject { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}; }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 4000);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 50).map(([key, child]) => [
      key.slice(0, 100), /(token|secret|key|password|cookie|authorization)/i.test(key) ? "[redacted]" : sanitize(child, depth + 1),
    ]));
  }
  return null;
}
function redacted(value: unknown): JsonObject { return object(sanitize(value)); }
function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

function existingExecutionError(row: { error_code: string | null; error_message: string | null }): Error {
  return new Error(row.error_code || row.error_message || "TOOL_EXECUTION_PREVIOUSLY_FAILED");
}

export function defaultSecretProvider(sql?: Sql): SecretProvider {
  return configuredSecretProvider(sql);
}

export async function executeWorkflowTool(
  sql: Sql,
  node: WorkflowNode,
  input: JsonObject,
  run: ClaimedWorkflowRun,
  secretProvider?: SecretProvider,
): Promise<JsonObject> {
  const resolvedSecretProvider = secretProvider ?? defaultSecretProvider(sql);
  const toolKey = text(node.config?.toolKey);
  if (!toolKey) throw new Error("WORKFLOW_TOOL_CONFIG_REQUIRED");
  const agentId = text(node.config?.agentId);
  if (!agentId) throw new Error("WORKFLOW_AGENT_CONFIG_REQUIRED");
  const snapshot = workflowToolSnapshot(node.config?.toolSnapshot);
  if (snapshot.key !== toolKey) throw new Error("WORKFLOW_TOOL_SNAPSHOT_KEY_MISMATCH");
  await assertPublishedWorkflowRun(sql, run.workspace_id, run.workflow_id, run.workflow_version_id);
  await assertPublishedWorkflowAgent(sql, run.workspace_id, run.workflow_id, run.workflow_version_id, agentId);
  await assertPublishedWorkflowToolSnapshot(sql, { workspaceId: run.workspace_id, workflowId: run.workflow_id, workflowVersionId: run.workflow_version_id, nodeId: node.id, toolId: snapshot.id, toolKey: snapshot.key, toolVersion: snapshot.version });
  const agentVersionId = await resolvePublishedAgentVersion(sql, run.workspace_id, agentId);
  const permission = await assertPublishedToolPermission(sql, run.workspace_id, agentVersionId, snapshot.id);
  let approval: { id: string; approverId: string | null } | null = null;
  if (snapshot.riskLevel !== "read" && permission.requireApproval) {
    const approvalNodeId = text(node.config?.approvalNodeId);
    if (!approvalNodeId) throw new Error("TOOL_APPROVAL_REQUIRED");
    approval = await assertPublishedWorkflowApproval(sql, run.workspace_id, run.id, approvalNodeId);
  }
  const connectionId = text(node.config?.connectionId);
  await assertConnectionInWorkspace(sql, run.workspace_id, connectionId);
  const connection = await sql.query<{ id: string; provider: string; secret_ref: string; config: unknown }>(`select id, provider, secret_ref, config from connections where id = $1 and workspace_id = $2 and deleted_at is null and status = 'connected' and health_status = 'healthy' and last_healthcheck_at is not null limit 1`, [connectionId, run.workspace_id]);
  if (!connection[0]) throw new Error("TOOL_CONNECTION_NOT_FOUND");
  if (snapshot.provider && connection[0].provider !== snapshot.provider) throw new Error("TOOL_CONNECTOR_SNAPSHOT_MISMATCH");
  const validationInput: JsonObject = { ...input, connectionId };
  if (toolKey === "mcp.call") validationInput.mcpToolName = text(node.config?.mcpToolName);
  if (toolKey === "evolution.send_text") {
    validationInput.recipient = text(node.config?.recipient ?? input.recipient);
    validationInput.text = text(node.config?.text ?? input.text);
  }
  validateToolInput(validationInput, snapshot.inputSchema);
  const inputRedacted = redacted(validationInput);
  const inputHash = hash(inputRedacted);
  const idempotencyKey = workflowToolIdempotencyKey(run.workspace_id, run.id, node.id, toolKey);
  const existing = await sql.query<{ id: string; status: string; input_hash: string; output_redacted: unknown; error_code: string | null; error_message: string | null }>(`select id, status, input_hash, output_redacted, error_code, error_message from tool_executions where workspace_id = $1 and idempotency_key = $2 limit 1`, [run.workspace_id, idempotencyKey]);
  if (existing[0]) {
    if (existing[0].input_hash !== inputHash) throw new Error("TOOL_IDEMPOTENCY_CONFLICT");
    if (existing[0].status === "succeeded") return redacted(existing[0].output_redacted);
    if (["running", "requested", "approved"].includes(existing[0].status)) throw new Error("TOOL_EXECUTION_IN_PROGRESS");
    throw existingExecutionError(existing[0]);
  }
  const executionId = randomUUID();
  const inserted = await sql.query<{ id: string }>(`insert into tool_executions (id, workspace_id, run_id, tool_id, agent_id, agent_version_id, connector_instance_id, requested_by, status, input_hash, input_redacted, trace_id, idempotency_key, approved_by, approval_id, started_at) values ($1,$2,$3,$4,$5,$6,$7,'workflow','running',$8,$9::jsonb,$10,$11,$12,$13,current_timestamp) on conflict do nothing returning id`, [executionId, run.workspace_id, run.id, snapshot.id, agentId, agentVersionId, connection[0].id, inputHash, JSON.stringify(inputRedacted), run.correlation_id, idempotencyKey, approval?.approverId ?? null, approval?.id ?? null]);
  if (!inserted[0]) throw new Error("TOOL_EXECUTION_RACE");
  const startedAt = Date.now();
  try {
    const config = object(connection[0].config);
    if (snapshot.key === "mcp.call" && connection[0].provider === "mcp") {
      const mcpToolName = text(node.config?.mcpToolName);
      const allowedTools = Array.isArray(config.allowedTools) ? config.allowedTools.filter((item): item is string => typeof item === "string") : [];
      if (!mcpToolName || !allowedTools.includes(mcpToolName)) throw new Error("MCP_TOOL_NOT_ALLOWED");
      const runtime = new McpRuntime({ url: text(config.url), secretRef: connection[0].secret_ref, workspaceId: run.workspace_id, connectionId: connection[0].id, timeoutMs: snapshot.timeoutMs, getSecret: async () => "" }, resolvedSecretProvider);
      const result = await runtime.callTool(mcpToolName, object(node.config?.arguments ?? input));
      await runtime.close();
      const output = redacted(result);
      validateToolOutput(output, snapshot.outputSchema);
      await sql.query(`update tool_executions set status = 'succeeded', output_redacted = $1::jsonb, latency_ms = $2, finished_at = current_timestamp where id = $3`, [JSON.stringify(output), Date.now() - startedAt, executionId]);
      return output;
    }
    if (snapshot.key !== "evolution.send_text" || connection[0].provider !== "evolution") throw new Error("TOOL_ADAPTER_UNAVAILABLE");
    const connectorContext: ConnectorContext = { workspaceId: run.workspace_id, connectionId: connection[0].id, traceId: run.correlation_id, getSecret: (name) => resolvedSecretProvider.resolve(connection[0].secret_ref, { workspaceId: run.workspace_id, connectionId: connection[0].id }).then((value) => name === "api_key" ? value : value) };
    const result = await new EvolutionTextDispatcher().sendText({ baseUrl: text(config.baseUrl), instance: text(config.instance), recipient: text(node.config?.recipient ?? input.recipient), text: text(node.config?.text ?? input.text), timeoutMs: snapshot.timeoutMs }, connectorContext);
    if (result.status !== "sent") throw new Error(`TOOL_${result.code.toUpperCase()}`);
    const output: JsonObject = { status: result.status, latencyMs: result.latencyMs };
    if (result.providerMessageId) output.providerMessageId = result.providerMessageId;
    validateToolOutput(output, snapshot.outputSchema);
    await sql.query(`update tool_executions set status = 'succeeded', output_redacted = $1::jsonb, latency_ms = $2, provider_request_id = $3, finished_at = current_timestamp where id = $4`, [JSON.stringify(output), Date.now() - startedAt, result.providerMessageId ?? null, executionId]);
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : "TOOL_EXECUTION_FAILED";
    await sql.query(`update tool_executions set status = 'failed', error_code = $1, error_message = $2, latency_ms = $3, finished_at = current_timestamp where id = $4`, [message.slice(0, 120), message.slice(0, 500), Date.now() - startedAt, executionId]);
    throw error;
  }
}
