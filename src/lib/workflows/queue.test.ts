import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import type { Sql } from "../db.ts";
import { claimWorkflowRun, completeWorkflowRun, failOrRetryWorkflowRun, renewWorkflowLease } from "./queue.ts";
import { runNextWorkflowRun } from "./executor.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../");
async function setup() {
  const pg = new PGlite(); await pg.waitReady;
  const names = ["multi_tenant_core", "connector_registry", "messaging_dispatch", "webhook_security", "webhook_delivery_states", "agent_runtime_jobs", "conversation_handoff", "agent_runtime_execution_logs", "workflow_core", "workflow_triggers_events", "workflow_queue_leases", "tool_gateway", "workflow_scheduler", "internal_events", "workflow_wait_resume"];
  for (let i = 0; i < names.length; i += 1) await pg.exec(await readFile(join(root, "migrations", `${String(i + 2).padStart(4, "0")}_${names[i]}.sql`), "utf8"));
  await pg.query("insert into organizations (id,name,slug,created_by) values ('org','Org','org','u')");
  await pg.query("insert into workspaces (id,organization_id,name,slug,created_by) values ('ws','org','Ws','ws','u')");
  await pg.query("insert into workflows (id,workspace_id,name,slug,created_by,updated_by) values ('wf','ws','Wf','wf','u','u')");
  await pg.query("insert into workflow_versions (id,workflow_id,version_number,status,created_by) values ('v1','wf',1,'published','u')");
  await pg.query("insert into workflow_runs (id,workspace_id,workflow_id,workflow_version_id,correlation_id,idempotency_key) values ('run','ws','wf','v1','corr','key')");
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) => { let text = strings[0] ?? ""; for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1] ?? ""}`; return (await pg.query<T>(text, values)).rows; }) as Sql;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows;
  return { pg, sql };
}

test("claims, renews, retries and completes a workflow run", async () => {
  const { pg, sql } = await setup();
  try {
    const first = await claimWorkflowRun(sql, "worker-a", 30);
    assert.equal(first?.id, "run");
    assert.equal(await renewWorkflowLease(sql, "run", "worker-a"), true);
    assert.equal(await failOrRetryWorkflowRun(sql, "run", "worker-a", "TEMP", "temporary"), "queued");
    await pg.query("update workflow_runs set next_attempt_at = current_timestamp where id = 'run'");
    const second = await claimWorkflowRun(sql, "worker-b", 30);
    assert.equal(second?.attempts, 2);
    assert.equal(await completeWorkflowRun(sql, "run", "worker-b", { ok: true }), true);
    assert.equal((await pg.query<{ status: string }>("select status from workflow_runs where id = 'run'")).rows[0]?.status, "succeeded");
  } finally { await pg.close(); }
});

test("executes compiled condition edges and persists a waiting node", async () => {
  const { pg, sql } = await setup();
  try {
    await pg.query("update workflow_versions set definition = $1::jsonb where id = 'v1'", [JSON.stringify({ nodes: [{ id: "check", type: "condition", config: { field: "source", equals: "ads" } }, { id: "pause", type: "wait" }], edges: [{ from: "check", to: "pause" }] })]);
    await pg.query("update workflow_runs set input = $1::jsonb where id = 'run'", [JSON.stringify({ source: "ads" })]);
    const result = await runNextWorkflowRun(sql, "workflow-worker");
    assert.equal(result.status, "waiting");
    assert.equal((await pg.query<{ status: string }>("select status from workflow_runs where id = 'run'")).rows[0]?.status, "waiting");
    assert.equal((await pg.query<{ status: string }>("select status from workflow_node_runs where run_id = 'run' and node_id = 'check'")).rows[0]?.status, "succeeded");
  } finally { await pg.close(); }
});
