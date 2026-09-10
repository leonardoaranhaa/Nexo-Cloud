import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import type { Sql } from "../db.ts";
import { createWorkflow, listWorkflowRuns, listWorkflows, publishWorkflow, runWorkflowManually, saveWorkflowDefinition } from "./server.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../");

async function setup() {
  const pg = new PGlite();
  await pg.waitReady;
  for (let number = 2; number <= 10; number += 1) {
    const file = `${String(number).padStart(4, "0")}_${({ 2: "multi_tenant_core", 3: "connector_registry", 4: "messaging_dispatch", 5: "webhook_security", 6: "webhook_delivery_states", 7: "agent_runtime_jobs", 8: "conversation_handoff", 9: "agent_runtime_execution_logs", 10: "workflow_core" } as Record<number, string>)[number]}.sql`;
    await pg.exec(await readFile(join(root, "migrations", file), "utf8"));
  }
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
    let text = strings[0] ?? "";
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1] ?? ""}`;
    return (await pg.query<T>(text, values)).rows;
  }) as Sql;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows;
  await pg.query("insert into organizations (id,name,slug,created_by) values ('org','Org','org','operator')");
  await pg.query("insert into workspaces (id,organization_id,name,slug,created_by) values ('ws','org','Ws','ws','operator'), ('other','org','Other','other','operator')");
  await pg.query("insert into workspace_memberships (workspace_id,user_id,role) values ('ws','builder','builder'), ('ws','operator','operator')");
  return { pg, sql };
}

test("creates, publishes and runs a workflow version", async () => {
  const { pg, sql } = await setup();
  try {
    const workflow = await createWorkflow(sql, "builder", { workspaceId: "ws", name: "Qualificação de lead" });
    await saveWorkflowDefinition(sql, "builder", { workspaceId: "ws", workflowId: workflow.id, definition: { nodes: [{ id: "check", type: "condition", config: { field: "source", equals: "ads" } }], edges: [] } });
    await publishWorkflow(sql, "builder", { workspaceId: "ws", workflowId: workflow.id });
    const published = (await listWorkflows(sql, "builder", { workspaceId: "ws" }))[0];
    assert.equal(published?.status, "active");
    assert.equal(published?.versionNumber, 1);
    const run = await runWorkflowManually(sql, "operator", { workspaceId: "ws", workflowId: workflow.id, input: { source: "ads" }, idempotencyKey: "lead-1" });
    assert.equal(run.status, "succeeded");
    assert.equal((await listWorkflowRuns(sql, "operator", { workspaceId: "ws", workflowId: workflow.id })).length, 1);
  } finally {
    await pg.close();
  }
});

test("requires a published workflow and blocks cross-workspace access", async () => {
  const { pg, sql } = await setup();
  try {
    const workflow = await createWorkflow(sql, "builder", { workspaceId: "ws", name: "Rascunho" });
    await assert.rejects(runWorkflowManually(sql, "operator", { workspaceId: "ws", workflowId: workflow.id }), /WORKFLOW_NOT_PUBLISHED/);
    await assert.rejects(listWorkflows(sql, "builder", { workspaceId: "other" }), /Workspace access denied/);
  } finally {
    await pg.close();
  }
});
