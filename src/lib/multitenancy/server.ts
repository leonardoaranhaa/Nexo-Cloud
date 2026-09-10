import { randomUUID } from "node:crypto";
import type { Sql } from "@/lib/db";

export type OrganizationRole = "owner" | "admin" | "member" | "billing";
export type WorkspaceRole = "workspace_admin" | "builder" | "operator" | "analyst" | "viewer";
export type WorkspacePermission = "read" | "write" | "publish" | "manage";
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
  knowledge: JsonObject;
  tools: JsonObject;
  metadata: JsonObject;
  createdAt: string;
  updatedAt: string;
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
      id,
      workspace_id as "workspaceId",
      name,
      slug,
      agent_type as "agentType",
      status,
      language,
      persona,
      welcome_message as "welcomeMessage",
      system_prompt as "systemPrompt",
      model_provider as "modelProvider",
      model_name as "modelName",
      temperature::float8 as temperature,
      max_tokens as "maxTokens",
      memory_window as "memoryWindow",
      knowledge,
      tools,
      metadata,
      created_at as "createdAt",
      updated_at as "updatedAt"
    from agents
    where workspace_id = ${workspaceId}
      and deleted_at is null
    order by updated_at desc
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
