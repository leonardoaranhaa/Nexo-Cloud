import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db.ts";
import type { AgentRuntimeJob } from "./queue.ts";
import { reserveRuntimeQuota, RuntimeQuotaExceededError } from "./quota.ts";

type QuotaJob = Pick<AgentRuntimeJob, "workspace_id" | "agent_id">;

async function setup() {
  const root = process.cwd();
  const pg = new PGlite();
  for (const file of ["0002_multi_tenant_core.sql", "0003_connector_registry.sql", "0004_messaging_dispatch.sql", "0007_agent_runtime_jobs.sql", "0038_agent_runtime_quotas.sql"]) {
    await pg.exec(await readFile(join(root, "migrations", file), "utf8"));
  }
  await pg.query("insert into organizations (id,name,slug,created_by) values ('org-a','Org A','org-a','u')");
  await pg.query("insert into organizations (id,name,slug,created_by) values ('org-b','Org B','org-b','u')");
  await pg.query("insert into workspaces (id,organization_id,name,slug,created_by) values ('ws-a','org-a','A','a','u'), ('ws-b','org-b','B','b','u')");
  await pg.query("insert into agents (id,workspace_id,name,slug,created_by,updated_by) values ('agent-a','ws-a','Agent A','agent-a','u','u'), ('agent-b','ws-a','Agent B','agent-b','u','u'), ('agent-other','ws-b','Other','other','u','u')");
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0] ?? "";
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1] ?? ""}`;
    return (await pg.query<T>(text, values)).rows;
  }) as Sql;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows;
  return { pg, sql };
}

test("quota applies workspace and agent limits independently", async () => {
  const { pg, sql } = await setup();
  try {
    await pg.query("insert into agent_runtime_quota_policies (workspace_id, workspace_daily_limit, agent_daily_limit) values ('ws-a', 3, 2)");
    const agentA: QuotaJob = { workspace_id: "ws-a", agent_id: "agent-a" };
    const agentB: QuotaJob = { workspace_id: "ws-a", agent_id: "agent-b" };
    await reserveRuntimeQuota(sql, agentA);
    await reserveRuntimeQuota(sql, agentA);
    await assert.rejects(() => reserveRuntimeQuota(sql, agentA), (error: unknown) => error instanceof RuntimeQuotaExceededError && error.scope === "agent");
    await reserveRuntimeQuota(sql, agentB);
    await assert.rejects(() => reserveRuntimeQuota(sql, agentB), (error: unknown) => error instanceof RuntimeQuotaExceededError && error.scope === "workspace");
  } finally { await pg.close(); }
});

test("quota usage is isolated by workspace", async () => {
  const { pg, sql } = await setup();
  try {
    await pg.query("insert into agent_runtime_quota_policies (workspace_id, workspace_daily_limit, agent_daily_limit) values ('ws-a', 1, 1), ('ws-b', 1, 1)");
    await reserveRuntimeQuota(sql, { workspace_id: "ws-a", agent_id: "agent-a" });
    await reserveRuntimeQuota(sql, { workspace_id: "ws-b", agent_id: "agent-other" });
    const rows = await pg.query<{ workspace_id: string; executions: number }>("select workspace_id, executions from agent_runtime_quota_workspace_usage order by workspace_id");
    assert.deepEqual(rows.rows.map((row) => row.workspace_id), ["ws-a", "ws-b"]);
    assert.deepEqual(rows.rows.map((row) => Number(row.executions)), [1, 1]);
  } finally { await pg.close(); }
});
