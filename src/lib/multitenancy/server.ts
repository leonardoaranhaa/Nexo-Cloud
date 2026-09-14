import { randomUUID } from "node:crypto";
import type { Sql } from "@/lib/db";
import { connectorDefinitionForProvider } from "../connectors/registry.ts";
import type { SecretProvisioner } from "../connectors/secrets.ts";
import { validateEvolutionBaseUrl, validateEvolutionCredential, validateEvolutionInstance, validateEvolutionWebhookSecret } from "../connectors/evolution.ts";
import { pauseWhatsAppAgent, policyFromConnectionConfig } from "../connectors/whatsapp-safety.ts";

export type OrganizationRole = "owner" | "admin" | "member" | "billing";
export type WorkspaceRole = "workspace_admin" | "builder" | "operator" | "analyst" | "viewer";
export type WorkspacePermission = "read" | "write" | "publish" | "operate" | "manage";
export type ConnectionProvider = "evolution" | "meta" | "instagram" | "messenger" | "zapi";
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
  onboardingCompleted: boolean;
  onboardingGoal: string | null;
  onboardingTeamSize: string | null;
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
  developmentBlueprintId: string | null;
  developmentBlueprint: AgentDevelopmentBlueprint | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentDevelopmentBlueprint = {
  agentType: string;
  objectives: string[];
  capabilities: string[];
  guardrails: string[];
  testScenarios: string[];
  sourceBrief: string;
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
  accountId: string | null;
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
  if (permission === "operate") return role === "builder" || role === "operator";
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
       w.onboarding_completed as "onboardingCompleted",
       w.onboarding_goal as "onboardingGoal",
       w.onboarding_team_size as "onboardingTeamSize",
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
      w.onboarding_completed as "onboardingCompleted",
      w.onboarding_goal as "onboardingGoal",
      w.onboarding_team_size as "onboardingTeamSize",
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

export async function completeWorkspaceOnboarding(
  sql: Sql,
  userId: string,
  input: { workspaceId: string; name: string; goal: string; teamSize: string },
): Promise<void> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "manage");
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error("workspace name is required");
  await sql.query(
    `update workspaces
        set name = $1,
            onboarding_completed = true,
            onboarding_goal = $2,
            onboarding_team_size = $3,
            updated_at = current_timestamp
      where id = $4
        and status = 'active'
        and deleted_at is null`,
    [name, input.goal, input.teamSize, input.workspaceId],
  );
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
      adb.id as "developmentBlueprintId",
      case when adb.id is null then null else json_build_object(
        'agentType', adb.agent_type,
        'objectives', adb.objectives,
        'capabilities', adb.capabilities,
        'guardrails', adb.guardrails,
        'testScenarios', adb.test_scenarios,
        'sourceBrief', adb.source_brief
      ) end as "developmentBlueprint",
      agents.created_at as "createdAt",
      agents.updated_at as "updatedAt"
    from agents
    left join agent_connections ac
      on ac.agent_id = agents.id
     and ac.is_primary = true
    left join agent_development_blueprints adb
      on adb.agent_id = agents.id
     and adb.workspace_id = agents.workspace_id
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
  if (status === "active") {
    const published = await sql.query<{ id: string }>(
      `select av.id from agent_versions av
        where av.agent_id = $1 and av.status = 'published' limit 1`,
      [input.id],
    );
    if (!published[0]) throw new Error("AGENT_ACTIVE_REQUIRES_PUBLISHED_VERSION");
  }
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
  const next = await sql.query<{ version_number: number }>(
    `select coalesce(max(version_number), 0) + 1 as version_number from agent_versions where agent_id = $1`,
    [input.id],
  );
  const draftId = randomUUID();
  await sql.query(
    `insert into agent_versions (id, agent_id, version_number, status, config, created_by)
     values ($1, $2, $3, 'draft', $4::jsonb, $5)`,
    [draftId, input.id, Number(next[0]?.version_number ?? 1), JSON.stringify({ name: input.name, persona: input.persona, welcomeMessage: input.welcomeMessage, systemPrompt: input.systemPrompt, language: input.language, temperature: input.temperature, maxTokens: input.maxTokens, memoryWindow: input.memoryWindow, knowledge: input.knowledge, tools: input.tools, metadata: input.metadata ?? {} }), userId],
  );
  await copyLatestAgentToolPermissions(sql, input.workspaceId, input.id, draftId);
}

function boundedBlueprintList(value: unknown, maxItems: number, maxLength: number): string[] {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item ?? "").trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

export async function upsertAgentDevelopmentBlueprint(
  sql: Sql,
  userId: string,
  input: {
    workspaceId: string;
    agentId: string;
    agentType: string;
    objectives: unknown;
    capabilities: unknown;
    guardrails: unknown;
    testScenarios: unknown;
    sourceBrief?: string;
  },
): Promise<AgentDevelopmentBlueprint> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const target = await sql.query<{ workspace_id: string }>(
    `select workspace_id from agents where id = $1 and deleted_at is null limit 1`,
    [input.agentId],
  );
  if (!target[0] || target[0].workspace_id !== input.workspaceId) throw new WorkspaceAccessError();
  const blueprint: AgentDevelopmentBlueprint = {
    agentType: String(input.agentType || "custom").slice(0, 40),
    objectives: boundedBlueprintList(input.objectives, 8, 240),
    capabilities: boundedBlueprintList(input.capabilities, 12, 240),
    guardrails: boundedBlueprintList(input.guardrails, 12, 300),
    testScenarios: boundedBlueprintList(input.testScenarios, 10, 320),
    sourceBrief: String(input.sourceBrief ?? "").trim().slice(0, 2000),
  };
  await sql.query(
    `insert into agent_development_blueprints
      (id, workspace_id, agent_id, agent_type, objectives, capabilities, guardrails, test_scenarios, source_brief, created_by, updated_by)
     values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $10)
     on conflict (workspace_id, agent_id) do update set
       agent_type = excluded.agent_type,
       objectives = excluded.objectives,
       capabilities = excluded.capabilities,
       guardrails = excluded.guardrails,
       test_scenarios = excluded.test_scenarios,
       source_brief = excluded.source_brief,
       updated_by = excluded.updated_by,
       updated_at = current_timestamp`,
    [randomUUID(), input.workspaceId, input.agentId, blueprint.agentType, JSON.stringify(blueprint.objectives), JSON.stringify(blueprint.capabilities), JSON.stringify(blueprint.guardrails), JSON.stringify(blueprint.testScenarios), blueprint.sourceBrief, userId],
  );
  return blueprint;
}

export type AgentVersionRecord = {
  id: string;
  agentId: string;
  versionNumber: number;
  status: "draft" | "published" | "retired";
  createdBy: string;
  createdAt: string;
  publishedBy: string | null;
  publishedAt: string | null;
  retiredAt: string | null;
};

function agentVersionSelect() {
  return `
    select
      av.id,
      av.agent_id as "agentId",
      av.version_number as "versionNumber",
      av.status,
      av.created_by as "createdBy",
      av.created_at as "createdAt",
      av.published_by as "publishedBy",
      av.published_at as "publishedAt",
      av.retired_at as "retiredAt"
    from agent_versions av`;
}

async function copyAgentToolPermissions(sql: Sql, workspaceId: string, sourceVersionId: string, targetVersionId: string): Promise<void> {
  await sql.query(
    `insert into agent_tool_permissions (id, workspace_id, agent_version_id, tool_id, enabled, require_approval, allowed_scopes)
     select $1 || ':' || row_number() over ()::text, $2, $3, tool_id, enabled, require_approval, allowed_scopes
       from agent_tool_permissions
      where workspace_id = $2 and agent_version_id = $4
     on conflict (agent_version_id, tool_id) do update set
       enabled = excluded.enabled,
       require_approval = excluded.require_approval,
       allowed_scopes = excluded.allowed_scopes,
       workspace_id = excluded.workspace_id`,
    [randomUUID(), workspaceId, targetVersionId, sourceVersionId],
  );
}

async function copyLatestAgentToolPermissions(sql: Sql, workspaceId: string, agentId: string, targetVersionId: string): Promise<void> {
  const previous = await sql.query<{ id: string }>(
    `select id
       from agent_versions
      where agent_id = $1 and id <> $2 and status in ('draft', 'published')
      order by version_number desc
      limit 1`,
    [agentId, targetVersionId],
  );
  if (previous[0]) await copyAgentToolPermissions(sql, workspaceId, previous[0].id, targetVersionId);
}

export async function publishAgent(
  sql: Sql,
  userId: string,
  input: { workspaceId: string; agentId: string },
): Promise<AgentVersionRecord> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "publish");
  const agent = await sql.query<{
    id: string;
    workspace_id: string;
    name: string;
    persona: string;
    welcome_message: string;
    system_prompt: string;
    agent_type: string;
    language: "pt" | "en" | "es";
    model_provider: string;
    model_name: string;
    temperature: number;
    max_tokens: number;
    memory_window: number;
    knowledge: JsonObject;
    tools: JsonObject;
    metadata: JsonObject;
  }>(
    `select id, workspace_id, name, persona, welcome_message, system_prompt,
            agent_type, language, model_provider, model_name, temperature,
            max_tokens, memory_window, knowledge, tools, metadata
       from agents
      where id = $1 and workspace_id = $2 and deleted_at is null
      limit 1`,
    [input.agentId, input.workspaceId],
  );
  if (!agent[0]) throw new Error("AGENT_NOT_FOUND");
  if (!agent[0].model_provider.trim() || !agent[0].model_name.trim()) throw new Error("PUBLISH_MODEL_CONFIGURATION_REQUIRED");
  const published = await sql.query<{ id: string }>(
    `select id from agent_versions where agent_id = $1 and status = 'published' limit 1`,
    [input.agentId],
  );
  const latestDraft = await sql.query<{ id: string }>(
    `select id from agent_versions where agent_id = $1 and status = 'draft' order by version_number desc limit 1`,
    [input.agentId],
  );
  if (published[0]) {
    if (!latestDraft[0]) throw new Error("PUBLISH_HARNESS_REQUIRED");
    const approved = await sql.query<{ id: string }>(
      `select id from agent_evaluation_harness_runs
        where workspace_id = $1 and agent_id = $2 and candidate_version_id = $3
          and status = 'succeeded' and regression_count = 0 and approved_at is not null
        order by approved_at desc limit 1`,
      [input.workspaceId, input.agentId, latestDraft[0].id],
    );
    if (!approved[0]) throw new Error("PUBLISH_HARNESS_REQUIRED");
  }

  const readiness = await sql.query<{
    connection_status: string | null;
    health_status: string | null;
    test_scenarios: unknown;
  }>(
    `select c.status as connection_status,
            c.health_status,
            coalesce(adb.test_scenarios, '[]'::jsonb) as test_scenarios
       from agents a
       left join agent_connections ac on ac.agent_id = a.id and ac.is_primary = true
       left join connections c on c.id = ac.connection_id and c.workspace_id = a.workspace_id and c.deleted_at is null
       left join agent_development_blueprints adb on adb.agent_id = a.id and adb.workspace_id = a.workspace_id
      where a.id = $1 and a.workspace_id = $2 and a.deleted_at is null
      limit 1`,
    [input.agentId, input.workspaceId],
  );
  const gate = readiness[0];
  const scenarios = Array.isArray(gate?.test_scenarios) ? gate.test_scenarios.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  if (gate?.connection_status !== "connected" || gate.health_status !== "healthy") {
    throw new Error("PUBLISH_READINESS_CHANNEL_BLOCKED");
  }
  if (scenarios.length === 0) throw new Error("PUBLISH_READINESS_TESTS_REQUIRED");

  const versionId = latestDraft[0]?.id ?? randomUUID();
  const config = JSON.stringify({
    name: agent[0].name,
    persona: agent[0].persona,
    welcomeMessage: agent[0].welcome_message,
    systemPrompt: agent[0].system_prompt,
    agentType: agent[0].agent_type,
    language: agent[0].language,
    modelProvider: agent[0].model_provider,
    modelName: agent[0].model_name,
    temperature: agent[0].temperature,
    maxTokens: agent[0].max_tokens,
    memoryWindow: agent[0].memory_window,
    knowledge: agent[0].knowledge,
    tools: agent[0].tools,
    metadata: agent[0].metadata,
  });

  if (!latestDraft[0]) {
    const next = await sql.query<{ version_number: number }>(
      `select coalesce(max(version_number), 0) + 1 as version_number from agent_versions where agent_id = $1`,
      [input.agentId],
    );
    await sql.query(
      `insert into agent_versions (id, agent_id, version_number, status, config, created_by)
       values ($1, $2, $3, 'draft', $4::jsonb, $5)`,
      [versionId, input.agentId, Number(next[0]?.version_number ?? 1), config, userId],
    );
    await copyLatestAgentToolPermissions(sql, input.workspaceId, input.agentId, versionId);
  }
  await sql.query(
    `update agent_versions
        set status = 'retired', retired_at = current_timestamp
      where agent_id = $1 and status = 'published'`,
    [input.agentId],
  );
  await sql.query(
    `update agent_versions
        set status = 'published', published_by = $2, published_at = current_timestamp
      where id = $1 and agent_id = $3`,
    [versionId, userId, input.agentId],
  );
  await sql.query(
    `update agents set status = 'active', updated_by = $2, updated_at = current_timestamp
      where id = $1 and workspace_id = $3 and deleted_at is null`,
    [input.agentId, userId, input.workspaceId],
  );
  await sql.query(
    `update agent_installations
        set status = 'active', updated_at = current_timestamp
      where agent_id = $1 and workspace_id = $2 and status in ('draft', 'staging')`,
    [input.agentId, input.workspaceId],
  );

  const result = await sql.query<AgentVersionRecord>(
    `${agentVersionSelect()} where av.id = $1 and av.agent_id = $2`,
    [versionId, input.agentId],
  );
  if (!result[0]) throw new Error("AGENT_VERSION_PUBLISH_FAILED");
  return result[0];
}

export async function listAgentVersions(
  sql: Sql,
  userId: string,
  input: { workspaceId: string; agentId: string },
): Promise<AgentVersionRecord[]> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  const agent = await sql.query<{ id: string }>(
    `select id from agents where id = $1 and workspace_id = $2 and deleted_at is null limit 1`,
    [input.agentId, input.workspaceId],
  );
  if (!agent[0]) throw new Error("AGENT_NOT_FOUND");
  return sql.query<AgentVersionRecord>(
    `${agentVersionSelect()} where av.agent_id = $1 order by av.version_number desc`,
    [input.agentId],
  );
}

export async function rollbackAgent(
  sql: Sql,
  userId: string,
  input: { workspaceId: string; agentId: string; versionId: string },
): Promise<AgentVersionRecord> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "publish");
  const target = await sql.query<{ id: string; config: JsonObject }>(
    `select av.id, av.config
       from agent_versions av
       join agents a on a.id = av.agent_id
      where av.id = $1 and av.agent_id = $2 and a.workspace_id = $3
      limit 1`,
    [input.versionId, input.agentId, input.workspaceId],
  );
  if (!target[0]) throw new Error("AGENT_VERSION_NOT_FOUND");

  return publishAgentFromConfig(sql, userId, input, target[0].config);
}

async function publishAgentFromConfig(
  sql: Sql,
  userId: string,
  input: { workspaceId: string; agentId: string },
  config: JsonObject,
): Promise<AgentVersionRecord> {
  const next = await sql.query<{ version_number: number }>(
    `select coalesce(max(version_number), 0) + 1 as version_number
       from agent_versions where agent_id = $1`,
    [input.agentId],
  );
  const versionId = randomUUID();
  const versionNumber = Number(next[0]?.version_number ?? 1);
  await sql.query(
    `insert into agent_versions (id, agent_id, version_number, status, config, created_by)
     values ($1, $2, $3, 'draft', $4::jsonb, $5)`,
    [versionId, input.agentId, versionNumber, JSON.stringify(config), userId],
  );
  await copyLatestAgentToolPermissions(sql, input.workspaceId, input.agentId, versionId);
  await sql.query(
    `update agent_versions set status = 'retired', retired_at = current_timestamp
      where agent_id = $1 and status = 'published'`,
    [input.agentId],
  );
  await sql.query(
    `update agent_versions set status = 'published', published_by = $2, published_at = current_timestamp
      where id = $1 and agent_id = $3`,
    [versionId, userId, input.agentId],
  );
  await sql.query(
    `update agents set status = 'active', updated_by = $2, updated_at = current_timestamp
      where id = $1 and workspace_id = $3 and deleted_at is null`,
    [input.agentId, userId, input.workspaceId],
  );
  await sql.query(
    `update agent_installations
        set status = 'active', updated_at = current_timestamp
      where agent_id = $1 and workspace_id = $2 and status in ('draft', 'staging')`,
    [input.agentId, input.workspaceId],
  );
  const result = await sql.query<AgentVersionRecord>(
    `${agentVersionSelect()} where av.id = $1 and av.agent_id = $2`,
    [versionId, input.agentId],
  );
  if (!result[0]) throw new Error("AGENT_VERSION_ROLLBACK_FAILED");
  return result[0];
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

export type ConversationSummary = {
  id: string;
  workspaceId: string;
  agentId: string;
  agentName: string;
  connectionId: string;
  connectionName: string;
  externalContactId: string;
  channel: string;
  status: "open" | "closed" | "pending";
  assignedTo: string | null;
  handoffReason: string | null;
  handoffAt: string | null;
  updatedAt: string;
  lastMessageAt: string | null;
  lastMessageDirection: "inbound" | "outbound" | null;
  lastMessageText: string | null;
  unreadCount: number;
};

export type ConversationMessage = {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  senderType: "contact" | "agent" | "user" | "workflow" | "system";
  content: JsonObject;
  status: string;
  createdAt: string;
};

export async function listConversations(
  sql: Sql,
  userId: string,
  input: { workspaceId: string; status?: "open" | "pending" | "closed"; agentId?: string; search?: string },
): Promise<ConversationSummary[]> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  const params: unknown[] = [input.workspaceId];
  const filters = ["c.workspace_id = $1"];
  if (input.status) {
    params.push(input.status);
    filters.push(`c.status = $${params.length}`);
  }
  if (input.agentId) {
    params.push(input.agentId);
    filters.push(`c.agent_id = $${params.length}`);
  }
  if (input.search?.trim()) {
    params.push(`%${input.search.trim().slice(0, 120)}%`);
    filters.push(`c.external_contact_id ilike $${params.length}`);
  }
  return sql.query<ConversationSummary>(
    `select
       c.id,
       c.workspace_id as "workspaceId",
       c.agent_id as "agentId",
       a.name as "agentName",
       c.connection_id as "connectionId",
       co.name as "connectionName",
       c.external_contact_id as "externalContactId",
       c.channel,
       c.status,
       c.assigned_to as "assignedTo",
       c.handoff_reason as "handoffReason",
       c.handoff_at as "handoffAt",
       c.updated_at as "updatedAt",
       lm.created_at as "lastMessageAt",
       lm.direction as "lastMessageDirection",
       coalesce(lm.content->>'text', lm.content->>'caption') as "lastMessageText",
       coalesce(unread.unread_count, 0)::int as "unreadCount"
     from conversations c
     join agents a on a.id = c.agent_id and a.workspace_id = c.workspace_id
     join connections co on co.id = c.connection_id and co.workspace_id = c.workspace_id
     left join lateral (
       select m.created_at, m.direction, m.content
         from messages m where m.conversation_id = c.id
        order by m.created_at desc limit 1
     ) lm on true
     left join lateral (
       select count(*)::int as unread_count
         from messages m
        where m.conversation_id = c.id and m.direction = 'inbound' and m.status = 'received'
     ) unread on true
     where ${filters.join(" and ")}
     order by coalesce(lm.created_at, c.updated_at) desc
     limit 100`,
    params,
  );
}

export async function listConversationMessages(
  sql: Sql,
  userId: string,
  input: { workspaceId: string; conversationId: string },
): Promise<ConversationMessage[]> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  const conversation = await sql.query<{ id: string }>(
    `select id from conversations where id = $1 and workspace_id = $2 limit 1`,
    [input.conversationId, input.workspaceId],
  );
  if (!conversation[0]) throw new Error("CONVERSATION_NOT_FOUND");
  return sql.query<ConversationMessage>(
    `select id, conversation_id as "conversationId", direction, sender_type as "senderType",
            content, status, created_at as "createdAt"
       from messages where conversation_id = $1 and workspace_id = $2
      order by created_at asc limit 500`,
    [input.conversationId, input.workspaceId],
  );
}

export async function markConversationRead(
  sql: Sql,
  userId: string,
  input: { workspaceId: string; conversationId: string },
): Promise<void> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  const result = await sql.query<{ id: string }>(
    `select id from conversations where id = $1 and workspace_id = $2 limit 1`,
    [input.conversationId, input.workspaceId],
  );
  if (!result[0]) throw new Error("CONVERSATION_NOT_FOUND");
  await sql.query(
    `update messages set status = 'read', updated_at = current_timestamp
      where conversation_id = $1 and workspace_id = $2 and direction = 'inbound' and status = 'received'`,
    [input.conversationId, input.workspaceId],
  );
}

export async function updateConversationHandoff(
  sql: Sql,
  userId: string | null,
  input: { workspaceId: string; conversationId: string; action: "assign" | "release" | "resume" | "close"; reason?: string },
): Promise<{ status: "pending" | "open" | "closed" }> {
  if (userId) await requireWorkspaceAccess(sql, userId, input.workspaceId, "operate");
  const status = input.action === "assign" ? "pending" : input.action === "close" ? "closed" : "open";
  const conversation = await sql.query<{ id: string; connection_id: string }>(
    `select id, connection_id from conversations where id = $1 and workspace_id = $2 limit 1`,
    [input.conversationId, input.workspaceId],
  );
  if (!conversation[0]) throw new Error("CONVERSATION_NOT_FOUND");
  const updated = await sql.query<{ status: "pending" | "open" | "closed" }>(
    `update conversations set
       status = $3,
       assigned_to = case when $4 = 'assign' then $2 when $4 in ('release', 'resume', 'close') then null else assigned_to end,
       handoff_reason = case when $4 = 'assign' then nullif(left($5, 500), '') else handoff_reason end,
       handoff_at = case when $4 = 'assign' then current_timestamp else handoff_at end,
       closed_at = case when $4 = 'close' then current_timestamp when $4 = 'resume' then null else closed_at end,
       updated_at = current_timestamp
     where id = $1 and workspace_id = $6
       and (($4 = 'assign' and status in ('open', 'pending'))
         or ($4 = 'release' and status = 'pending')
         or ($4 = 'resume' and status = 'pending')
         or ($4 = 'close' and status in ('pending', 'open')))
     returning status`,
    [input.conversationId, userId, status, input.action, input.reason?.trim() ?? "", input.workspaceId],
  );
  if (!updated[0]) throw new Error("HANDOFF_INVALID_TRANSITION");
  const connection = await sql.query<{ config: Record<string, unknown> | null }>(
    `select config from connections where id = $1 and workspace_id = $2 limit 1`,
    [conversation[0].connection_id, input.workspaceId],
  );
  if (connection[0]) {
    if (input.action === "assign") {
      await pauseWhatsAppAgent(sql, {
        workspaceId: input.workspaceId,
        connectionId: conversation[0].connection_id,
        pauseMinutes: policyFromConnectionConfig(connection[0].config).handoffPauseMinutes,
      });
    } else if (input.action === "resume" || input.action === "release") {
      await sql.query(`update connections set agent_pause_until = null, updated_at = current_timestamp where id = $1 and workspace_id = $2`, [conversation[0].connection_id, input.workspaceId]);
    }
  }
  return updated[0];
}

export async function assertConversationAccess(
  sql: Sql,
  userId: string,
  input: { workspaceId: string; conversationId: string },
): Promise<{ agentId: string; connectionId: string; externalContactId: string }> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const rows = await sql.query<{ agentId: string; connectionId: string; externalContactId: string }>(
    `select agent_id as "agentId", connection_id as "connectionId", external_contact_id as "externalContactId"
       from conversations where id = $1 and workspace_id = $2 limit 1`,
    [input.conversationId, input.workspaceId],
  );
  if (!rows[0]) throw new Error("CONVERSATION_NOT_FOUND");
  return rows[0];
}

export type AgentRuntimeExecutionRecord = {
  id: string;
  workspaceId: string;
  jobId: string;
  agentId: string;
  agentName: string;
  conversationId: string;
  externalContactId: string;
  traceId: string;
  attemptCount: number;
  status: "running" | "succeeded" | "failed" | "skipped";
  reason: string | null;
  aiProvider: string | null;
  modelName: string | null;
  durationMs: number | null;
  historyCount: number;
  inputChars: number;
  outputChars: number;
  errorCode: string | null;
  errorMessage: string | null;
  steps: JsonValue[];
  createdAt: string;
  completedAt: string | null;
};

export async function listAgentRuntimeExecutions(
  sql: Sql,
  userId: string,
  input: { workspaceId: string; status?: "running" | "succeeded" | "failed" | "skipped"; agentId?: string },
): Promise<AgentRuntimeExecutionRecord[]> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  const params: unknown[] = [input.workspaceId];
  const filters = ["e.workspace_id = $1"];
  if (input.status) {
    params.push(input.status);
    filters.push(`e.status = $${params.length}`);
  }
  if (input.agentId) {
    params.push(input.agentId);
    filters.push(`e.agent_id = $${params.length}`);
  }
  return sql.query<AgentRuntimeExecutionRecord>(
    `select e.id, e.workspace_id as "workspaceId", e.job_id as "jobId", e.agent_id as "agentId",
            a.name as "agentName", e.conversation_id as "conversationId",
            c.external_contact_id as "externalContactId", e.trace_id as "traceId",
            e.attempt_count as "attemptCount", e.status, e.reason,
            e.ai_provider as "aiProvider", e.model_name as "modelName",
            e.duration_ms as "durationMs", e.history_count as "historyCount",
            e.input_chars as "inputChars", e.output_chars as "outputChars",
            e.error_code as "errorCode", e.error_message as "errorMessage",
            e.steps, e.created_at as "createdAt", e.completed_at as "completedAt"
       from agent_runtime_execution_logs e
       join agents a on a.id = e.agent_id and a.workspace_id = e.workspace_id
       join conversations c on c.id = e.conversation_id and c.workspace_id = e.workspace_id
      where ${filters.join(" and ")}
      order by e.created_at desc limit 100`,
    params,
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
      c.config->>'accountId' as "accountId",
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
    accountId?: string;
    baseUrl?: string;
  },
): Promise<{ id: string }> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const name = requiredText(input.name, "name", 120);
  const definition = connectorDefinitionForProvider(input.provider);
  if (!definition) throw new Error("INVALID_PROVIDER");
  if (input.provider === "evolution" && (input.baseUrl !== undefined || input.instance !== undefined)) {
    validateEvolutionBaseUrl(input.baseUrl);
    validateEvolutionInstance(input.instance);
  }
  const id = randomUUID();
  const instance = input.provider === "evolution"
    ? (input.instance?.trim() || `${slugify(name)}-${id.slice(0, 8)}`)
    : input.instance?.trim();
  const config = JSON.stringify({
    instance: instance?.slice(0, 160) || null,
    phoneNumberId: input.phoneNumberId?.trim().slice(0, 160) || null,
    accountId: input.accountId?.trim().slice(0, 160) || null,
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
    accountId?: string;
    baseUrl?: string;
    status?: ConnectionRecord["status"];
    phone?: string;
  },
): Promise<void> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const current = await sql.query<{ workspace_id: string; provider: ConnectionProvider; config: JsonObject }>(
    `select workspace_id, provider, config from connections where id = $1 and deleted_at is null limit 1`,
    [input.id],
  );
  if (!current[0] || current[0].workspace_id !== input.workspaceId) throw new WorkspaceAccessError();
  if (current[0].provider === "evolution" && (input.baseUrl !== undefined || input.instance !== undefined)) {
    validateEvolutionBaseUrl(input.baseUrl ?? current[0].config?.baseUrl);
    validateEvolutionInstance(input.instance ?? current[0].config?.instance);
  }
  const config = {
    ...(current[0].config ?? {}),
    ...(input.instance !== undefined ? { instance: input.instance.trim().slice(0, 160) || null } : {}),
    ...(input.phoneNumberId !== undefined ? { phoneNumberId: input.phoneNumberId.trim().slice(0, 160) || null } : {}),
    ...(input.accountId !== undefined ? { accountId: input.accountId.trim().slice(0, 160) || null } : {}),
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
  const validated = validateEvolutionCredential(input);

  const secretRef = connection[0].secret_ref ?? `nexo/${input.workspaceId}/${input.connectionId}/api_key`;
  await provisioner.put(secretRef, validated.apiKey, {
    workspaceId: input.workspaceId,
    connectionId: input.connectionId,
  });
  const config = {
    ...(connection[0].config ?? {}),
    baseUrl: validated.baseUrl,
    instance: validated.instance,
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
  const secret = validateEvolutionWebhookSecret(input.secret);
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
