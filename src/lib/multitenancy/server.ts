import { randomUUID } from "node:crypto";
import type { Sql } from "@/lib/db";
import { connectorDefinitionForProvider } from "../connectors/registry.ts";
import type { SecretProvisioner } from "../connectors/secrets.ts";

export type OrganizationRole = "owner" | "admin" | "member" | "billing";
export type WorkspaceRole = "workspace_admin" | "builder" | "operator" | "analyst" | "viewer";
export type WorkspacePermission = "read" | "write" | "publish" | "manage";
export type ConnectionProvider = "evolution" | "meta" | "zapi";
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type WorkspaceRecord = {
  id: string;
  organizationId: string;
  organizationName: string;
  name: string;
  slug: string;
  environment: "development" | "staging" | "production";
  role: WorkspaceRole;
};

export type AgentRecord = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  agentType: string;
  status: "draft" | "active" | "paused" | "archived";
  language: "pt" | "en" | "es";
  persona: string;
  welcomeMessage: string;
  systemPrompt: string;
  modelProvider: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
  memoryWindow: number;
  connectionId: string | null;
  knowledge: JsonObject;
  tools: JsonObject;
  metadata: JsonObject;
  createdAt: string;
  updatedAt: string;
};

export type ConnectionRecord = {
  id: string;
  workspaceId: string;
  name: string;
  provider: ConnectionProvider;
  connectorDefinitionKey: string | null;
  status: "pending" | "connected" | "disconnected" | "error" | "revoked";
  healthStatus: "unknown" | "healthy" | "degraded" | "unhealthy";
  healthError: string | null;
  phone: string | null;
  instance: string | null;
  phoneNumberId: string | null;
  baseUrl: string | null;
  lastEventAt: string | null;
  createdAt: string;
};

export class WorkspaceAccessError extends Error {
  readonly code = "WORKSPACE_ACCESS_DENIED";
  readonly status = 403;

  constructor() {
    super("Workspace access denied");
    this.name = "WorkspaceAccessError";
  }
}

export class WorkspacePermissionError extends Error {
  readonly code = "WORKSPACE_PERMISSION_DENIED";
  readonly status = 403;

  constructor(permission: WorkspacePermission) {
    super(`Workspace permission denied: ${permission}`);
    this.name = "WorkspacePermissionError";
  }
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return slug || "workspace";
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized.slice(0, maxLength);
}

export function can(role: OrganizationRole | WorkspaceRole, permission: WorkspacePermission): boolean {
  if (role === "owner" || role === "admin" || role === "workspace_admin") return true;
  if (permission === "read") return true;
  if (permission === "write") return role === "builder";
  if (permission === "publish") return role === "builder" || role === "operator";
  return false;
}

export async function requireWorkspaceAccess(
  sql: Sql,
  userId: string,
  workspaceId: string,
  permission: WorkspacePermission,
): Promise<{ organizationId: string; role: WorkspaceRole }> {
  const rows = await sql<{
    organization_id: string;
    workspace_role: WorkspaceRole;
    organization_role: OrganizationRole | null;
  }>`
    select
      w.organization_id,
      wm.role as workspace_role,
      om.role as organization_role
    from workspaces w
    join workspace_memberships wm
      on wm.workspace_id = w.id
     and wm.user_id = ${userId}
    left join organization_memberships om
      on om.organization_id = w.organization_id
     and om.user_id = ${userId}
    where w.id = ${workspaceId}
      and w.status = 'active'
      and w.deleted_at is null
    limit 1
  `;

  const membership = rows[0];
  if (!membership) throw new WorkspaceAccessError();
  const effectiveRole = membership.organization_role === "owner" || membership.organization_role === "admin"
    ? membership.organization_role
    : membership.workspace_role;
  if (!can(effectiveRole, permission)) throw new WorkspacePermissionError(permission);

  return {
    organizationId: membership.organization_id,
    role: membership.organization_role === "owner" || membership.organization_role === "admin"
      ? "workspace_admin"
      : membership.workspace_role,
  };
}

export async function ensureDefaultWorkspace(sql: Sql, userId: string): Promise<WorkspaceRecord> {
  const existing = await sql<WorkspaceRecord>`
    select
      w.id,
      w.organization_id as "organizationId",
      o.name as "organizationName",
      w.name,
      w.slug,
      w.environment,
      wm.role
    from workspaces w
    join organizations o on o.id = w.organization_id
    join workspace_memberships wm
      on wm.workspace_id = w.id
     and wm.user_id = ${userId}
    where w.status = 'active'
      and w.deleted_at is null
    order by w.created_at asc
    limit 1
  `;
  if (existing[0]) return existing[0];

  const organizationId = randomUUID();
  const workspaceId = randomUUID();
  const organizationName = "Minha organização";
  const organizationSlug = `org-${userId.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 36) || "default"}`;

  await sql.query(
    `insert into organizations (id, name, slug, created_by)
     values ($1, $2, $3, $4)
     on conflict (slug) do nothing`,
    [organizationId, organizationName, organizationSlug, userId],
  );

  const organization = await sql.query<{ id: string; name: string }>(
    `select id, name from organizations where slug = $1 and deleted_at is null limit 1`,
    [organizationSlug],
  );
  const resolvedOrganizationId = organization[0]?.id ?? organizationId;
  const resolvedOrganizationName = organization[0]?.name ?? organizationName;

  await sql.query(
    `insert into organization_memberships (organization_id, user_id, role)
     values ($1, $2, 'owner')
     on conflict (organization_id, user_id) do update set role = 'owner', updated_at = current_timestamp`,
    [resolvedOrganizationId, userId],
  );

  const workspaceSlug = "development";
  await sql.query(
    `insert into workspaces (id, organization_id, name, slug, environment, created_by)
     values ($1, $2, $3, $4, 'development', $5)
     on conflict (organization_id, slug) do nothing`,
    [workspaceId, resolvedOrganizationId, "Desenvolvimento", workspaceSlug, userId],
  );

  const workspace = await sql.query<WorkspaceRecord>(
    `select
       w.id,
       w.organization_id as "organizationId",
       o.name as "organizationName",
       w.name,
       w.slug,
       w.environment,
       'workspace_admin' as role
     from workspaces w
     join organizations o on o.id = w.organization_id
     where w.organization_id = $1 and w.slug = $2 and w.deleted_at is null
     limit 1`,
    [resolvedOrganizationId, workspaceSlug],
  );
  if (!workspace[0]) throw new Error("WORKSPACE_BOOTSTRAP_FAILED");

  await sql.query(
    `insert into workspace_memberships (workspace_id, user_id, role)
     values ($1, $2, 'workspace_admin')
     on conflict (workspace_id, user_id) do update set role = 'workspace_admin', updated_at = current_timestamp`,
    [workspace[0].id, userId],
  );

  return { ...workspace[0], organizationName: resolvedOrganizationName, role: "workspace_admin" };
}

export async function listWorkspaces(sql: Sql, userId: string): Promise<WorkspaceRecord[]> {
  return sql<WorkspaceRecord>`
    select
      w.id,
      w.organization_id as "organizationId",
      o.name as "organizationName",
      w.name,
      w.slug,
      w.environment,
      case
        when om.role in ('owner', 'admin') then om.role
        else wm.role
      end as role
    from workspaces w
    join organizations o on o.id = w.organization_id
    join workspace_memberships wm
      on wm.workspace_id = w.id
     and wm.user_id = ${userId}
    left join organization_memberships om
      on om.organization_id = w.organization_id
     and om.user_id = ${userId}
    where w.status = 'active'
      and w.deleted_at is null
    order by o.created_at asc, w.created_at asc
  `;
}

export async function listAgents(sql: Sql, userId: string, workspaceId: string): Promise<AgentRecord[]> {
  await requireWorkspaceAccess(sql, userId, workspaceId, "read");
  return sql<AgentRecord>`
    select
      agents.id,
      agents.workspace_id as "workspaceId",
      agents.name,
      agents.slug,
      agents.agent_type as "agentType",
      agents.status,
      agents.language,
      agents.persona,
      agents.welcome_message as "welcomeMessage",
      agents.system_prompt as "systemPrompt",
      agents.model_provider as "modelProvider",
      agents.model_name as "modelName",
      agents.temperature::float8 as temperature,
      agents.max_tokens as "maxTokens",
      agents.memory_window as "memoryWindow",
      ac.connection_id as "connectionId",
      agents.knowledge,
      agents.tools,
      agents.metadata,
      agents.created_at as "createdAt",
      agents.updated_at as "updatedAt"
    from agents
    left join agent_connections ac
      on ac.agent_id = agents.id
     and ac.is_primary = true
    where agents.workspace_id = ${workspaceId}
      and agents.deleted_at is null
    order by agents.updated_at desc
  `;
}

export async function createAgent(
  sql: Sql,
  userId: string,
  input: {
    workspaceId: string;
    name: string;
    persona?: string;
    welcomeMessage?: string;
    systemPrompt?: string;
    agentType?: string;
  },
): Promise<{ id: string }> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const name = requiredText(input.name, "name", 120);
  const id = randomUUID();
  const slug = `${slugify(name)}-${id.slice(0, 8)}`;
  const persona = (input.persona ?? "").trim().slice(0, 500);
  const welcomeMessage = (input.welcomeMessage ?? "").trim().slice(0, 1000);
  const systemPrompt = (input.systemPrompt ?? "").trim().slice(0, 8000);
  const agentType = ["support", "sales", "marketing", "ads", "traffic", "operations", "custom"].includes(input.agentType ?? "")
    ? input.agentType
    : "support";

  await sql.query(
    `insert into agents (
      id, workspace_id, name, slug, agent_type, persona, welcome_message,
      system_prompt, created_by, updated_by
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
    [id, input.workspaceId, name, slug, agentType, persona, welcomeMessage, systemPrompt, userId],
  );

  await sql.query(
    `insert into agent_versions (id, agent_id, version_number, status, config, created_by)
     values ($1, $2, 1, 'draft', $3::jsonb, $4)`,
    [randomUUID(), id, JSON.stringify({ name, persona, welcomeMessage, systemPrompt, agentType }), userId],
  );

  return { id };
}

export async function updateAgent(
  sql: Sql,
  userId: string,
  input: {
    id: string;
    workspaceId: string;
    name: string;
    persona: string;
    welcomeMessage: string;
    systemPrompt: string;
    language: "pt" | "en" | "es";
    status: "draft" | "live" | "paused";
    temperature: number;
    maxTokens: number;
    memoryWindow: number;
    knowledge: JsonObject;
    tools: JsonObject;
    metadata?: JsonObject;
  },
): Promise<void> {
  const target = await sql.query<{ workspace_id: string }>(
    `select workspace_id from agents where id = $1 and deleted_at is null limit 1`,
    [input.id],
  );
  if (!target[0]) throw new Error("AGENT_NOT_FOUND");
  if (target[0].workspace_id !== input.workspaceId) throw new WorkspaceAccessError();
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const status = input.status === "live" ? "active" : input.status;
  await sql.query(
    `update agents set
      name = $2,
      persona = $3,
      welcome_message = $4,
      system_prompt = $5,
      language = $6,
      status = $7,
      temperature = $8,
      max_tokens = $9,
      memory_window = $10,
      knowledge = $11::jsonb,
      tools = $12::jsonb,
      metadata = $13::jsonb,
      updated_by = $14,
      updated_at = current_timestamp
    where id = $1 and workspace_id = $15 and deleted_at is null`,
    [
      input.id,
      requiredText(input.name, "name", 120),
      input.persona.slice(0, 500),
      input.welcomeMessage.slice(0, 1000),
      input.systemPrompt.slice(0, 8000),
      input.language,
      status,
      Math.min(Math.max(input.temperature, 0), 2),
      Math.min(Math.max(Math.round(input.maxTokens), 80), 16000),
      Math.min(Math.max(Math.round(input.memoryWindow), 0), 100),
      JSON.stringify(input.knowledge),
      JSON.stringify(input.tools),
      JSON.stringify(input.metadata ?? {}),
      userId,
      input.workspaceId,
    ],
  );
}

export async function archiveAgent(sql: Sql, userId: string, id: string): Promise<void> {
  const target = await sql.query<{ workspace_id: string }>(
    `select workspace_id from agents where id = $1 and deleted_at is null limit 1`,
    [id],
  );
  if (!target[0]) throw new Error("AGENT_NOT_FOUND");
  await requireWorkspaceAccess(sql, userId, target[0].workspace_id, "write");
  await sql.query(
    `update agents set status = 'archived', deleted_at = current_timestamp, updated_by = $2, updated_at = current_timestamp where id = $1`,
    [id, userId],
  );
}

function connectionSelect() {
  return `
    select
      c.id,
      c.workspace_id as "workspaceId",
      c.name,
      c.provider,
      d.key as "connectorDefinitionKey",
      c.status,
      c.health_status as "healthStatus",
      c.health_error as "healthError",
      c.config->>'phone' as phone,
      c.config->>'instance' as instance,
      c.config->>'phoneNumberId' as "phoneNumberId",
      c.config->>'baseUrl' as "baseUrl",
      c.last_healthcheck_at as "lastEventAt",
      c.created_at as "createdAt"
    from connections c
    left join connector_definitions d on d.id = c.connector_definition_id`;
}

export async function listConnections(sql: Sql, userId: string, workspaceId: string): Promise<ConnectionRecord[]> {
  await requireWorkspaceAccess(sql, userId, workspaceId, "read");
  return sql.query<ConnectionRecord>(
    `${connectionSelect()} where c.workspace_id = $1 and c.deleted_at is null order by c.created_at desc`,
    [workspaceId],
  );
}

export async function createConnection(
  sql: Sql,
  userId: string,
  input: {
    workspaceId: string;
    name: string;
    provider: ConnectionProvider;
    instance?: string;
    phoneNumberId?: string;
    baseUrl?: string;
  },
): Promise<{ id: string }> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const name = requiredText(input.name, "name", 120);
  const definition = connectorDefinitionForProvider(input.provider);
  if (!definition) throw new Error("INVALID_PROVIDER");
  const id = randomUUID();
  const config = JSON.stringify({
    instance: input.instance?.trim().slice(0, 160) || null,
    phoneNumberId: input.phoneNumberId?.trim().slice(0, 160) || null,
    baseUrl: input.baseUrl?.trim().slice(0, 240) || null,
  });
  await sql.query(
    `insert into connections (id, workspace_id, connector_definition_id, name, provider, status, secret_ref, config, created_by)
     values ($1, $2, $3, $4, $5, 'disconnected', $6, $7::jsonb, $8)`,
    [id, input.workspaceId, definition.id, name, input.provider, `nexo/${input.workspaceId}/${id}/api_key`, config, userId],
  );
  return { id };
}

export async function updateConnection(
  sql: Sql,
  userId: string,
  input: {
    id: string;
    workspaceId: string;
    name?: string;
    instance?: string;
    phoneNumberId?: string;
    baseUrl?: string;
    status?: ConnectionRecord["status"];
    phone?: string;
  },
): Promise<void> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const current = await sql.query<{ workspace_id: string; config: JsonObject }>(
    `select workspace_id, config from connections where id = $1 and deleted_at is null limit 1`,
    [input.id],
  );
  if (!current[0] || current[0].workspace_id !== input.workspaceId) throw new WorkspaceAccessError();
  const config = {
    ...(current[0].config ?? {}),
    ...(input.instance !== undefined ? { instance: input.instance.trim().slice(0, 160) || null } : {}),
    ...(input.phoneNumberId !== undefined ? { phoneNumberId: input.phoneNumberId.trim().slice(0, 160) || null } : {}),
    ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl.trim().slice(0, 240) || null } : {}),
    ...(input.phone !== undefined ? { phone: input.phone.trim().slice(0, 80) || null } : {}),
  };
  await sql.query(
    `update connections set
       name = coalesce($2, name),
       status = coalesce($3, status),
       config = $4::jsonb,
       last_healthcheck_at = case when $5 then current_timestamp else last_healthcheck_at end,
       updated_at = current_timestamp
     where id = $1 and workspace_id = $6 and deleted_at is null`,
    [input.id, input.name?.trim().slice(0, 120) || null, input.status ?? null, JSON.stringify(config), Boolean(input.status), input.workspaceId],
  );
}

export async function archiveConnection(sql: Sql, userId: string, id: string): Promise<void> {
  const current = await sql.query<{ workspace_id: string }>(
    `select workspace_id from connections where id = $1 and deleted_at is null limit 1`,
    [id],
  );
  if (!current[0]) throw new Error("CONNECTION_NOT_FOUND");
  await requireWorkspaceAccess(sql, userId, current[0].workspace_id, "write");
  await sql.query(`delete from agent_connections where connection_id = $1`, [id]);
  await sql.query(
    `update connections set status = 'revoked', deleted_at = current_timestamp, updated_at = current_timestamp where id = $1`,
    [id],
  );
}

export async function provisionEvolutionCredential(
  sql: Sql,
  userId: string,
  input: { workspaceId: string; connectionId: string; apiKey: string; baseUrl: string; instance: string },
  provisioner: SecretProvisioner,
): Promise<void> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "manage");
  const connection = await sql.query<{
    workspace_id: string;
    provider: ConnectionProvider;
    secret_ref: string | null;
    config: JsonObject;
  }>(
    `select workspace_id, provider, secret_ref, config
       from connections
      where id = $1 and workspace_id = $2 and deleted_at is null
      limit 1`,
    [input.connectionId, input.workspaceId],
  );
  if (!connection[0]) throw new Error("CONNECTION_NOT_FOUND");
  if (connection[0].provider !== "evolution") throw new Error("EVOLUTION_CONNECTION_REQUIRED");
  const apiKey = requiredText(input.apiKey, "apiKey", 512);
  const instance = requiredText(input.instance, "instance", 160);
  let baseUrl: URL;
  try {
    baseUrl = new URL(requiredText(input.baseUrl, "baseUrl", 240));
  } catch {
    throw new Error("INVALID_BASE_URL");
  }
  const local = baseUrl.hostname === "localhost" || baseUrl.hostname === "127.0.0.1" || baseUrl.hostname === "::1";
  if (baseUrl.protocol !== "https:" && !local) throw new Error("BASE_URL_MUST_USE_HTTPS");

  const secretRef = connection[0].secret_ref ?? `nexo/${input.workspaceId}/${input.connectionId}/api_key`;
  await provisioner.put(secretRef, apiKey, {
    workspaceId: input.workspaceId,
    connectionId: input.connectionId,
  });
  const config = {
    ...(connection[0].config ?? {}),
    baseUrl: baseUrl.toString().replace(/\/$/, ""),
    instance,
  };
  await sql.query(
    `update connections
        set secret_ref = $2,
            config = $3::jsonb,
            health_status = 'unknown',
            health_error = null,
            status = 'disconnected',
            updated_at = current_timestamp
      where id = $1 and workspace_id = $4 and deleted_at is null`,
    [input.connectionId, secretRef, JSON.stringify(config), input.workspaceId],
  );
}

export async function provisionEvolutionWebhookCredential(
  sql: Sql,
  userId: string,
  input: { workspaceId: string; connectionId: string; secret: string },
  provisioner: SecretProvisioner,
): Promise<void> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "manage");
  const connection = await sql.query<{ workspace_id: string; provider: ConnectionProvider }>(
    `select workspace_id, provider
       from connections
      where id = $1 and workspace_id = $2 and deleted_at is null
      limit 1`,
    [input.connectionId, input.workspaceId],
  );
  if (!connection[0]) throw new Error("CONNECTION_NOT_FOUND");
  if (connection[0].provider !== "evolution") throw new Error("EVOLUTION_CONNECTION_REQUIRED");
  const secret = requiredText(input.secret, "secret", 1024);
  const secretRef = `nexo/${input.workspaceId}/${input.connectionId}/webhook_jwt`;
  await provisioner.put(secretRef, secret, {
    workspaceId: input.workspaceId,
    connectionId: input.connectionId,
  });
  await sql.query(
    `update connections set webhook_secret_ref = $2, updated_at = current_timestamp
      where id = $1 and workspace_id = $3 and deleted_at is null`,
    [input.connectionId, secretRef, input.workspaceId],
  );
}

export async function bindAgentConnection(
  sql: Sql,
  userId: string,
  input: { agentId: string; workspaceId: string; connectionId: string | null },
): Promise<void> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const agent = await sql.query<{ workspace_id: string }>(
    `select workspace_id from agents where id = $1 and deleted_at is null limit 1`,
    [input.agentId],
  );
  if (!agent[0] || agent[0].workspace_id !== input.workspaceId) throw new WorkspaceAccessError();
  if (input.connectionId) {
    const connection = await sql.query<{ workspace_id: string }>(
      `select workspace_id from connections where id = $1 and deleted_at is null limit 1`,
      [input.connectionId],
    );
    if (!connection[0] || connection[0].workspace_id !== input.workspaceId) throw new WorkspaceAccessError();
  }
  await sql.query(`delete from agent_connections where agent_id = $1`, [input.agentId]);
  if (input.connectionId) {
    await sql.query(
      `insert into agent_connections (agent_id, connection_id, is_primary) values ($1, $2, true)`,
      [input.agentId, input.connectionId],
    );
  }
}
