import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db.ts";
import { publishStatusChange, publishWorkflowEvent } from "./events.ts";

async function setup(): Promise<{ pg: PGlite; sql: Sql }> {
  const pg = new PGlite(); await pg.waitReady;
  const names = ["multi_tenant_core", "connector_registry", "messaging_dispatch", "webhook_security", "webhook_delivery_states", "agent_runtime_jobs", "conversation_handoff", "agent_runtime_execution_logs", "workflow_core", "workflow_triggers_events", "workflow_queue_leases", "tool_gateway", "workflow_scheduler", "internal_events"];
  for (let i = 0; i < names.length; i += 1) await pg.exec(await readFile(`/home/ubuntu/work/grok-workspace/migrations/${String(i + 2).padStart(4, "0")}_${names[i]}.sql`, "utf8"));
  await pg.query("insert into organizations (id,name,slug,created_by) values ('org','Org','org','u')"); await pg.query("insert into workspaces (id,organization_id,name,slug,created_by) values ('ws','org','Ws','ws','u'), ('other','org','Other','other','u')");
  await pg.query("insert into workflows (id,workspace_id,name,slug,trigger_type,status,created_by,updated_by) values ('wf','ws','Wf','wf','status_change','active','u','u')"); await pg.query("insert into workflow_versions (id,workflow_id,version_number,status,created_by,definition) values ('v1','wf',1,'published','u','{\"nodes\":[],\"edges\":[]}')");
  await pg.query("insert into workflow_triggers (id,workflow_id,type,config) values ('tr','wf','status_change',$1)", [JSON.stringify({ entityType: "conversation", toStatus: "human" })]);
  return { pg, sql: { query: async <T>(query: string, params?: unknown[]) => (await pg.query<T>(query, params)).rows } as Sql };
}

test("publishes a matching status change and ignores duplicates", async () => {
  const { pg, sql } = await setup();
  try {
    const first = await publishStatusChange(sql, { workspaceId: "ws", entityType: "conversation", entityId: "conv-1", fromStatus: "open", toStatus: "human", payload: { reason: "operator" } });
    assert.equal(first.duplicate, false); assert.equal(first.enqueuedRunIds.length, 1);
    const duplicate = await publishStatusChange(sql, { workspaceId: "ws", entityType: "conversation", entityId: "conv-1", fromStatus: "open", toStatus: "human", payload: { reason: "operator" } });
    assert.equal(duplicate.duplicate, true); assert.equal((await pg.query<{ count: number }>("select count(*)::int as count from workflow_runs")).rows[0]?.count, 1);
  } finally { await pg.close(); }
});

test("does not route an event across workspaces", async () => {
  const { pg, sql } = await setup();
  try { const result = await publishWorkflowEvent(sql, { workspaceId: "other", eventType: "conversation.status_changed", source: "internal", idempotencyKey: "other:1", entityType: "conversation", toStatus: "human", payload: {} }); assert.equal(result.enqueuedRunIds.length, 0); } finally { await pg.close(); }
});
