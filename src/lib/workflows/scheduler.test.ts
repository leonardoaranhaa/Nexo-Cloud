import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db.ts";
import { nextCronOccurrence, pollScheduledWorkflows, validateCron } from "./scheduler.ts";

async function setup() {
  const pg = new PGlite(); await pg.waitReady;
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../../");
  const names = ["multi_tenant_core", "connector_registry", "messaging_dispatch", "webhook_security", "webhook_delivery_states", "agent_runtime_jobs", "conversation_handoff", "agent_runtime_execution_logs", "workflow_core", "workflow_triggers_events", "workflow_queue_leases", "tool_gateway", "workflow_scheduler"];
  for (let i = 0; i < names.length; i += 1) await pg.exec(await readFile(join(root, "migrations", `${String(i + 2).padStart(4, "0")}_${names[i]}.sql`), "utf8"));
  await pg.query("insert into organizations (id,name,slug,created_by) values ('org','Org','org','u')");
  await pg.query("insert into workspaces (id,organization_id,name,slug,created_by) values ('ws','org','Ws','ws','u')");
  await pg.query("insert into workflows (id,workspace_id,name,slug,trigger_type,status,created_by,updated_by) values ('wf','ws','Wf','wf','schedule','active','u','u')");
  await pg.query("insert into workflow_versions (id,workflow_id,version_number,status,created_by,definition) values ('v1','wf',1,'published','u','{\"nodes\":[],\"edges\":[]}')");
  await pg.query("insert into workflow_triggers (id,workflow_id,type,config,next_run_at) values ('tr','wf','schedule',$1,$2)", [JSON.stringify({ cronExpression: "*/5 * * * *", input: { source: "schedule" } }), "2026-09-10T12:00:00.000Z"]);
  return { pg, sql: { query: async <T>(query: string, params?: unknown[]) => (await pg.query<T>(query, params)).rows } as Sql };
}

test("validates five-field cron and calculates the next UTC occurrence", () => {
  validateCron("*/5 * * * *");
  assert.equal(nextCronOccurrence("*/5 * * * *", new Date("2026-09-10T12:00:00.000Z")).toISOString(), "2026-09-10T12:05:00.000Z");
  assert.throws(() => validateCron("every five minutes"), /CRON_FIELD_INVALID|CRON_REQUIRES_FIVE_FIELDS/);
});

test("claims a due schedule and enqueues an idempotent workflow run", async () => {
  const { pg, sql } = await setup();
  try {
    const result = await pollScheduledWorkflows(sql, "scheduler-1", new Date("2026-09-10T12:00:00.000Z"));
    assert.equal(result.claimed, 1); assert.equal(result.enqueued.length, 1);
    const duplicate = await pollScheduledWorkflows(sql, "scheduler-2", new Date("2026-09-10T12:00:00.000Z"));
    assert.equal(duplicate.claimed, 0);
    assert.equal((await pg.query<{ count: number }>("select count(*)::int as count from workflow_runs")).rows[0]?.count, 1);
    assert.equal((await pg.query<{ next_run_at: Date }>("select next_run_at from workflow_triggers where id = 'tr'")).rows[0]?.next_run_at.toISOString(), "2026-09-10T12:05:00.000Z");
  } finally { await pg.close(); }
});
