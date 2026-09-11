import { randomUUID } from "node:crypto";
import type { Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/multitenancy/server";
import type { JsonObject } from "@/lib/multitenancy/server";

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
  agentId: string;
  agentName: string;
  versionId: string;
  versionNumber: number;
  status: "draft" | "staging" | "active" | "paused" | "uninstalled";
  customizations: JsonObject;
};

const productSelect = `
  select p.id, p.slug, p.name, p.description, p.category,
         p.provider_type as "providerType", p.risk_level as "riskLevel",
         v.id as "versionId", v.version_number as "versionNumber",
         v.manifest, v.changelog,
         o.id as "offerId", o.mode as "offerMode", o.price_cents as "priceCents", o.currency
    from agent_products p
    join agent_product_versions v on v.product_id = p.id and v.status = 'published'
    join agent_product_offers o on o.product_id = p.id and o.version_id = v.id and o.status = 'active'
`;

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
  return sql<MarketplaceInstallation>`
    select i.id, i.workspace_id as "workspaceId", i.product_id as "productId",
           p.name as "productName", i.agent_id as "agentId", a.name as "agentName", i.version_id as "versionId",
           v.version_number as "versionNumber", i.status, i.customizations
      from agent_installations i
      join agent_products p on p.id = i.product_id
      join agent_versions av on av.agent_id = i.agent_id and av.status = 'draft'
      join agents a on a.id = i.agent_id and a.workspace_id = i.workspace_id
      join agent_product_versions v on v.id = i.version_id
     where i.workspace_id = ${workspaceId} and i.status <> 'uninstalled'
     order by i.updated_at desc
  `;
}

export async function getMarketplaceInstallation(sql: Sql, userId: string, input: { workspaceId: string; installationId: string }): Promise<MarketplaceInstallation> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  const rows = await sql<MarketplaceInstallation>`
    select i.id, i.workspace_id as "workspaceId", i.product_id as "productId",
           p.name as "productName", i.agent_id as "agentId", a.name as "agentName", i.version_id as "versionId",
           v.version_number as "versionNumber", i.status, i.customizations
      from agent_installations i
      join agent_products p on p.id = i.product_id
      join agents a on a.id = i.agent_id and a.workspace_id = i.workspace_id
      join agent_product_versions v on v.id = i.version_id
     where i.id = ${input.installationId} and i.workspace_id = ${input.workspaceId}
       and i.status <> 'uninstalled' limit 1
  `;
  if (!rows[0]) throw new Error("MARKETPLACE_INSTALLATION_NOT_FOUND");
  return rows[0];
}

export async function installMarketplaceProduct(sql: Sql, userId: string, input: { workspaceId: string; productId: string }): Promise<MarketplaceInstallation> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const product = await getMarketplaceProduct(sql, input.productId);
  const existing = await sql<MarketplaceInstallation>`
    select i.id, i.workspace_id as "workspaceId", i.product_id as "productId",
           p.name as "productName", i.agent_id as "agentId", a.name as "agentName", i.version_id as "versionId",
           v.version_number as "versionNumber", i.status, i.customizations
      from agent_installations i join agent_products p on p.id = i.product_id
      join agents a on a.id = i.agent_id join agent_product_versions v on v.id = i.version_id
     where i.workspace_id = ${input.workspaceId} and i.product_id = ${input.productId}
       and i.status <> 'uninstalled' limit 1
  `;
  if (existing[0]) return existing[0];

  const installationId = randomUUID();
  const entitlementId = randomUUID();
  const agentId = randomUUID();
  const agentVersionId = randomUUID();
  const slug = `${product.slug}-${agentId.slice(0, 8)}`;
  const manifest = product.manifest as Record<string, any>;
  await sql.query(
    `insert into agent_entitlements (id, workspace_id, product_id, offer_id, mode, created_by)
     values ($1, $2, $3, $4, $5, $6)`,
    [entitlementId, input.workspaceId, product.id, product.offerId, product.offerMode, userId],
  );
  await sql.query(
    `insert into agents (id, workspace_id, name, slug, agent_type, language, persona, welcome_message, system_prompt, metadata, created_by, updated_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $11)`,
    [agentId, input.workspaceId, manifest.name ?? product.name, slug, manifest.agentType ?? "support", manifest.language ?? "pt", manifest.persona ?? "", manifest.welcomeMessage ?? "", manifest.systemPrompt ?? "", JSON.stringify({ marketplaceProductId: product.id, marketplaceInstallationId: installationId }), userId],
  );
  await sql.query(
    `insert into agent_versions (id, agent_id, version_number, status, config, created_by)
     values ($1, $2, 1, 'draft', $3::jsonb, $4)`,
    [agentVersionId, agentId, JSON.stringify({ ...manifest, marketplaceProductId: product.id, marketplaceVersionId: product.versionId }), userId],
  );
  await sql.query(
    `insert into agent_installations (id, workspace_id, product_id, version_id, entitlement_id, agent_id, customizations, created_by)
     values ($1, $2, $3, $4, $5, $6, '{}'::jsonb, $7)`,
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
  const editable = new Set(Array.isArray(rows[0].manifest.editableFields) ? rows[0].manifest.editableFields : []);
  const safe = Object.fromEntries(Object.entries(input.customizations).filter(([key]) => editable.has(key))) as JsonObject;
  await sql.query(`update agent_installations set customizations = $1::jsonb, updated_at = current_timestamp where id = $2 and workspace_id = $3`, [JSON.stringify(safe), input.installationId, input.workspaceId]);
  const agent = await sql<{ agent_id: string }>`select agent_id from agent_installations where id = ${input.installationId} and workspace_id = ${input.workspaceId}`;
  if (agent[0]) {
    await sql.query(
      `update agents set name = coalesce($1, name), persona = coalesce($2, persona), welcome_message = coalesce($3, welcome_message), updated_by = $4, updated_at = current_timestamp where id = $5 and workspace_id = $6`,
      [typeof safe.name === "string" ? safe.name.slice(0, 120) : null, typeof safe.persona === "string" ? safe.persona.slice(0, 500) : null, typeof safe.welcomeMessage === "string" ? safe.welcomeMessage.slice(0, 1000) : null, userId, agent[0].agent_id, input.workspaceId],
    );
  }
}

export async function updateMarketplaceInstallation(sql: Sql, userId: string, input: { workspaceId: string; installationId: string }): Promise<MarketplaceInstallation> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const current = await getMarketplaceInstallation(sql, userId, input);
  const product = await getMarketplaceProduct(sql, current.productId);
  if (product.versionNumber <= current.versionNumber) return current;
  const currentConfigRows = await sql<{ config: JsonObject }>`select config from agent_versions where agent_id = ${current.agentId} and status = 'draft' limit 1`;
  const fromConfig = currentConfigRows[0]?.config ?? {};
  const toConfig = { ...(product.manifest as JsonObject), marketplaceProductId: product.id, marketplaceVersionId: product.versionId };
  await sql.query(`insert into agent_installation_revisions (id,installation_id,workspace_id,from_version_id,to_version_id,from_config,to_config,action,created_by) values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'update',$8)`, [randomUUID(), current.id, input.workspaceId, current.versionId, product.versionId, JSON.stringify(fromConfig), JSON.stringify(toConfig), userId]);
  await sql.query(`update agent_versions set config = $1::jsonb where agent_id = $2 and status = 'draft'`, [JSON.stringify(toConfig), current.agentId]);
  await sql.query(`update agent_installations set version_id = $1, status = 'staging', updated_at = current_timestamp where id = $2 and workspace_id = $3`, [product.versionId, current.id, input.workspaceId]);
  return getMarketplaceInstallation(sql, userId, input);
}

export async function rollbackMarketplaceInstallation(sql: Sql, userId: string, input: { workspaceId: string; installationId: string }): Promise<MarketplaceInstallation> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const current = await getMarketplaceInstallation(sql, userId, input);
  const revisions = await sql<{ from_version_id: string; to_version_id: string; from_config: JsonObject; to_config: JsonObject }>`select from_version_id, to_version_id, from_config, to_config from agent_installation_revisions where installation_id = ${current.id} and workspace_id = ${input.workspaceId} order by created_at desc limit 1`;
  const revision = revisions[0];
  if (!revision) throw new Error("MARKETPLACE_ROLLBACK_NOT_AVAILABLE");
  await sql.query(`insert into agent_installation_revisions (id,installation_id,workspace_id,from_version_id,to_version_id,from_config,to_config,action,created_by) values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'rollback',$8)`, [randomUUID(), current.id, input.workspaceId, current.versionId, revision.from_version_id, JSON.stringify(revision.to_config), JSON.stringify(revision.from_config), userId]);
  await sql.query(`update agent_versions set config = $1::jsonb where agent_id = $2 and status = 'draft'`, [JSON.stringify(revision.from_config), current.agentId]);
  await sql.query(`update agent_installations set version_id = $1, status = 'draft', updated_at = current_timestamp where id = $2 and workspace_id = $3`, [revision.from_version_id, current.id, input.workspaceId]);
  return getMarketplaceInstallation(sql, userId, input);
}
