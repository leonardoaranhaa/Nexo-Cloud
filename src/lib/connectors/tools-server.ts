import { randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";
import type { JsonObject } from "../multitenancy/server.ts";
import { requireWorkspaceAccess } from "../multitenancy/server.ts";

export type WorkspaceTool = {
  id: string;
  workspaceId: string | null;
  connectorDefinitionId: string | null;
  key: string;
  name: string;
  description: string;
  inputSchema: JsonObject;
  outputSchema: JsonObject;
  riskLevel: "read" | "write" | "destructive";
  timeoutMs: number;
  maxRetries: number;
  status: "active" | "disabled" | "review";
  version: number;
};

export type AgentToolPermission = {
  id: string;
  agentVersionId: string;
  toolId: string;
  enabled: boolean;
  requireApproval: boolean;
  allowedScopes: JsonObject;
};

export type ToolExecutionApproval = {
  id: string;
  toolExecutionId: string;
  status: "pending" | "approved" | "rejected" | "expired";
  requestedBy: string;
  approverId: string | null;
  reason: string;
  expiresAt: string | null;
  decidedAt: string | null;
  createdAt: string;
};

export async function listWorkspaceTools(sql: Sql, userId: string, workspaceId: string): Promise<WorkspaceTool[]> {
  await requireWorkspaceAccess(sql, userId, workspaceId, "read");
  return sql.query<WorkspaceTool>(`select id, workspace_id as "workspaceId", connector_definition_id as "connectorDefinitionId", key, name, description, input_schema as "inputSchema", output_schema as "outputSchema", risk_level as "riskLevel", timeout_ms as "timeoutMs", max_retries as "maxRetries", status, version from tools where workspace_id = $1 or workspace_id is null order by key, workspace_id nulls last, version desc`, [workspaceId]);
}

async function assertAgentVersion(sql: Sql, workspaceId: string, agentVersionId: string, requireDraft = false): Promise<void> {
  const rows = await sql.query<{ id: string }>(`select v.id from agent_versions v join agents a on a.id = v.agent_id where v.id = $1 and a.workspace_id = $2 and (${requireDraft ? "v.status = 'draft'" : "true"}) limit 1`, [agentVersionId, workspaceId]);
  if (!rows[0]) throw new Error(requireDraft ? "AGENT_VERSION_DRAFT_REQUIRED" : "AGENT_VERSION_NOT_FOUND");
}

async function assertToolAvailable(sql: Sql, workspaceId: string, toolId: string): Promise<void> {
  const rows = await sql.query<{ id: string }>(`select id from tools where id = $1 and (workspace_id = $2 or workspace_id is null) and status in ('active','review') limit 1`, [toolId, workspaceId]);
  if (!rows[0]) throw new Error("TOOL_NOT_FOUND");
}

export async function listAgentToolPermissions(sql: Sql, userId: string, input: { workspaceId: string; agentVersionId: string }): Promise<AgentToolPermission[]> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  await assertAgentVersion(sql, input.workspaceId, input.agentVersionId);
  return sql.query<AgentToolPermission>(`select id, agent_version_id as "agentVersionId", tool_id as "toolId", enabled, require_approval as "requireApproval", allowed_scopes as "allowedScopes" from agent_tool_permissions where agent_version_id = $1 and workspace_id = $2 order by created_at`, [input.agentVersionId, input.workspaceId]);
}

export async function setAgentToolPermission(sql: Sql, userId: string, input: { workspaceId: string; agentVersionId: string; toolId: string; enabled: boolean; requireApproval?: boolean; allowedScopes?: JsonObject }): Promise<AgentToolPermission> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  await assertAgentVersion(sql, input.workspaceId, input.agentVersionId, true);
  await assertToolAvailable(sql, input.workspaceId, input.toolId);
  const id = randomUUID();
  const rows = await sql.query<AgentToolPermission>(`insert into agent_tool_permissions (id, workspace_id, agent_version_id, tool_id, enabled, require_approval, allowed_scopes) values ($1,$2,$3,$4,$5,$6,$7::jsonb) on conflict (agent_version_id, tool_id) do update set workspace_id = excluded.workspace_id, enabled = excluded.enabled, require_approval = excluded.require_approval, allowed_scopes = excluded.allowed_scopes returning id, agent_version_id as "agentVersionId", tool_id as "toolId", enabled, require_approval as "requireApproval", allowed_scopes as "allowedScopes"`, [id, input.workspaceId, input.agentVersionId, input.toolId, input.enabled, input.requireApproval === true, JSON.stringify(input.allowedScopes ?? {})]);
  if (!rows[0]) throw new Error("TOOL_PERMISSION_SAVE_FAILED");
  return rows[0];
}

export async function requestToolExecutionApproval(sql: Sql, userId: string, input: { workspaceId: string; toolExecutionId: string; reason?: string; expiresInMinutes?: number }): Promise<ToolExecutionApproval> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "operate");
  const execution = await sql.query<{ id: string }>(`update tool_executions set status = 'requested' where id = $1 and workspace_id = $2 and status in ('requested','running') returning id`, [input.toolExecutionId, input.workspaceId]);
  if (!execution[0]) throw new Error("TOOL_EXECUTION_NOT_FOUND");
  const approvalId = randomUUID();
  const minutes = Math.min(Math.max(Math.round(input.expiresInMinutes ?? 30), 5), 1440);
  const rows = await sql.query<ToolExecutionApproval>(`insert into tool_execution_approvals (id, workspace_id, tool_execution_id, requested_by, reason, expires_at) values ($1,$2,$3,$4,$5,current_timestamp + ($6 || ' minutes')::interval) on conflict (tool_execution_id) do update set status = 'pending', requested_by = excluded.requested_by, reason = excluded.reason, expires_at = excluded.expires_at, decided_at = null returning id, tool_execution_id as "toolExecutionId", status, requested_by as "requestedBy", approver_id as "approverId", reason, expires_at as "expiresAt", decided_at as "decidedAt", created_at as "createdAt"`, [approvalId, input.workspaceId, input.toolExecutionId, userId, (input.reason ?? "").slice(0, 500), minutes]);
  if (!rows[0]) throw new Error("TOOL_APPROVAL_CREATE_FAILED");
  return rows[0];
}

export async function decideToolExecutionApproval(sql: Sql, userId: string, input: { workspaceId: string; approvalId: string; decision: "approved" | "rejected"; reason?: string }): Promise<void> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "operate");
  const rows = await sql.query<{ tool_execution_id: string }>(`update tool_execution_approvals set status = $1, approver_id = $2, reason = $3, decided_at = current_timestamp where id = $4 and workspace_id = $5 and status = 'pending' and (expires_at is null or expires_at > current_timestamp) returning tool_execution_id`, [input.decision, userId, (input.reason ?? "").slice(0, 500), input.approvalId, input.workspaceId]);
  if (!rows[0]) throw new Error("TOOL_APPROVAL_NOT_FOUND");
  await sql.query(`update tool_executions set status = $1, approved_by = case when $1 = 'approved' then $2 else null end, error_code = case when $1 = 'rejected' then 'APPROVAL_REJECTED' else null end, error_message = case when $1 = 'rejected' then $3 else null end where id = $4 and workspace_id = $5 and status = 'requested'`, [input.decision === "approved" ? "approved" : "denied", userId, (input.reason ?? "").slice(0, 500), rows[0].tool_execution_id, input.workspaceId]);
}

export async function listToolExecutionApprovals(sql: Sql, userId: string, input: { workspaceId: string; status?: ToolExecutionApproval["status"] }): Promise<ToolExecutionApproval[]> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "operate");
  const params: unknown[] = [input.workspaceId];
  const filter = input.status ? ` and status = $2` : "";
  if (input.status) params.push(input.status);
  return sql.query<ToolExecutionApproval>(`select id, tool_execution_id as "toolExecutionId", status, requested_by as "requestedBy", approver_id as "approverId", reason, expires_at as "expiresAt", decided_at as "decidedAt", created_at as "createdAt" from tool_execution_approvals where workspace_id = $1${filter} order by created_at desc limit 100`, params);
}


export type RuntimeAuthorizedTool = {
  id: string;
  key: string;
  name: string;
  description: string;
  inputSchema: JsonObject;
  riskLevel: "read" | "write" | "destructive";
  requireApproval: boolean;
};

export async function listPublishedAgentTools(sql: Sql, workspaceId: string, agentId: string): Promise<RuntimeAuthorizedTool[]> {
  return sql.query<RuntimeAuthorizedTool>(`select t.id, t.key, t.name, t.description, t.input_schema as "inputSchema", t.risk_level as "riskLevel", p.require_approval as "requireApproval" from agent_versions v join agents a on a.id = v.agent_id and a.workspace_id = $1 join agent_tool_permissions p on p.agent_version_id = v.id and p.workspace_id = $1 and p.enabled = true join tools t on t.id = p.tool_id and (t.workspace_id = $1 or t.workspace_id is null) and t.status = 'active' where v.agent_id = $2 and v.status = 'published' order by t.key`, [workspaceId, agentId]);
}
