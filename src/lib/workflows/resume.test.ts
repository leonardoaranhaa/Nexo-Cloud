import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db.ts";
import { runNextWorkflowRun } from "./executor.ts";
import { expireWorkflowApprovals, requestWorkflowWaitResume } from "./resume.ts";

async function setup() {
  const pg = new PGlite(); await pg.waitReady;
  const names = ["multi_tenant_core", "connector_registry", "messaging_dispatch", "webhook_security", "webhook_delivery_states", "agent_runtime_jobs", "conversation_handoff", "agent_runtime_execution_logs", "workflow_core", "workflow_triggers_events", "workflow_queue_leases", "tool_gateway", "workflow_scheduler", "internal_events", "workflow_wait_resume"];
  for (let i = 0; i < names.length; i += 1) await pg.exec(await readFile(`/home/ubuntu/work/grok-workspace/migrations/${String(i + 2).padStart(4, "0")}_${names[i]}.sql`, "utf8"));
  await pg.query("insert into organizations (id,name,slug,created_by) values ('org','Org','org','u')"); await pg.query("insert into workspaces (id,organization_id,name,slug,created_by) values ('ws','org','Ws','ws','u')"); await pg.query("insert into workflows (id,workspace_id,name,slug,created_by,updated_by) values ('wf','ws','Wf','wf','u','u')"); await pg.query("insert into workflow_versions (id,workflow_id,version_number,status,created_by,definition) values ('v1','wf',1,'published','u',$1::jsonb)", [JSON.stringify({ nodes: [{ id: "pause", type: "wait", config: {} }], edges: [] })]); await pg.query("insert into workflow_runs (id,workspace_id,workflow_id,workflow_version_id,correlation_id,idempotency_key) values ('run','ws','wf','v1','corr','key')");
  const sql = { query: async <T>(query: string, params?: unknown[]) => (await pg.query<T>(query, params)).rows } as Sql; return { pg, sql };
}

test("resumes a waiting node exactly once", async () => {
  const { pg, sql } = await setup();
  try { assert.equal((await runNextWorkflowRun(sql, "worker")).status, "waiting"); assert.equal(await requestWorkflowWaitResume(sql, { workspaceId: "ws", runId: "run", reason: "operator" }), true); assert.equal((await runNextWorkflowRun(sql, "worker-2")).status, "succeeded"); assert.equal(await requestWorkflowWaitResume(sql, { workspaceId: "ws", runId: "run" }), false); } finally { await pg.close(); }
});

test("expires pending approvals and cancels the waiting run", async () => {
  const { pg, sql } = await setup();
  try { await pg.query("insert into workflow_node_runs (id,run_id,node_id,node_type,status,input) values ('nr','run','approval','approval','waiting','{}')"); await pg.query("insert into workflow_approvals (id,run_id,node_run_id,workspace_id,requested_by,expires_at) values ('ap','run','nr','ws','workflow',$1)", ["2026-09-10T11:00:00.000Z"]); await pg.query("update workflow_runs set status = 'waiting', current_node_id = 'approval' where id = 'run'"); assert.equal(await expireWorkflowApprovals(sql, new Date("2026-09-10T12:00:00.000Z")), 1); assert.equal((await pg.query<{ status: string }>("select status from workflow_runs where id='run'")).rows[0]?.status, "canceled"); } finally { await pg.close(); }
});
