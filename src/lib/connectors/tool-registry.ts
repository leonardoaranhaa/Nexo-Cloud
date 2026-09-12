import { createHash } from "node:crypto";
import type { Sql } from "../db.ts";
import type { JsonObject } from "../multitenancy/server.ts";

export type ToolRisk = "read" | "write" | "destructive";

export type RegisteredTool = {
  id: string;
  workspaceId: string | null;
  connectorDefinitionId: string | null;
  key: string;
  name: string;
  description: string;
  inputSchema: JsonObject;
  outputSchema: JsonObject;
  riskLevel: ToolRisk;
  timeoutMs: number;
  maxRetries: number;
  status: "active" | "disabled" | "review";
  version: number;
};

function object(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function schemaType(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function fail(path: string, message: string): never {
  throw new Error(`INVALID_ARGUMENTS:${path}:${message}`);
}

/** Small, deterministic JSON-schema subset for tool boundaries. */
export function validateToolInput(value: unknown, schema: JsonObject, path = "$", depth = 0): void {
  if (depth > 8) fail(path, "MAX_DEPTH");
  const type = schemaType(schema.type);
  if (type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) fail(path, "EXPECTED_OBJECT");
    const input = value as Record<string, unknown>;
    const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : [];
    for (const key of required) if (!(key in input)) fail(`${path}.${key}`, "REQUIRED");
    const properties = object(schema.properties);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(input)) if (!(key in properties)) fail(`${path}.${key}`, "UNKNOWN_FIELD");
    }
    for (const [key, child] of Object.entries(properties)) if (key in input && child && typeof child === "object" && !Array.isArray(child)) validateToolInput(input[key], object(child), `${path}.${key}`, depth + 1);
    return;
  }
  if (type === "array") {
    if (!Array.isArray(value)) fail(path, "EXPECTED_ARRAY");
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) fail(path, "MAX_ITEMS");
    if (typeof schema.minItems === "number" && value.length < schema.minItems) fail(path, "MIN_ITEMS");
    if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) value.forEach((item, index) => validateToolInput(item, object(schema.items), `${path}[${index}]`, depth + 1));
    return;
  }
  if (type === "string") {
    if (typeof value !== "string") fail(path, "EXPECTED_STRING");
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) fail(path, "MAX_LENGTH");
    if (typeof schema.minLength === "number" && value.length < schema.minLength) fail(path, "MIN_LENGTH");
  } else if (type === "number" || type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value) || (type === "integer" && !Number.isInteger(value))) fail(path, "EXPECTED_NUMBER");
    if (typeof schema.minimum === "number" && value < schema.minimum) fail(path, "MINIMUM");
    if (typeof schema.maximum === "number" && value > schema.maximum) fail(path, "MAXIMUM");
  } else if (type === "boolean" && typeof value !== "boolean") fail(path, "EXPECTED_BOOLEAN");
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => Object.is(item, value))) fail(path, "ENUM");
}

const schemaTypes = new Set(["object", "array", "string", "number", "integer", "boolean"]);

function validateSchemaNode(value: unknown, path: string, depth: number): JsonObject {
  if (depth > 8 || value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`INVALID_TOOL_SCHEMA:${path}:OBJECT_REQUIRED`);
  const schema = value as JsonObject;
  if (typeof schema.type !== "string" || !schemaTypes.has(schema.type)) throw new Error(`INVALID_TOOL_SCHEMA:${path}.type:UNSUPPORTED`);
  if (schema.type === "object") {
    const properties = schema.properties === undefined ? {} : schema.properties;
    if (properties === null || typeof properties !== "object" || Array.isArray(properties)) throw new Error(`INVALID_TOOL_SCHEMA:${path}.properties:OBJECT_REQUIRED`);
    for (const [key, child] of Object.entries(properties as Record<string, unknown>)) validateSchemaNode(child, `${path}.properties.${key}`, depth + 1);
    if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some((item) => typeof item !== "string"))) throw new Error(`INVALID_TOOL_SCHEMA:${path}.required:STRING_LIST_REQUIRED`);
  }
  if (schema.type === "array" && schema.items !== undefined) validateSchemaNode(schema.items, `${path}.items`, depth + 1);
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length > 20)) throw new Error(`INVALID_TOOL_SCHEMA:${path}.enum:INVALID`);
  return schema;
}

export function validateToolSchema(value: unknown): JsonObject {
  return validateSchemaNode(value, "$", 0);
}

export function validateToolOutput(value: unknown, schema: JsonObject, path = "$", depth = 0): void {
  validateToolInput(value, schema, path, depth);
}

export async function resolveTool(sql: Sql, workspaceId: string, key: string): Promise<RegisteredTool> {
  const rows = await sql.query<{
    id: string; workspace_id: string | null; connector_definition_id: string | null; key: string; name: string;
    description: string; input_schema: unknown; output_schema: unknown; risk_level: ToolRisk; timeout_ms: number;
    max_retries: number; status: RegisteredTool["status"]; version: number;
  }>(`select t.id, t.workspace_id, t.connector_definition_id, t.key, t.name, t.description, t.input_schema, t.output_schema, t.risk_level, t.timeout_ms, t.max_retries, t.status, t.version
      from tools t
      left join connector_definitions d on d.id = t.connector_definition_id
      where (t.workspace_id = $1 or t.workspace_id is null)
        and t.key = $2 and t.status = 'active'
        and (d.id is null or d.status = 'active')
      order by t.workspace_id nulls last, t.version desc limit 1`, [workspaceId, key]);
  const row = rows[0];
  if (!row) throw new Error("TOOL_NOT_FOUND");
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    connectorDefinitionId: row.connector_definition_id,
    key: row.key,
    name: row.name,
    description: row.description,
    inputSchema: object(row.input_schema),
    outputSchema: object(row.output_schema),
    riskLevel: row.risk_level,
    timeoutMs: row.timeout_ms,
    maxRetries: row.max_retries,
    status: row.status,
    version: row.version,
  };
}

export async function assertConnectionInWorkspace(sql: Sql, workspaceId: string, connectionId: string): Promise<void> {
  const rows = await sql.query<{ id: string }>(`select id from connections where id = $1 and workspace_id = $2 and deleted_at is null and status in ('connected','pending') limit 1`, [connectionId, workspaceId]);
  if (!rows[0]) throw new Error("TOOL_CONNECTION_NOT_FOUND");
}

export async function assertPublishedToolPermission(sql: Sql, workspaceId: string, agentVersionId: string, toolId: string): Promise<void> {
  const rows = await sql.query<{ id: string }>(`select p.id from agent_tool_permissions p join agent_versions v on v.id = p.agent_version_id join agents a on a.id = v.agent_id where p.agent_version_id = $1 and p.tool_id = $2 and p.enabled = true and a.workspace_id = $3 and v.status = 'published' limit 1`, [agentVersionId, toolId, workspaceId]);
  if (!rows[0]) throw new Error("TOOL_NOT_ALLOWED");
}

export function executionIdempotencyKey(workspaceId: string, executionId: string, operation: string): string {
  return createHash("sha256").update(`${workspaceId}:${executionId}:${operation}`).digest("hex");
}
