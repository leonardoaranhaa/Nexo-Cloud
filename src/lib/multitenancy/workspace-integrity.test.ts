import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import type { Sql } from "../db.ts";

const root = join(fileURLToPath(new URL("../../../", import.meta.url)));

async function fixture() {
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
  await pg.query("insert into organizations (id,name,slug,created_by) values ('org','Org','org','user')");
  await pg.query("insert into workspaces (id,organization_id,name,slug,created_by) values ('ws','org','Ws','ws','user'),('other','org','Other','other','user')");
  await pg.query("insert into agents (id,workspace_id,name,slug,created_by,updated_by) values ('agent','ws','Agent','agent','user','user'),('other-agent','other','Other','other-agent','user','user')");
  await pg.query("insert into agent_versions (id,agent_id,version_number,status,config,created_by) values ('version','agent',1,'draft','{}','user'),('other-version','other-agent',1,'draft','{}','user')");
  await pg.query("insert into connections (id,workspace_id,name,provider,created_by) values ('conn','ws','Connection','evolution','user'),('other-conn','other','Other connection','evolution','user')");
  await pg.query("insert into tools (id,workspace_id,key,name,description) values ('tool','ws','workspace.tool','Tool','Tool')");
  return { pg, sql };
}

test("database rejects cross-workspace agent connection links", async () => {
  const { pg } = await fixture();
  try {
    await assert.rejects(pg.query("insert into agent_connections (agent_id,connection_id,is_primary) values ('agent','other-conn',true)"), /WORKSPACE_ISOLATION_AGENT_CONNECTION/);
  } finally {
    await pg.close();
  }
});

test("database rejects cross-workspace tool permissions", async () => {
  const { pg } = await fixture();
  try {
    await assert.rejects(pg.query("insert into agent_tool_permissions (id,workspace_id,agent_version_id,tool_id) values ('permission','other','version','tool')"), /WORKSPACE_ISOLATION_TOOL_PERMISSION/);
  } finally {
    await pg.close();
  }
});
