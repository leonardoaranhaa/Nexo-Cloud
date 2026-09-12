import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import type { Sql } from "../db.ts";
import { generateWorkflowFromBlueprint } from "./workflows.ts";
import { publishWorkflow } from "../workflows/server.ts";

const root = join(fileURLToPath(new URL("../../..", import.meta.url)));

async function fixture() {
  const pg = new PGlite();
  await pg.waitReady;
  for (let number = 2; number <= 16; number += 1) {
    const names: Record<number, string> = { 2: "multi_tenant_core", 3: "connector_registry", 4: "messaging_dispatch", 5: "webhook_security", 6: "webhook_delivery_states", 7: "agent_runtime_jobs", 8: "conversation_handoff", 9: "agent_runtime_execution_logs", 10: "workflow_core", 11: "workflow_triggers_events", 12: "workflow_queue_leases", 13: "tool_gateway", 14: "workflow_scheduler", 15: "internal_events", 16: "workflow_wait_resume" };
    await pg.exec(await readFile(join(root, "migrations", `${String(number).padStart(4, "0")}_${names[number]}.sql`), "utf8"));
  }
  for (const file of ["0030_tool_execution_domain.sql", "0031_agent_development_blueprints.sql", "0041_workflow_error_handlers.sql", "0044_agent_tool_proposals.sql", "0045_agent_blueprint_workflows.sql"]) {
    await pg.exec(await readFile(join(root, "migrations", file), "utf8"));
  }
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
    let text = strings[0] ?? "";
    for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1] ?? ""}`;
    return (await pg.query<T>(text, values)).rows;
  }) as Sql;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows;
  await pg.query("insert into organizations (id,name,slug,created_by) values ('org','Org','org','builder')");
  await pg.query("insert into workspaces (id,organization_id,name,slug,created_by) values ('ws','org','Workspace','ws','builder'), ('other','org','Other','other','other-user')");
  await pg.query("insert into workspace_memberships (workspace_id,user_id,role) values ('ws','builder','builder'), ('other','other-user','workspace_admin')");
  await pg.query("insert into agents (id,workspace_id,name,slug,status,language,persona,welcome_message,system_prompt,created_by,updated_by) values ('agent','ws','Vendas','vendas','draft','pt','Consultor','Olá!','Converta com responsabilidade.','builder','builder'), ('other-agent','other','Outro','outro','draft','pt','Atendente','Olá!','Ajude.','other-user','other-user')");
  await pg.query("insert into agent_versions (id,agent_id,version_number,status,config,created_by) values ('agent-draft','agent',1,'draft',$1::jsonb,'builder')", [JSON.stringify({ name: "Vendas", systemPrompt: "Converta com responsabilidade." })]);
  await pg.query("insert into agent_development_blueprints (id,workspace_id,agent_id,agent_type,objectives,capabilities,source_brief,created_by,updated_by) values ('blueprint','ws','agent','sales',$1::jsonb,$2::jsonb,'Atenda e encaminhe o cliente com segurança.','builder','builder')", [JSON.stringify(["Atender o cliente"]), JSON.stringify(["enviar mensagem via Evolution", "CRM e lead", "capacidade futura não suportada"]) ]);
  await pg.query("insert into agent_development_blueprints (id,workspace_id,agent_id,agent_type,capabilities,created_by,updated_by) values ('other-blueprint','other','other-agent','support',$1::jsonb,'other-user','other-user')", [JSON.stringify(["CRM"]) ]);
  await pg.query("insert into connections (id,workspace_id,name,provider,status,secret_ref,config,created_by) values ('conn','ws','Evolution','evolution','connected','ref/ws/conn','{}','builder')");
  await pg.query("insert into agent_connections (agent_id,connection_id,is_primary) values ('agent','conn',true)");
  await pg.query("insert into tools (id,workspace_id,key,name,description,input_schema,output_schema,risk_level,status,version) values ('tool-ws-evolution','ws','evolution.send_text','Enviar texto','Envia texto','{\"type\":\"object\"}','{\"type\":\"object\"}','write','active',1)");
  await pg.query("insert into agent_tool_proposals (id,workspace_id,agent_id,blueprint_id,capability,tool_id,tool_key,name,description,input_schema,output_schema,risk_level,requires_approval,status,created_by) values ('proposal','ws','agent','blueprint','enviar mensagem via Evolution','tool-ws-evolution','evolution.send_text','Enviar texto','Envia texto','{\"type\":\"object\"}','{\"type\":\"object\"}','write',true,'approved','builder')");
  await pg.query("insert into agent_tool_permissions (id,workspace_id,agent_version_id,tool_id,enabled,require_approval,allowed_scopes) values ('permission','ws','agent-draft','tool-ws-evolution',true,true,'{}')");
  return { pg, sql };
}

test("B3 generates an idempotent compilable workflow draft without publishing or running it", async () => {
  const { pg, sql } = await fixture();
  try {
    const first = await generateWorkflowFromBlueprint(sql, "builder", { workspaceId: "ws", agentId: "agent", blueprintId: "blueprint" });
    assert.equal(first.workflow.status, "draft");
    assert.equal(first.workflowVersionId.length > 0, true);
    assert.deepEqual(first.definition.nodes.map((node) => node.type), ["agent", "approval", "tool"]);
    assert.equal(first.definition.edges.length, 2);
    assert.deepEqual(first.materializedToolKeys, ["evolution.send_text"]);
    assert.equal(first.definition.nodes.find((node) => node.type === "tool")?.config?.agentId, "agent");
    assert.equal(first.definition.nodes.find((node) => node.type === "tool")?.config?.approvalNodeId, "approval-1");
    assert.deepEqual(first.pendingCapabilities, ["CRM e lead", "capacidade futura não suportada"]);
    assert.equal(first.publishedVersionPreserved, false);
    const runs = await pg.query<{ count: number }>("select count(*)::int as count from workflow_runs");
    assert.equal(runs.rows[0]?.count, 0);
    const second = await generateWorkflowFromBlueprint(sql, "builder", { workspaceId: "ws", agentId: "agent", blueprintId: "blueprint" });
    assert.equal(second.workflow.id, first.workflow.id);
    assert.equal((await pg.query<{ count: number }>("select count(*)::int as count from workflows")).rows[0]?.count, 1);
    assert.equal((await pg.query<{ count: number }>("select count(*)::int as count from agent_blueprint_workflows")).rows[0]?.count, 1);
  } finally {
    await pg.close();
  }
});

test("B3 preserves a published workflow snapshot while refreshing only its draft version", async () => {
  const { pg, sql } = await fixture();
  try {
    const generated = await generateWorkflowFromBlueprint(sql, "builder", { workspaceId: "ws", agentId: "agent", blueprintId: "blueprint" });
    await publishWorkflow(sql, "builder", { workspaceId: "ws", workflowId: generated.workflow.id });
    const publishedBefore = await pg.query<{ definition: unknown }>("select definition from workflow_versions where workflow_id = $1 and status = 'published'", [generated.workflow.id]);
    const refreshed = await generateWorkflowFromBlueprint(sql, "builder", { workspaceId: "ws", agentId: "agent", blueprintId: "blueprint" });
    const publishedAfter = await pg.query<{ definition: unknown }>("select definition from workflow_versions where workflow_id = $1 and status = 'published'", [generated.workflow.id]);
    assert.equal(refreshed.publishedVersionPreserved, true);
    assert.deepEqual(publishedAfter.rows[0]?.definition, publishedBefore.rows[0]?.definition);
    assert.equal((await pg.query<{ count: number }>("select count(*)::int as count from workflow_runs")).rows[0]?.count, 0);
  } finally {
    await pg.close();
  }
});

test("B3 rejects cross-workspace blueprint access before creating a workflow", async () => {
  const { pg, sql } = await fixture();
  try {
    await assert.rejects(
      () => generateWorkflowFromBlueprint(sql, "other-user", { workspaceId: "ws", agentId: "agent", blueprintId: "blueprint" }),
      /WORKSPACE|permission/i,
    );
    assert.equal((await pg.query<{ count: number }>("select count(*)::int as count from workflows")).rows[0]?.count, 0);
  } finally {
    await pg.close();
  }
});
