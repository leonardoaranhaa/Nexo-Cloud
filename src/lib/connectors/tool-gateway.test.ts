import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import type { Sql } from "../db.ts";
import { memorySecretProvider } from "./secrets.ts";
import { executeWorkflowTool } from "./tool-gateway.ts";
import type { ClaimedWorkflowRun } from "../workflows/queue.ts";
import type { WorkflowNode } from "../workflows/server.ts";

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

  await pg.query("insert into organizations (id,name,slug,created_by) values ('org','Org','org','builder')");
  await pg.query("insert into workspaces (id,organization_id,name,slug,created_by) values ('ws','org','Workspace','ws','builder'), ('other','org','Other','other','other-user')");
  await pg.query("insert into workspace_memberships (workspace_id,user_id,role) values ('ws','builder','workspace_admin'), ('other','other-user','workspace_admin')");
  await pg.query("insert into agents (id,workspace_id,name,slug,status,system_prompt,created_by,updated_by) values ('agent','ws','Agent','agent','active','Seja objetivo.','builder','builder'), ('other-agent','other','Other','other-agent','active','Ajude.','other-user','other-user')");
  await pg.query("insert into agent_versions (id,agent_id,version_number,status,config,created_by) values ('agent-published','agent',1,'published','{}','builder'), ('agent-draft','agent',2,'draft','{}','builder'), ('other-published','other-agent',1,'published','{}','other-user')");
  await pg.query("insert into connections (id,workspace_id,name,provider,status,secret_ref,config,created_by) values ('conn','ws','Evolution','evolution','connected','nexo/ws/conn/api_key',$1::jsonb,'builder')", [JSON.stringify({ baseUrl: "http://127.0.0.1:1", instance: "store" })]);
  await pg.query("insert into tools (id,workspace_id,key,name,description,input_schema,output_schema,risk_level,status,version) values ('tool-send','ws','evolution.send_text','Send text','Send text',$1::jsonb,$2::jsonb,'write','active',1)", [JSON.stringify({ type: "object", required: ["connectionId", "recipient", "text"] }), JSON.stringify({ type: "object" })]);
  return { pg, sql };
}

function node(overrides: Record<string, unknown> = {}): WorkflowNode {
  return {
    id: "tool-node",
    type: "tool",
    config: {
      agentId: "agent",
      toolKey: "evolution.send_text",
      connectionId: "conn",
      recipient: "+5511999999999",
      text: "Olá",
      approved: true,
      ...overrides,
    },
  };
}

async function createWorkflowRun(sql: Sql, workflowVersionId: string, id = `run-${Math.random().toString(36).slice(2)}`): Promise<ClaimedWorkflowRun> {
  await sql.query(
    `insert into workflow_runs (id, workspace_id, workflow_id, workflow_version_id, status, input, correlation_id, idempotency_key)
     values ($1,'ws','workflow',$2,'running','{}'::jsonb,$3,$4)`,
    [id, workflowVersionId, `trace-${id}`, `key-${id}`],
  );
  return {
    id,
    workspace_id: "ws",
    workflow_id: "workflow",
    workflow_version_id: workflowVersionId,
    input: {},
    context: {},
    attempts: 1,
    max_attempts: 1,
    correlation_id: `trace-${id}`,
  };
}

async function createWorkflow(sql: Sql, status: "published" | "draft", versionId: string): Promise<void> {
  await sql.query("insert into workflows (id,workspace_id,name,slug,status,trigger_type,created_by,updated_by) values ('workflow','ws','Workflow','workflow','active','manual','builder','builder')");
  const definition = { nodes: [{ id: "agent-node", type: "agent", config: { agentId: "agent" } }, node()], edges: [{ from: "agent-node", to: "tool-node" }] };
  await sql.query("insert into workflow_versions (id,workflow_id,version_number,status,definition,created_by) values ($1,'workflow',1,$2,$3::jsonb,'builder')", [versionId, status, JSON.stringify(definition)]);
}

async function grantPermission(sql: Sql, options: { versionId?: string; enabled?: boolean; requireApproval?: boolean; workspaceId?: string } = {}): Promise<void> {
  await sql.query(
    "insert into agent_tool_permissions (id,workspace_id,agent_version_id,tool_id,enabled,require_approval,allowed_scopes) values ($1,$2,$3,'tool-send',$4,$5,'{}')",
    [`permission-${Math.random().toString(36).slice(2)}`, options.workspaceId ?? "ws", options.versionId ?? "agent-published", options.enabled ?? true, options.requireApproval ?? false],
  );
}

async function localEvolutionServer() {
  const requests: string[] = [];
  const server = createServer(async (request, response) => {
    requests.push(request.url ?? "");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ key: { id: "provider-tool-1" } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  return { server, baseUrl: `http://127.0.0.1:${address.port}`, requests };
}

async function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("Tool Gateway rejects node.config.approved without published-version permission", async () => {
  const { pg, sql } = await fixture();
  try {
    await createWorkflow(sql, "published", "workflow-published");
    const run = await createWorkflowRun(sql, "workflow-published");
    await assert.rejects(() => executeWorkflowTool(sql, node(), {}, run), /TOOL_NOT_ALLOWED/);
    const executions = await pg.query<{ count: number }>("select count(*)::int as count from tool_executions where workspace_id = 'ws'");
    assert.equal(executions.rows[0]?.count, 0);
  } finally {
    await pg.close();
  }
});

test("Tool Gateway rejects a permission attached only to a draft agent version", async () => {
  const { pg, sql } = await fixture();
  try {
    await createWorkflow(sql, "published", "workflow-published");
    await grantPermission(sql, { versionId: "agent-draft" });
    const run = await createWorkflowRun(sql, "workflow-published");
    await assert.rejects(() => executeWorkflowTool(sql, node(), {}, run), /TOOL_NOT_ALLOWED/);
  } finally {
    await pg.close();
  }
});

test("Tool Gateway rejects disabled published-version permissions", async () => {
  const { pg, sql } = await fixture();
  try {
    await createWorkflow(sql, "published", "workflow-published");
    await grantPermission(sql, { enabled: false });
    const run = await createWorkflowRun(sql, "workflow-published");
    await assert.rejects(() => executeWorkflowTool(sql, node(), {}, run), /TOOL_NOT_ALLOWED/);
  } finally {
    await pg.close();
  }
});

test("Tool Gateway rejects workflow runs pinned to a draft workflow version", async () => {
  const { pg, sql } = await fixture();
  try {
    await createWorkflow(sql, "draft", "workflow-draft");
    await grantPermission(sql);
    const run = await createWorkflowRun(sql, "workflow-draft");
    await assert.rejects(() => executeWorkflowTool(sql, node(), {}, run), /WORKFLOW_VERSION_NOT_PUBLISHED/);
  } finally {
    await pg.close();
  }
});

test("Tool Gateway requires a persisted approval for a published write permission", async () => {
  const server = await localEvolutionServer();
  const { pg, sql } = await fixture();
  try {
    await pg.query("update connections set config = $1::jsonb where id = 'conn'", [JSON.stringify({ baseUrl: server.baseUrl, instance: "store" })]);
    await createWorkflow(sql, "published", "workflow-published");
    await grantPermission(sql, { requireApproval: true });
    const run = await createWorkflowRun(sql, "workflow-published");
    await assert.rejects(() => executeWorkflowTool(sql, node({ approvalNodeId: "approval-node" }), {}, run), /TOOL_APPROVAL_REQUIRED/);
    assert.deepEqual(server.requests, []);
  } finally {
    await pg.close();
    await closeServer(server.server);
  }
});

test("Tool Gateway authorizes the exact published version after persisted approval", async () => {
  const server = await localEvolutionServer();
  const { pg, sql } = await fixture();
  try {
    await pg.query("update connections set config = $1::jsonb where id = 'conn'", [JSON.stringify({ baseUrl: server.baseUrl, instance: "store" })]);
    await createWorkflow(sql, "published", "workflow-published");
    await grantPermission(sql, { requireApproval: true });
    const run = await createWorkflowRun(sql, "workflow-published");
    await pg.query("insert into workflow_node_runs (id,run_id,node_id,node_type,status,input,output,started_at,finished_at) values ('approval-run',$1,'approval-node','approval','waiting','{}','{}',current_timestamp,current_timestamp)", [run.id]);
    await pg.query("insert into workflow_approvals (id,run_id,node_run_id,workspace_id,status,requested_by,reason,expires_at,decided_at) values ('approval',$1,'approval-run','ws','approved','workflow','Approved for test',current_timestamp + interval '10 minutes',current_timestamp)", [run.id]);
    const output = await executeWorkflowTool(sql, node({ approvalNodeId: "approval-node" }), {}, run, memorySecretProvider(new Map([["nexo/ws/conn/api_key", "fixture-api-key-1234567890"]])));
    assert.equal(output.status, "sent");
    assert.deepEqual(server.requests, ["/message/sendText/store"]);
    const execution = await pg.query<{ agent_version_id: string; status: string }>("select agent_version_id, status from tool_executions where run_id = $1", [run.id]);
    assert.deepEqual(execution.rows[0], { agent_version_id: "agent-published", status: "succeeded" });
  } finally {
    await pg.close();
    await closeServer(server.server);
  }
});

test("Tool Gateway rejects an agent from another workspace before adapter execution", async () => {
  const { pg, sql } = await fixture();
  try {
    await createWorkflow(sql, "published", "workflow-published");
    await grantPermission(sql);
    const run = await createWorkflowRun(sql, "workflow-published");
    await assert.rejects(() => executeWorkflowTool(sql, node({ agentId: "other-agent" }), {}, run), /WORKFLOW_AGENT_NOT_BOUND/);
  } finally {
    await pg.close();
  }
});
