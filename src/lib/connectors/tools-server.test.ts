import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import type { Sql } from "../db.ts";
import { decideToolExecutionApproval, listWorkspaceTools, requestToolExecutionApproval, setAgentToolPermission } from "./tools-server.ts";

const root = join(fileURLToPath(new URL("../../../", import.meta.url)));

async function setup() {
  const pg = new PGlite();
  await pg.waitReady;
  const files = (await readdir(join(root, "migrations"))).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort();
  for (const file of files) await pg.exec(await readFile(join(root, "migrations", file), "utf8"));
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
    let query = strings[0] ?? "";
    for (let index = 0; index < values.length; index += 1) query += `$${index + 1}${strings[index + 1] ?? ""}`;
    return (await pg.query<T>(query, values)).rows;
  }) as Sql;
  sql.query = async <T = Record<string, unknown>>(query: string, params: unknown[] = []) => (await pg.query<T>(query, params)).rows;
  await pg.query("insert into organizations (id,name,slug,created_by) values ('org','Org','org','u')");
  await pg.query("insert into workspaces (id,organization_id,name,slug,created_by) values ('ws','org','Ws','ws','u'), ('other','org','Other','other','u')");
  await pg.query("insert into workspace_memberships (workspace_id,user_id,role) values ('ws','u','workspace_admin'), ('other','other-user','workspace_admin')");
  return { pg, sql };
}

test("tool catalog is isolated and draft permissions are frozen by version", async () => {
  const { pg, sql } = await setup();
  try {
    await pg.query("insert into tools (id,workspace_id,key,name,description,input_schema) values ('tool-ws','ws','catalog.lookup','Catalog','Lookup','{}'), ('tool-other','other','secret.lookup','Other','Other','{}')");
    await pg.query("insert into agents (id,workspace_id,name,slug,created_by,updated_by) values ('agent','ws','Agent','agent','u','u')");
    await pg.query("insert into agent_versions (id,agent_id,version_number,status,config,created_by) values ('version-draft','agent',1,'draft','{}','u'), ('version-published','agent',2,'published','{}','u')");
    const tools = await listWorkspaceTools(sql, "u", "ws");
    assert.equal(tools.some((tool) => tool.id === "tool-ws"), true);
    assert.equal(tools.some((tool) => tool.id === "tool-other"), false);
    const permission = await setAgentToolPermission(sql, "u", { workspaceId: "ws", agentVersionId: "version-draft", toolId: "tool-ws", enabled: true, requireApproval: true });
    assert.equal(permission.requireApproval, true);
    await assert.rejects(() => setAgentToolPermission(sql, "u", { workspaceId: "ws", agentVersionId: "version-published", toolId: "tool-ws", enabled: true }), /AGENT_VERSION_DRAFT_REQUIRED/);
  } finally { await pg.close(); }
});

test("tool execution approval is workspace-scoped and changes execution state", async () => {
  const { pg, sql } = await setup();
  try {
    await pg.query("insert into tools (id,key,name,description,input_schema) values ('tool','tool.write','Write','Write','{}')");
    await pg.query("insert into tool_executions (id,workspace_id,tool_id,requested_by,status,input_hash) values ('exec','ws','tool','workflow','running','hash')");
    const approval = await requestToolExecutionApproval(sql, "u", { workspaceId: "ws", toolExecutionId: "exec", reason: "Confirmar ação" });
    assert.equal(approval.status, "pending");
    await decideToolExecutionApproval(sql, "u", { workspaceId: "ws", approvalId: approval.id, decision: "approved" });
    const result = (await pg.query<{ status: string; approved_by: string }>("select status, approved_by from tool_executions where id = 'exec'")).rows[0];
    assert.equal(result.status, "approved");
    assert.equal(result.approved_by, "u");
    await assert.rejects(() => requestToolExecutionApproval(sql, "other-user", { workspaceId: "other", toolExecutionId: "exec" }), /TOOL_EXECUTION_NOT_FOUND/);
  } finally { await pg.close(); }
});
