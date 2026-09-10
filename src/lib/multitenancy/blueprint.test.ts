import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import { upsertAgentDevelopmentBlueprint } from "./server.ts";
import type { Sql } from "../db";

const root = join(fileURLToPath(new URL("../../..", import.meta.url)));

test("blueprint is persisted only for the authorized workspace agent", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  await pg.exec(await readFile(join(root, "migrations/0002_multi_tenant_core.sql"), "utf8"));
  await pg.exec(await readFile(join(root, "migrations/0031_agent_development_blueprints.sql"), "utf8"));
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
    let text = strings[0] ?? "";
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1] ?? ""}`;
    return (await pg.query<T>(text, values)).rows;
  }) as Sql;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows;
  await pg.query("insert into organizations (id,name,slug,created_by) values ('org','Org','org','user')");
  await pg.query("insert into workspaces (id,organization_id,name,slug,created_by) values ('ws','org','Ws','ws','user'), ('other','org','Other','other','user')");
  await pg.query("insert into workspace_memberships (workspace_id,user_id,role) values ('ws','user','workspace_admin')");
  await pg.query("insert into agents (id,workspace_id,name,slug,created_by,updated_by) values ('agent','ws','Agent','agent','user','user')");

  const saved = await upsertAgentDevelopmentBlueprint(sql, "user", {
    workspaceId: "ws",
    agentId: "agent",
    agentType: "sales",
    objectives: ["Qualificar leads", "x".repeat(400)],
    capabilities: ["Criar lead"],
    guardrails: ["Não inventar dados"],
    testScenarios: ["Pergunta de preço"],
    sourceBrief: "Clínica odontológica",
  });
  assert.deepEqual(saved.objectives, ["Qualificar leads", "x".repeat(240)]);
  const rows = await pg.query<{ workspace_id: string; agent_id: string; source_brief: string }>("select workspace_id, agent_id, source_brief from agent_development_blueprints");
  assert.deepEqual(rows.rows, [{ workspace_id: "ws", agent_id: "agent", source_brief: "Clínica odontológica" }]);
  await assert.rejects(() => upsertAgentDevelopmentBlueprint(sql, "user", { workspaceId: "other", agentId: "agent", agentType: "sales", objectives: [], capabilities: [], guardrails: [], testScenarios: [] }));
  await pg.close();
});
