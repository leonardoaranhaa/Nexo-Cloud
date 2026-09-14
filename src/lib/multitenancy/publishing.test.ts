import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import type { Sql } from "../db";
import { publishAgent, rollbackAgent } from "./server.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../");

async function fixture() {
  const pg = new PGlite();
  await pg.waitReady;
  for (const file of [
    "0002_multi_tenant_core.sql",
    "0003_connector_registry.sql",
    "0004_messaging_dispatch.sql",
    "0005_webhook_security.sql",
    "0006_webhook_delivery_states.sql",
    "0007_agent_runtime_jobs.sql",
    "0010_workflow_core.sql",
    "0013_tool_gateway.sql",
    "0030_tool_execution_domain.sql",
    "0031_agent_development_blueprints.sql",
    "0050_agent_evaluation_harness.sql",
    "0051_promotion_hardening.sql",
    "0018_agent_marketplace.sql",
    "0037_marketplace_installation_revisions.sql",
  ]) await pg.exec(await readFile(join(root, "migrations", file), "utf8"));
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
    let text = strings[0] ?? "";
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1] ?? ""}`;
    return (await pg.query<T>(text, values)).rows;
  }) as Sql;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows;
  await pg.query("insert into organizations (id,name,slug,created_by) values ('org','Org','org','user')");
  await pg.query("insert into workspaces (id,organization_id,name,slug,created_by) values ('ws','org','Ws','ws','user')");
  await pg.query("insert into workspace_memberships (workspace_id,user_id,role) values ('ws','user','workspace_admin')");
  await pg.query("insert into agents (id,workspace_id,name,slug,status,language,system_prompt,knowledge,tools,created_by,updated_by) values ('agent','ws','Agent','agent','draft','pt','Primeiro prompt.','{}','{}','user','user')");
  await pg.query("insert into connections (id,workspace_id,name,provider,status,health_status,created_by) values ('connection','ws','Canal de teste','meta','connected','healthy','user')");
  await pg.query("insert into agent_connections (agent_id,connection_id,is_primary) values ('agent','connection',true)");
  await pg.query("insert into agent_development_blueprints (id,workspace_id,agent_id,agent_type,test_scenarios,created_by,updated_by) values ('blueprint','ws','agent','support','[\"Responda ao cliente\"]','user','user')");
  return { pg, sql };
}

test("publishes immutable versions and rolls back through a new version", async () => {
  const { pg, sql } = await fixture();
  try {
    const first = await publishAgent(sql, "user", { workspaceId: "ws", agentId: "agent" });
    assert.equal(first.versionNumber, 1);
    assert.equal(first.status, "published");
    await pg.query("insert into agent_tool_permissions (id,workspace_id,agent_version_id,tool_id,enabled,require_approval,allowed_scopes) values ('permission-first','ws',$1,'tool_evolution_send_text',true,true,'{}')", [first.id]);

    await pg.query("update agents set system_prompt = 'Segundo prompt.', updated_at = current_timestamp where id = 'agent'");
    await pg.query("insert into agent_versions (id,agent_id,version_number,status,config,created_by) values ('candidate','agent',2,'draft',$1::jsonb,'user')", [JSON.stringify({ systemPrompt: "Segundo prompt." })]);
    await pg.query("insert into agent_tool_permissions (id,workspace_id,agent_version_id,tool_id,enabled,require_approval,allowed_scopes) values ('permission-candidate','ws','candidate','tool_evolution_send_text',true,true,'{}')");
    await pg.query("insert into agent_evaluation_harness_runs (id,workspace_id,agent_id,blueprint_id,baseline_version_id,candidate_version_id,status,scenario_count,regression_count,created_by,approved_by,approved_at) values ('harness','ws','agent','blueprint',$1,'candidate','succeeded',1,0,'user','user',current_timestamp)", [first.id]);
    const second = await publishAgent(sql, "user", { workspaceId: "ws", agentId: "agent" });
    assert.equal(second.versionNumber, 2);
    const copied = await pg.query<{ enabled: boolean; require_approval: boolean }>("select enabled, require_approval from agent_tool_permissions where agent_version_id = $1", [second.id]);
    assert.deepEqual(copied.rows[0], { enabled: true, require_approval: true });

    const rolledBack = await rollbackAgent(sql, "user", { workspaceId: "ws", agentId: "agent", versionId: first.id });
    assert.equal(rolledBack.versionNumber, 3);
    assert.equal(rolledBack.status, "published");

    const versions = await pg.query<{ version_number: number; status: string; config: { systemPrompt?: string } }>(
      "select version_number, status, config from agent_versions where agent_id = 'agent' order by version_number",
    );
    assert.deepEqual(versions.rows.map((row) => row.status), ["retired", "retired", "published"]);
    assert.equal(versions.rows[2]?.config.systemPrompt, "Primeiro prompt.");
  } finally {
    await pg.close();
  }
});

test("rejects publishing an agent from another workspace", async () => {
  const { pg, sql } = await fixture();
  try {
    await assert.rejects(
      publishAgent(sql, "user", { workspaceId: "other-workspace", agentId: "agent" }),
      /WORKSPACE|permission/i,
    );
  } finally {
    await pg.close();
  }
});

test("blocks publishing when the primary channel is not healthy", async () => {
  const { pg, sql } = await fixture();
  try {
    await pg.query("update connections set health_status = 'degraded' where id = 'connection'");
    await assert.rejects(
      publishAgent(sql, "user", { workspaceId: "ws", agentId: "agent" }),
      /PUBLISH_READINESS_CHANNEL_BLOCKED/,
    );
  } finally {
    await pg.close();
  }
});

test("rejects activation without a published version", async () => {
  const { pg } = await fixture();
  try {
    await pg.query("delete from agent_versions where agent_id = 'agent'");
    await assert.rejects(
      () => pg.query("update agents set status = 'active' where id = 'agent'"),
      /AGENT_ACTIVE_REQUIRES_PUBLISHED_VERSION/,
    );
  } finally {
    await pg.close();
  }
});

test("requires an approved, regression-free Harness for republication", async () => {
  const { pg, sql } = await fixture();
  try {
    const first = await publishAgent(sql, "user", { workspaceId: "ws", agentId: "agent" });
    await pg.query("update agents set system_prompt = 'Mudança não aprovada.' where id = 'agent'");
    await assert.rejects(
      () => publishAgent(sql, "user", { workspaceId: "ws", agentId: "agent" }),
      /PUBLISH_HARNESS_REQUIRED/,
    );
    assert.equal(first.status, "published");
  } finally {
    await pg.close();
  }
});
