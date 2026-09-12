import { randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";
import { requireWorkspaceAccess } from "../multitenancy/server.ts";
import type { JsonObject, JsonValue } from "../multitenancy/server.ts";

export type MarketplaceProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  providerType: "nexo" | "partner";
  riskLevel: "low" | "medium" | "high";
  versionId: string;
  versionNumber: number;
  manifest: JsonObject;
  changelog: string;
  offerId: string;
  offerMode: "trial" | "subscription" | "license" | "rental";
  priceCents: number;
  currency: string;
};

export type MarketplaceInstallation = {
  id: string;
  workspaceId: string;
  productId: string;
  productName: string;
  offerMode: "trial" | "subscription" | "license" | "rental" | "internal";
  agentId: string;
  agentName: string;
  versionId: string;
  versionNumber: number;
  latestVersionId: string;
  latestVersionNumber: number;
  updateAvailable: boolean;
  rollbackAvailable: boolean;
  revisionCount: number;
  lastRevisionAt: string | null;
  status: "draft" | "staging" | "active" | "paused" | "uninstalled";
  customizations: JsonObject;
};

export type MarketplaceInstallationRevision = {
  id: string;
  installationId: string;
  workspaceId: string;
  fromVersionId: string;
  fromVersionNumber: number;
  toVersionId: string;
  toVersionNumber: number;
  action: "update" | "rollback";
  createdBy: string;
  createdAt: string;
};

export type MarketplaceInstallationUpdatePlan = {
  installationId: string;
  available: boolean;
  currentVersionId: string;
  currentVersionNumber: number;
  targetVersionId: string;
  targetVersionNumber: number;
  changelog: string;
  changedFields: string[];
  protectedChanges: string[];
  preservedCustomizations: string[];
  requiresStaging: true;
};

const productSelect = `
  select p.id, p.slug, p.name, p.description, p.category,
         p.provider_type as "providerType", p.risk_level as "riskLevel",
         latest.id as "versionId", latest.version_number as "versionNumber",
         latest.manifest, latest.changelog,
         offer.id as "offerId", offer.mode as "offerMode", offer.price_cents as "priceCents", offer.currency
    from agent_products p
    join lateral (
      select v.id, v.version_number, v.manifest, v.changelog
        from agent_product_versions v
       where v.product_id = p.id and v.status = 'published'
       order by v.version_number desc
       limit 1
    ) latest on true
    join lateral (
      select o.id, o.mode, o.price_cents, o.currency
        from agent_product_offers o
       where o.product_id = p.id and o.version_id = latest.id and o.status = 'active'
       order by o.price_cents asc, o.created_at asc
       limit 1
    ) offer on true
`;

const installationSelect = `
  select i.id, i.workspace_id as "workspaceId", i.product_id as "productId",
         p.name as "productName", i.agent_id as "agentId", a.name as "agentName",
         entitlement.mode as "offerMode",
         i.version_id as "versionId", current_version.version_number as "versionNumber",
         latest.id as "latestVersionId", latest.version_number as "latestVersionNumber",
         (latest.version_number > current_version.version_number) as "updateAvailable",
         exists (
           select 1 from agent_installation_revisions rollback_revision
            where rollback_revision.installation_id = i.id
              and rollback_revision.workspace_id = i.workspace_id
              and rollback_revision.action = 'update'
              and rollback_revision.to_version_id = i.version_id
         ) as "rollbackAvailable",
         (select count(*)::int from agent_installation_revisions revision_count
           where revision_count.installation_id = i.id and revision_count.workspace_id = i.workspace_id) as "revisionCount",
         (select max(last_revision.created_at) from agent_installation_revisions last_revision
           where last_revision.installation_id = i.id and last_revision.workspace_id = i.workspace_id) as "lastRevisionAt",
         i.status, i.customizations
    from agent_installations i
    join agent_products p on p.id = i.product_id
    join agents a on a.id = i.agent_id and a.workspace_id = i.workspace_id
    join agent_entitlements entitlement on entitlement.id = i.entitlement_id and entitlement.workspace_id = i.workspace_id
    join agent_product_versions current_version on current_version.id = i.version_id
    join lateral (
      select v.id, v.version_number
        from agent_product_versions v
       where v.product_id = i.product_id and v.status = 'published'
       order by v.version_number desc
       limit 1
    ) latest on true
`;

function stringValue(value: JsonValue | undefined, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: JsonValue | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function objectValue(value: JsonValue | undefined): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function sameJson(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function editableFields(manifest: JsonObject): Set<string> {
  return new Set(Array.isArray(manifest.editableFields) ? manifest.editableFields.filter((value): value is string => typeof value === "string") : []);
}

function protectedFields(manifest: JsonObject): Set<string> {
  return new Set(Array.isArray(manifest.protectedComponents) ? manifest.protectedComponents.filter((value): value is string => typeof value === "string") : []);
}

function manifestStringList(manifest: JsonObject, key: string): string[] {
  return Array.isArray(manifest[key])
    ? manifest[key].filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
}

function manifestToolKeys(manifest: JsonObject): string[] {
  return [...new Set(manifestStringList(manifest, "requiredTools"))];
}

function manifestDiff(currentManifest: JsonObject, nextManifest: JsonObject) {
  const ignored = new Set(["editableFields", "protectedComponents"]);
  const fields = new Set([...Object.keys(currentManifest), ...Object.keys(nextManifest)]);
  const changedFields = [...fields].filter((field) => !ignored.has(field) && !sameJson(currentManifest[field], nextManifest[field]));
  const protectedSet = protectedFields(currentManifest);
  const nextProtectedSet = protectedFields(nextManifest);
  const protectedChanges = changedFields.filter((field) => protectedSet.has(field) || nextProtectedSet.has(field) || !editableFields(currentManifest).has(field));
  return { changedFields, protectedChanges };
}

function mergeManifestWithCustomizations(manifest: JsonObject, customizations: JsonObject): JsonObject {
  const editable = editableFields(manifest);
  const merged: JsonObject = { ...manifest };
  for (const [key, value] of Object.entries(customizations)) {
    if (editable.has(key)) merged[key] = value;
  }
  return merged;
}

async function currentAgentConfig(sql: Sql, agentId: string, workspaceId: string): Promise<JsonObject> {
  const rows = await sql.query<{
    name: string;
    persona: string;
    welcome_message: string;
    system_prompt: string;
    agent_type: string;
    language: string;
    model_provider: string;
    model_name: string;
    temperature: number;
    max_tokens: number;
    memory_window: number;
    knowledge: JsonObject;
    tools: JsonObject;
    metadata: JsonObject;
  }>(
    `select name, persona, welcome_message, system_prompt, agent_type, language,
            model_provider, model_name, temperature, max_tokens, memory_window,
            knowledge, tools, metadata
       from agents where id = $1 and workspace_id = $2 and deleted_at is null limit 1`,
    [agentId, workspaceId],
  );
  const agent = rows[0];
  if (!agent) throw new Error("MARKETPLACE_AGENT_NOT_FOUND");
  return {
    name: agent.name,
    persona: agent.persona,
    welcomeMessage: agent.welcome_message,
    systemPrompt: agent.system_prompt,
    agentType: agent.agent_type,
    language: agent.language,
    modelProvider: agent.model_provider,
    modelName: agent.model_name,
    temperature: agent.temperature,
    maxTokens: agent.max_tokens,
    memoryWindow: agent.memory_window,
    knowledge: agent.knowledge,
    tools: agent.tools,
    metadata: agent.metadata,
  };
}

async function stageAgentConfig(sql: Sql, userId: string, workspaceId: string, agentId: string, config: JsonObject): Promise<void> {
  const currentDraft = await sql.query<{ id: string }>(
    `select id from agent_versions where agent_id = $1 and status = 'draft' order by version_number desc limit 1`,
    [agentId],
  );
  const configJson = JSON.stringify(config);
  if (currentDraft[0]) {
    await sql.query(`update agent_versions set config = $1::jsonb where id = $2 and agent_id = $3`, [configJson, currentDraft[0].id, agentId]);
  } else {
    const next = await sql.query<{ version_number: number }>(`select coalesce(max(version_number), 0) + 1 as version_number from agent_versions where agent_id = $1`, [agentId]);
    await sql.query(
      `insert into agent_versions (id, agent_id, version_number, status, config, created_by) values ($1, $2, $3, 'draft', $4::jsonb, $5)`,
      [randomUUID(), agentId, Number(next[0]?.version_number ?? 1), configJson, userId],
    );
  }
  await sql.query(
    `update agents set name = $1, persona = $2, welcome_message = $3, system_prompt = $4,
            agent_type = $5, language = $6, model_provider = $7, model_name = $8,
            temperature = $9, max_tokens = $10, memory_window = $11,
            knowledge = $12::jsonb, tools = $13::jsonb, metadata = $14::jsonb,
            updated_by = $15, updated_at = current_timestamp
       where id = $16 and workspace_id = $17 and deleted_at is null`,
    [
      stringValue(config.name), stringValue(config.persona), stringValue(config.welcomeMessage), stringValue(config.systemPrompt),
      stringValue(config.agentType, "support"), stringValue(config.language, "pt"), stringValue(config.modelProvider, "internal"), stringValue(config.modelName, "default"),
      numberValue(config.temperature, 0.2), numberValue(config.maxTokens, 800), numberValue(config.memoryWindow, 12),
      JSON.stringify(objectValue(config.knowledge)), JSON.stringify(objectValue(config.tools)), JSON.stringify(objectValue(config.metadata)),
      userId, agentId, workspaceId,
    ],
  );
}

async function _copyAgentToolPermissions(sql: Sql, workspaceId: string, sourceVersionId: string, targetVersionId: string): Promise<void> {
  await sql.query(
    `insert into agent_tool_permissions (id, workspace_id, agent_version_id, tool_id, enabled, require_approval, allowed_scopes)
     select $1 || ':' || row_number() over (), $2, $3, tool_id, enabled, require_approval, allowed_scopes
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

export async function listMarketplaceProducts(sql: Sql): Promise<MarketplaceProduct[]> {
  return sql.query<MarketplaceProduct>(`${productSelect} where p.status = 'published' order by p.name asc`);
}

export async function getMarketplaceProduct(sql: Sql, productId: string): Promise<MarketplaceProduct> {
  const rows = await sql.query<MarketplaceProduct>(`${productSelect} where p.id = $1 and p.status = 'published' limit 1`, [productId]);
  if (!rows[0]) throw new Error("MARKETPLACE_PRODUCT_NOT_FOUND");
  return rows[0];
}

export async function listMarketplaceInstallations(sql: Sql, userId: string, workspaceId: string): Promise<MarketplaceInstallation[]> {
  await requireWorkspaceAccess(sql, userId, workspaceId, "read");
  return sql.query<MarketplaceInstallation>(`${installationSelect} where i.workspace_id = $1 and i.status <> 'uninstalled' order by i.updated_at desc`, [workspaceId]);
}

export async function getMarketplaceInstallation(sql: Sql, userId: string, input: { workspaceId: string; installationId: string }): Promise<MarketplaceInstallation> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  const rows = await sql.query<MarketplaceInstallation>(`${installationSelect} where i.id = $1 and i.workspace_id = $2 and i.status <> 'uninstalled' limit 1`, [input.installationId, input.workspaceId]);
  if (!rows[0]) throw new Error("MARKETPLACE_INSTALLATION_NOT_FOUND");
  return rows[0];
}

export async function listMarketplaceInstallationRevisions(sql: Sql, userId: string, input: { workspaceId: string; installationId: string }): Promise<MarketplaceInstallationRevision[]> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  const rows = await sql<MarketplaceInstallationRevision & { fromVersionNumber: number; toVersionNumber: number }>`
    select r.id, r.installation_id as "installationId", r.workspace_id as "workspaceId",
           r.from_version_id as "fromVersionId", from_version.version_number as "fromVersionNumber",
           r.to_version_id as "toVersionId", to_version.version_number as "toVersionNumber",
           r.action, r.created_by as "createdBy", r.created_at as "createdAt"
      from agent_installation_revisions r
      join agent_product_versions from_version on from_version.id = r.from_version_id
      join agent_product_versions to_version on to_version.id = r.to_version_id
     where r.installation_id = ${input.installationId} and r.workspace_id = ${input.workspaceId}
     order by r.created_at desc
  `;
  return rows;
}

export async function getMarketplaceInstallationUpdatePlan(sql: Sql, userId: string, input: { workspaceId: string; installationId: string }): Promise<MarketplaceInstallationUpdatePlan> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  const installation = await getMarketplaceInstallation(sql, userId, input);
  const product = await getMarketplaceProduct(sql, installation.productId);
  const currentRows = await sql.query<{ manifest: JsonObject }>(`select manifest from agent_product_versions where id = $1 and product_id = $2 limit 1`, [installation.versionId, installation.productId]);
  const currentManifest = currentRows[0]?.manifest ?? {};
  const diff = manifestDiff(currentManifest, product.manifest);
  const editable = editableFields(currentManifest);
  return {
    installationId: installation.id,
    available: product.versionNumber > installation.versionNumber,
    currentVersionId: installation.versionId,
    currentVersionNumber: installation.versionNumber,
    targetVersionId: product.versionId,
    targetVersionNumber: product.versionNumber,
    changelog: product.changelog,
    changedFields: diff.changedFields,
    protectedChanges: diff.protectedChanges,
    preservedCustomizations: Object.keys(installation.customizations).filter((field) => editable.has(field)),
    requiresStaging: true,
  };
}

export async function installMarketplaceProduct(sql: Sql, userId: string, input: { workspaceId: string; productId: string }): Promise<MarketplaceInstallation> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const product = await getMarketplaceProduct(sql, input.productId);
  const existing = await sql.query<MarketplaceInstallation>(`${installationSelect} where i.workspace_id = $1 and i.product_id = $2 and i.status <> 'uninstalled' limit 1`, [input.workspaceId, input.productId]);
  if (existing[0]) return existing[0];

  const installationId = randomUUID();
  const entitlementId = randomUUID();
  const agentId = randomUUID();
  const agentVersionId = randomUUID();
  const manifest = product.manifest;
  const requiredToolKeys = manifestToolKeys(manifest);
  const requiredTools = requiredToolKeys.length === 0
    ? []
    : await sql.query<{ id: string; key: string; risk_level: "read" | "write" | "destructive" }>(
      `select id, key, risk_level
         from tools
        where workspace_id is null and status = 'active' and key = any($1::text[])`,
      [requiredToolKeys],
    );
  const availableToolKeys = new Set(requiredTools.map((tool) => tool.key));
  const missingToolKeys = requiredToolKeys.filter((key) => !availableToolKeys.has(key));
  if (missingToolKeys.length > 0) throw new Error(`MARKETPLACE_REQUIRED_TOOLS_NOT_FOUND:${missingToolKeys.join(",")}`);
  const slug = `${product.slug}-${agentId.slice(0, 8)}`;
  await sql.query(
    `insert into agent_entitlements (id, workspace_id, product_id, offer_id, mode, created_by) values ($1, $2, $3, $4, $5, $6)`,
    [entitlementId, input.workspaceId, product.id, product.offerId, product.offerMode, userId],
  );
  await sql.query(
    `insert into agents (id, workspace_id, name, slug, agent_type, language, persona, welcome_message, system_prompt,
                         model_provider, model_name, temperature, max_tokens, memory_window, knowledge, tools, metadata,
                         created_by, updated_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17::jsonb, $18, $18)`,
    [
      agentId,
      input.workspaceId,
      stringValue(manifest.name, product.name),
      slug,
      stringValue(manifest.agentType, "support"),
      stringValue(manifest.language, "pt"),
      stringValue(manifest.persona),
      stringValue(manifest.welcomeMessage),
      stringValue(manifest.systemPrompt),
      stringValue(manifest.modelProvider, "xai"),
      stringValue(manifest.modelName, "grok-4.5"),
      numberValue(manifest.temperature, 0.35),
      numberValue(manifest.maxTokens, 420),
      numberValue(manifest.memoryWindow, 12),
      JSON.stringify(objectValue(manifest.knowledge)),
      JSON.stringify({ requiredTools: requiredToolKeys, approvalRequiredTools: manifestStringList(manifest, "approvalRequiredTools") }),
      JSON.stringify({ marketplaceProductId: product.id, marketplaceInstallationId: installationId }),
      userId,
    ],
  );
  await sql.query(
    `insert into agent_versions (id, agent_id, version_number, status, config, created_by) values ($1, $2, 1, 'draft', $3::jsonb, $4)`,
    [agentVersionId, agentId, JSON.stringify({ ...manifest, marketplaceProductId: product.id, marketplaceVersionId: product.versionId }), userId],
  );
  if (requiredTools.length > 0) {
    await sql.query(
      `insert into agent_tool_permissions (id, workspace_id, agent_version_id, tool_id, enabled, require_approval, allowed_scopes)
       select $1 || ':' || row_number() over ()::text, $2, $3, t.id, true,
              t.key = any($5::text[]), '{}'::jsonb
         from tools t
        where t.workspace_id is null and t.status = 'active' and t.key = any($4::text[])
       on conflict (agent_version_id, tool_id) do update set
         enabled = excluded.enabled,
         require_approval = excluded.require_approval,
         allowed_scopes = excluded.allowed_scopes,
         workspace_id = excluded.workspace_id`,
      [randomUUID(), input.workspaceId, agentVersionId, requiredToolKeys, manifestStringList(manifest, "approvalRequiredTools")],
    );
  }
  await sql.query(
    `insert into agent_installations (id, workspace_id, product_id, version_id, entitlement_id, agent_id, customizations, created_by) values ($1, $2, $3, $4, $5, $6, '{}'::jsonb, $7)`,
    [installationId, input.workspaceId, product.id, product.versionId, entitlementId, agentId, userId],
  );
  return (await listMarketplaceInstallations(sql, userId, input.workspaceId)).find((item) => item.id === installationId)!;
}

export async function updateMarketplaceCustomization(sql: Sql, userId: string, input: { workspaceId: string; installationId: string; customizations: JsonObject }): Promise<void> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const rows = await sql<{ manifest: JsonObject }>`
    select v.manifest from agent_installations i join agent_product_versions v on v.id = i.version_id
     where i.id = ${input.installationId} and i.workspace_id = ${input.workspaceId} and i.status <> 'uninstalled' limit 1`;
  if (!rows[0]) throw new Error("MARKETPLACE_INSTALLATION_NOT_FOUND");
  const editable = editableFields(rows[0].manifest);
  const safe = Object.fromEntries(Object.entries(input.customizations).filter(([key]) => editable.has(key))) as JsonObject;
  await sql.query(`update agent_installations set customizations = $1::jsonb, updated_at = current_timestamp where id = $2 and workspace_id = $3`, [JSON.stringify(safe), input.installationId, input.workspaceId]);
  const agent = await sql<{ agent_id: string }>`select agent_id from agent_installations where id = ${input.installationId} and workspace_id = ${input.workspaceId}`;
  if (agent[0]) {
    await sql.query(
      `update agents set name = coalesce($1, name), persona = coalesce($2, persona), welcome_message = coalesce($3, welcome_message), language = coalesce($4, language), updated_by = $5, updated_at = current_timestamp where id = $6 and workspace_id = $7`,
      [typeof safe.name === "string" ? safe.name.slice(0, 120) : null, typeof safe.persona === "string" ? safe.persona.slice(0, 500) : null, typeof safe.welcomeMessage === "string" ? safe.welcomeMessage.slice(0, 1000) : null, typeof safe.language === "string" ? safe.language.slice(0, 8) : null, userId, agent[0].agent_id, input.workspaceId],
    );
    const draft = await sql<{ id: string }>`select id from agent_versions where agent_id = ${agent[0].agent_id} and status = 'draft' order by version_number desc limit 1`;
    if (draft[0]) await sql.query(`update agent_versions set config = config || $1::jsonb where id = $2 and agent_id = $3`, [JSON.stringify(safe), draft[0].id, agent[0].agent_id]);
  }
}

export async function updateMarketplaceInstallation(sql: Sql, userId: string, input: { workspaceId: string; installationId: string }): Promise<MarketplaceInstallation> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const current = await getMarketplaceInstallation(sql, userId, input);
  const product = await getMarketplaceProduct(sql, current.productId);
  if (product.versionNumber <= current.versionNumber) return current;
  const fromConfig = await currentAgentConfig(sql, current.agentId, input.workspaceId);
  const toConfig = mergeManifestWithCustomizations({ ...product.manifest, marketplaceProductId: product.id, marketplaceVersionId: product.versionId }, current.customizations);
  await sql.query(
    `insert into agent_installation_revisions (id,installation_id,workspace_id,from_version_id,to_version_id,from_config,to_config,action,created_by) values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'update',$8)`,
    [randomUUID(), current.id, input.workspaceId, current.versionId, product.versionId, JSON.stringify(fromConfig), JSON.stringify(toConfig), userId],
  );
  await stageAgentConfig(sql, userId, input.workspaceId, current.agentId, toConfig);
  await sql.query(`update agent_installations set version_id = $1, status = 'staging', updated_at = current_timestamp where id = $2 and workspace_id = $3`, [product.versionId, current.id, input.workspaceId]);
  return getMarketplaceInstallation(sql, userId, input);
}

export async function rollbackMarketplaceInstallation(sql: Sql, userId: string, input: { workspaceId: string; installationId: string }): Promise<MarketplaceInstallation> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const current = await getMarketplaceInstallation(sql, userId, input);
  const revisions = await sql<{ from_version_id: string; to_version_id: string; from_config: JsonObject; to_config: JsonObject }>`
    select from_version_id, to_version_id, from_config, to_config
      from agent_installation_revisions
     where installation_id = ${current.id} and workspace_id = ${input.workspaceId}
       and action = 'update' and to_version_id = ${current.versionId}
     order by created_at desc limit 1
  `;
  const revision = revisions[0];
  if (!revision) throw new Error("MARKETPLACE_ROLLBACK_NOT_AVAILABLE");
  await sql.query(
    `insert into agent_installation_revisions (id,installation_id,workspace_id,from_version_id,to_version_id,from_config,to_config,action,created_by) values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'rollback',$8)`,
    [randomUUID(), current.id, input.workspaceId, current.versionId, revision.from_version_id, JSON.stringify(revision.to_config), JSON.stringify(revision.from_config), userId],
  );
  await stageAgentConfig(sql, userId, input.workspaceId, current.agentId, revision.from_config);
  await sql.query(`update agent_installations set version_id = $1, status = 'staging', updated_at = current_timestamp where id = $2 and workspace_id = $3`, [revision.from_version_id, current.id, input.workspaceId]);
  return getMarketplaceInstallation(sql, userId, input);
}


export type InstallationHealthStatus = "healthy" | "attention" | "degraded" | "no_activity" | "unavailable";

export type MarketplaceInstallationOperationalSummary = {
  installationId: string;
  workspaceId: string;
  health: {
    status: InstallationHealthStatus;
    reason: string;
    checkedAt: string | null;
    connectionCount: number;
    connectedConnectionCount: number;
    failedEventsLast24h: number;
  };
  usage: {
    periodDays: 7;
    since: string;
    conversations: number;
    inboundMessages: number;
    outboundMessages: number;
    jobs: number;
    succeededJobs: number;
    failedJobs: number;
    successRate: number;
    averageDurationMs: number;
    lastActivityAt: string | null;
    lastFailureAt: string | null;
  };
};

type OperationalSummaryRow = {
  installationId: string;
  workspaceId: string;
  since: string | Date;
  connectionCount: number;
  connectedConnectionCount: number;
  unhealthyConnectionCount: number;
  unknownConnectionCount: number;
  checkedAt: string | Date | null;
  conversations: number;
  inboundMessages: number;
  outboundMessages: number;
  jobs: number;
  succeededJobs: number;
  failedJobs: number;
  failedDeliveries: number;
  averageDurationMs: number;
  lastActivityAt: string | Date | null;
  lastFailureAt: string | Date | null;
};

function timestampValue(value: string | Date | null): string | null {
  return value instanceof Date ? value.toISOString() : value;
}

function operationalHealth(row: OperationalSummaryRow): MarketplaceInstallationOperationalSummary["health"] {
  const failedEventsLast24h = row.failedJobs + row.failedDeliveries;
  let status: InstallationHealthStatus;
  let reason: string;
  if (row.connectionCount === 0) {
    status = "unavailable";
    reason = "Nenhum canal está vinculado a esta instalação.";
  } else if (row.unhealthyConnectionCount > 0 || failedEventsLast24h >= 3) {
    status = "degraded";
    reason = row.unhealthyConnectionCount > 0
      ? "Um ou mais canais vinculados estão degradados ou indisponíveis."
      : "Foram registradas falhas recentes no runtime ou no envio de mensagens.";
  } else if (row.connectedConnectionCount < row.connectionCount || row.unknownConnectionCount > 0) {
    status = "attention";
    reason = "A configuração de saúde dos canais ainda precisa ser verificada.";
  } else if (!row.lastActivityAt) {
    status = "no_activity";
    reason = "A instalação ainda não possui atividade na janela analisada.";
  } else if (failedEventsLast24h > 0) {
    status = "attention";
    reason = "Há falhas recentes, mas o runtime continua processando eventos.";
  } else {
    status = "healthy";
    reason = "Canais e execuções recentes estão operacionais.";
  }
  return {
    status,
    reason,
    checkedAt: timestampValue(row.checkedAt),
    connectionCount: row.connectionCount,
    connectedConnectionCount: row.connectedConnectionCount,
    failedEventsLast24h,
  };
}

function toOperationalSummary(row: OperationalSummaryRow): MarketplaceInstallationOperationalSummary {
  const jobs = Number(row.jobs ?? 0);
  const succeededJobs = Number(row.succeededJobs ?? 0);
  return {
    installationId: row.installationId,
    workspaceId: row.workspaceId,
    health: operationalHealth(row),
    usage: {
      periodDays: 7,
      since: timestampValue(row.since) ?? new Date(0).toISOString(),
      conversations: Number(row.conversations ?? 0),
      inboundMessages: Number(row.inboundMessages ?? 0),
      outboundMessages: Number(row.outboundMessages ?? 0),
      jobs,
      succeededJobs,
      failedJobs: Number(row.failedJobs ?? 0),
      successRate: jobs === 0 ? 0 : Math.round((succeededJobs / jobs) * 1000) / 10,
      averageDurationMs: Number(row.averageDurationMs ?? 0),
      lastActivityAt: timestampValue(row.lastActivityAt),
      lastFailureAt: timestampValue(row.lastFailureAt),
    },
  };
}

const operationalSummarySelect = `
  select i.id as "installationId", i.workspace_id as "workspaceId",
         current_timestamp - interval '7 days' as since,
         coalesce(connections.connection_count, 0)::int as "connectionCount",
         coalesce(connections.connected_connection_count, 0)::int as "connectedConnectionCount",
         coalesce(connections.unhealthy_connection_count, 0)::int as "unhealthyConnectionCount",
         coalesce(connections.unknown_connection_count, 0)::int as "unknownConnectionCount",
         connections.checked_at as "checkedAt",
         coalesce(conversations.conversation_count, 0)::int as conversations,
         coalesce(messages.inbound_messages, 0)::int as "inboundMessages",
         coalesce(messages.outbound_messages, 0)::int as "outboundMessages",
         coalesce(jobs.job_count, 0)::int as jobs,
         coalesce(jobs.succeeded_jobs, 0)::int as "succeededJobs",
         coalesce(jobs.failed_jobs, 0)::int as "failedJobs",
         coalesce(deliveries.failed_deliveries, 0)::int as "failedDeliveries",
         coalesce(executions.average_duration_ms, 0)::int as "averageDurationMs",
         greatest(
           conversations.last_activity_at,
           messages.last_activity_at,
           jobs.last_activity_at,
           executions.last_activity_at,
           deliveries.last_activity_at
         ) as "lastActivityAt",
         greatest(
           jobs.last_failure_at,
           executions.last_failure_at,
           deliveries.last_failure_at
         ) as "lastFailureAt"
    from agent_installations i
    left join lateral (
      select count(*)::int as connection_count,
             count(*) filter (where c.status = 'connected')::int as connected_connection_count,
             count(*) filter (where c.health_status in ('degraded', 'unhealthy') or c.status in ('error', 'revoked'))::int as unhealthy_connection_count,
             count(*) filter (where c.health_status = 'unknown' or c.last_healthcheck_at is null)::int as unknown_connection_count,
             max(c.last_healthcheck_at) as checked_at
        from agent_connections ac
        join connections c on c.id = ac.connection_id
         and c.workspace_id = i.workspace_id
         and c.deleted_at is null
       where ac.agent_id = i.agent_id
    ) connections on true
    left join lateral (
      select count(*)::int as conversation_count,
             max(c.updated_at) as last_activity_at
        from conversations c
       where c.agent_id = i.agent_id
         and c.workspace_id = i.workspace_id
         and c.updated_at >= current_timestamp - interval '7 days'
    ) conversations on true
    left join lateral (
      select count(*) filter (where m.direction = 'inbound')::int as inbound_messages,
             count(*) filter (where m.direction = 'outbound')::int as outbound_messages,
             max(m.created_at) as last_activity_at
        from messages m
        join conversations c on c.id = m.conversation_id
         and c.agent_id = i.agent_id
         and c.workspace_id = i.workspace_id
       where m.workspace_id = i.workspace_id
         and m.created_at >= current_timestamp - interval '7 days'
    ) messages on true
    left join lateral (
      select count(*)::int as job_count,
             count(*) filter (where j.status = 'succeeded')::int as succeeded_jobs,
             count(*) filter (where j.status in ('failed', 'dead'))::int as failed_jobs,
             max(j.updated_at) as last_activity_at,
             max(j.updated_at) filter (where j.status in ('failed', 'dead')) as last_failure_at
        from agent_runtime_jobs j
       where j.agent_id = i.agent_id
         and j.workspace_id = i.workspace_id
         and j.created_at >= current_timestamp - interval '7 days'
    ) jobs on true
    left join lateral (
      select round(avg(e.duration_ms))::int as average_duration_ms,
             max(e.created_at) as last_activity_at,
             max(e.created_at) filter (where e.status = 'failed') as last_failure_at
        from agent_runtime_execution_logs e
       where e.agent_id = i.agent_id
         and e.workspace_id = i.workspace_id
         and e.created_at >= current_timestamp - interval '7 days'
    ) executions on true
    left join lateral (
      select count(*) filter (where d.status = 'failed')::int as failed_deliveries,
             max(d.updated_at) as last_activity_at,
             max(d.updated_at) filter (where d.status = 'failed') as last_failure_at
        from message_deliveries d
        join messages m on m.id = d.message_id
        join conversations c on c.id = m.conversation_id
         and c.agent_id = i.agent_id
         and c.workspace_id = i.workspace_id
       where d.workspace_id = i.workspace_id
         and d.updated_at >= current_timestamp - interval '7 days'
    ) deliveries on true
`;

export async function listMarketplaceInstallationOperationalSummaries(sql: Sql, userId: string, workspaceId: string): Promise<MarketplaceInstallationOperationalSummary[]> {
  await requireWorkspaceAccess(sql, userId, workspaceId, "read");
  const rows = await sql.query<OperationalSummaryRow>(
    `${operationalSummarySelect} where i.workspace_id = $1 and i.status <> 'uninstalled' order by i.updated_at desc`,
    [workspaceId],
  );
  return rows.map(toOperationalSummary);
}

export async function getMarketplaceInstallationOperationalSummary(sql: Sql, userId: string, input: { workspaceId: string; installationId: string }): Promise<MarketplaceInstallationOperationalSummary> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  const rows = await sql.query<OperationalSummaryRow>(
    `${operationalSummarySelect} where i.id = $1 and i.workspace_id = $2 and i.status <> 'uninstalled' limit 1`,
    [input.installationId, input.workspaceId],
  );
  if (!rows[0]) throw new Error("MARKETPLACE_INSTALLATION_NOT_FOUND");
  return toOperationalSummary(rows[0]);
}
