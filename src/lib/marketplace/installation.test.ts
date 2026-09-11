import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import type { Sql } from "../db";
import {
  getMarketplaceInstallationUpdatePlan,
  installMarketplaceProduct,
  listMarketplaceInstallationRevisions,
  listMarketplaceInstallations,
  rollbackMarketplaceInstallation,
  updateMarketplaceCustomization,
  updateMarketplaceInstallation,
} from "./server.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../");
const productId = "nexo-product-atendimento-leads";

async function fixture() {
  const pg = new PGlite();
  await pg.waitReady;
  for (const file of ["0002_multi_tenant_core.sql", "0018_agent_marketplace.sql", "0037_marketplace_installation_revisions.sql"]) {
    await pg.exec(await readFile(join(root, "migrations", file), "utf8"));
  }
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
    let text = strings[0] ?? "";
    for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1] ?? ""}`;
    return (await pg.query<T>(text, values)).rows;
  }) as Sql;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows;
  await pg.query("insert into organizations (id,name,slug,created_by) values ('org','Org','org','user')");
  await pg.query("insert into workspaces (id,organization_id,name,slug,created_by) values ('ws','org','Ws','ws','user')");
  await pg.query("insert into workspace_memberships (workspace_id,user_id,role) values ('ws','user','workspace_admin')");
  return { pg, sql };
}

test("installation is idempotent and isolated to the authorized workspace", async () => {
  const { pg, sql } = await fixture();
  try {
    const first = await installMarketplaceProduct(sql, "user", { workspaceId: "ws", productId });
    const second = await installMarketplaceProduct(sql, "user", { workspaceId: "ws", productId });
    assert.equal(first.id, second.id);
    assert.equal(first.versionNumber, 1);
    assert.equal(first.offerMode, "trial");
    const count = await pg.query<{ count: number }>("select count(*)::int as count from agent_installations");
    assert.equal(count.rows[0]?.count, 1);
    await assert.rejects(() => listMarketplaceInstallations(sql, "user", "other-workspace"), /WORKSPACE|permission/i);
  } finally {
    await pg.close();
  }
});

test("update stages the latest product version and preserves editable customizations", async () => {
  const { pg, sql } = await fixture();
  try {
    const installation = await installMarketplaceProduct(sql, "user", { workspaceId: "ws", productId });
    await updateMarketplaceCustomization(sql, "user", { workspaceId: "ws", installationId: installation.id, customizations: { name: "Atendimento Aurora", persona: "Consultora acolhedora", systemPrompt: "não pode" } });
    await pg.query("update agent_product_versions set status = 'retired' where id = 'nexo-product-atendimento-leads-v1'");
    await pg.query("insert into agent_product_versions (id,product_id,version_number,status,manifest,changelog) values ('nexo-product-atendimento-leads-v2',$1,2,'published',$2::jsonb,'Melhorias de qualificação.')", [productId, JSON.stringify({ agentType: "support", name: "Nexo Atendimento + Qualificação", persona: "Persona nova", welcomeMessage: "Bem-vindo à versão 2", systemPrompt: "Prompt protegido v2", language: "pt", editableFields: ["name", "persona", "welcomeMessage", "language"], protectedComponents: ["systemPrompt", "tools", "workflows"] })]);
    await pg.query("insert into agent_product_offers (id,product_id,version_id,mode,status,price_cents,currency) values ('nexo-product-atendimento-leads-v2-trial',$1,'nexo-product-atendimento-leads-v2','trial','active',0,'BRL')", [productId]);

    const plan = await getMarketplaceInstallationUpdatePlan(sql, "user", { workspaceId: "ws", installationId: installation.id });
    assert.equal(plan.available, true);
    assert.equal(plan.targetVersionNumber, 2);
    assert.equal(plan.protectedChanges.includes("systemPrompt"), true);
    assert.equal(plan.preservedCustomizations.includes("name"), true);

    const updated = await updateMarketplaceInstallation(sql, "user", { workspaceId: "ws", installationId: installation.id });
    assert.equal(updated.versionNumber, 2);
    assert.equal(updated.status, "staging");
    assert.equal(updated.updateAvailable, false);
    assert.equal(updated.rollbackAvailable, true);
    const agent = await pg.query<{ name: string; system_prompt: string }>("select name, system_prompt from agents where id = $1", [installation.agentId]);
    assert.equal(agent.rows[0]?.name, "Atendimento Aurora");
    assert.equal(agent.rows[0]?.system_prompt, "Prompt protegido v2");
  } finally {
    await pg.close();
  }
});

test("rollback restores the previous product version without deleting revision history", async () => {
  const { pg, sql } = await fixture();
  try {
    const installation = await installMarketplaceProduct(sql, "user", { workspaceId: "ws", productId });
    await pg.query("update agent_product_versions set status = 'retired' where id = 'nexo-product-atendimento-leads-v1'");
    await pg.query("insert into agent_product_versions (id,product_id,version_number,status,manifest,changelog) values ('nexo-product-atendimento-leads-v2',$1,2,'published',$2::jsonb,'Atualização.')", [productId, JSON.stringify({ agentType: "support", name: "Nexo v2", persona: "Nova", welcomeMessage: "Olá v2", systemPrompt: "Prompt v2", language: "pt", editableFields: ["name", "persona", "welcomeMessage"], protectedComponents: ["systemPrompt"] })]);
    await pg.query("insert into agent_product_offers (id,product_id,version_id,mode,status,price_cents,currency) values ('nexo-product-atendimento-leads-v2-trial',$1,'nexo-product-atendimento-leads-v2','trial','active',0,'BRL')", [productId]);
    await updateMarketplaceInstallation(sql, "user", { workspaceId: "ws", installationId: installation.id });
    const rolledBack = await rollbackMarketplaceInstallation(sql, "user", { workspaceId: "ws", installationId: installation.id });
    assert.equal(rolledBack.versionNumber, 1);
    assert.equal(rolledBack.status, "staging");
    const revisions = await listMarketplaceInstallationRevisions(sql, "user", { workspaceId: "ws", installationId: installation.id });
    assert.deepEqual(revisions.map((revision) => revision.action).sort(), ["rollback", "update"]);
    await assert.rejects(() => rollbackMarketplaceInstallation(sql, "user", { workspaceId: "ws", installationId: installation.id }), /ROLLBACK_NOT_AVAILABLE/);
  } finally {
    await pg.close();
  }
});
