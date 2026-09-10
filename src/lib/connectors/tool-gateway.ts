import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";
import type { JsonObject } from "../multitenancy/server.ts";
import { awsSecretsManagerProvider, unavailableSecretProvider, type SecretProvider } from "./secrets.ts";
import { EvolutionTextDispatcher } from "./evolution-messaging.ts";
import type { ConnectorContext } from "./runtime.ts";
import type { ClaimedWorkflowRun } from "../workflows/queue.ts";
import type { WorkflowNode } from "../workflows/server.ts";

function object(value: unknown): JsonObject { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}; }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function redacted(value: unknown): JsonObject { const input = object(value); return Object.fromEntries(Object.entries(input).filter(([key]) => !/(token|secret|key|password|cookie)/i.test(key)).slice(0, 30)); }
function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(redacted(value))).digest("hex"); }

export function defaultSecretProvider(): SecretProvider {
  return process.env.NEXO_SECRETS_BACKEND === "aws" && process.env.AWS_REGION
    ? awsSecretsManagerProvider({ region: process.env.AWS_REGION })
    : unavailableSecretProvider();
}

export async function executeWorkflowTool(
  sql: Sql,
  node: WorkflowNode,
  input: JsonObject,
  run: ClaimedWorkflowRun,
  secretProvider: SecretProvider = defaultSecretProvider(),
): Promise<JsonObject> {
  const toolKey = text(node.config?.toolKey);
  if (!toolKey) throw new Error("WORKFLOW_TOOL_CONFIG_REQUIRED");
  const tool = await sql.query<{ id: string; risk_level: "read" | "write" | "destructive"; timeout_ms: number }>(`select id, risk_level, timeout_ms from tools where (workspace_id = $1 or workspace_id is null) and key = $2 and status = 'active' order by workspace_id nulls last, version desc limit 1`, [run.workspace_id, toolKey]);
  if (!tool[0]) throw new Error("TOOL_NOT_FOUND");
  if (tool[0].risk_level !== "read" && node.config?.approved !== true) throw new Error("TOOL_APPROVAL_REQUIRED");
  const connectionId = text(node.config?.connectionId);
  const connection = await sql.query<{ id: string; provider: string; secret_ref: string; config: unknown }>(`select id, provider, secret_ref, config from connections where id = $1 and workspace_id = $2 and deleted_at is null and status in ('connected','pending') limit 1`, [connectionId, run.workspace_id]);
  if (!connection[0]) throw new Error("TOOL_CONNECTION_NOT_FOUND");
  const executionId = randomUUID();
  const inputRedacted = redacted(input);
  await sql.query(`insert into tool_executions (id, workspace_id, run_id, tool_id, connector_instance_id, requested_by, status, input_hash, input_redacted, started_at) values ($1,$2,$3,$4,$5,'workflow','running',$6,$7::jsonb,current_timestamp)`, [executionId, run.workspace_id, run.id, tool[0].id, connection[0].id, hash(input), JSON.stringify(inputRedacted)]);
  const startedAt = Date.now();
  try {
    if (toolKey !== "evolution.send_text" || connection[0].provider !== "evolution") throw new Error("TOOL_ADAPTER_UNAVAILABLE");
    const config = object(connection[0].config);
    const connectorContext: ConnectorContext = { workspaceId: run.workspace_id, connectionId: connection[0].id, traceId: run.correlation_id, getSecret: (name) => secretProvider.resolve(connection[0].secret_ref, { workspaceId: run.workspace_id, connectionId: connection[0].id }).then((value) => name === "api_key" ? value : value) };
    const result = await new EvolutionTextDispatcher().sendText({ baseUrl: text(config.baseUrl), instance: text(config.instance), recipient: text(node.config?.recipient ?? input.recipient), text: text(node.config?.text ?? input.text), timeoutMs: tool[0].timeout_ms }, connectorContext);
    if (result.status !== "sent") throw new Error(`TOOL_${result.code.toUpperCase()}`);
    const output: JsonObject = { status: result.status, latencyMs: result.latencyMs };
    if (result.providerMessageId) output.providerMessageId = result.providerMessageId;
    await sql.query(`update tool_executions set status = 'succeeded', output_redacted = $1::jsonb, latency_ms = $2, provider_request_id = $3, finished_at = current_timestamp where id = $4`, [JSON.stringify(output), Date.now() - startedAt, result.providerMessageId ?? null, executionId]);
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : "TOOL_EXECUTION_FAILED";
    await sql.query(`update tool_executions set status = 'failed', error_code = $1, error_message = $2, latency_ms = $3, finished_at = current_timestamp where id = $4`, [message.slice(0, 120), message.slice(0, 500), Date.now() - startedAt, executionId]);
    throw error;
  }
}
