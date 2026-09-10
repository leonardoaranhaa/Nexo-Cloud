import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import { memorySecretProvider } from "../connectors/secrets.ts";
import { enqueueAgentRuntimeJob } from "./queue.ts";
import { runNextAgentRuntimeJob } from "./runtime.ts";
import type { Sql } from "../db";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../");

async function fixture(baseUrl: string) {
  const pg = new PGlite();
  await pg.waitReady;
  for (const file of [
    "0002_multi_tenant_core.sql",
    "0003_connector_registry.sql",
    "0004_messaging_dispatch.sql",
    "0005_webhook_security.sql",
    "0006_webhook_delivery_states.sql",
    "0007_agent_runtime_jobs.sql",
    "0008_conversation_handoff.sql",
    "0009_agent_runtime_execution_logs.sql",
  ]) await pg.exec(await readFile(join(root, "migrations", file), "utf8"));
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
    let text = strings[0] ?? "";
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1] ?? ""}`;
    return (await pg.query<T>(text, values)).rows;
  }) as Sql;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows;
  await pg.query("insert into organizations (id,name,slug,created_by) values ('org','Org','org','user')");
  await pg.query("insert into workspaces (id,organization_id,name,slug,created_by) values ('ws','org','Ws','ws','user')");
  await pg.query("insert into connections (id,workspace_id,name,provider,status,secret_ref,config,created_by) values ('conn','ws','Evolution','evolution','connected','nexo/ws/conn/api_key',$1::jsonb,'user')", [JSON.stringify({ baseUrl, instance: "loja" })]);
  await pg.query("insert into agents (id,workspace_id,name,slug,status,language,system_prompt,knowledge,tools,created_by,updated_by) values ('agent','ws','Agent','agent','active','pt','Seja objetivo.','{}','{}','user','user')");
  await pg.query("insert into agent_connections (agent_id,connection_id,is_primary) values ('agent','conn',true)");
  await pg.query("insert into conversations (id,workspace_id,agent_id,connection_id,external_contact_id) values ('conversation','ws','agent','conn','5511999999999')");
  await pg.query("insert into messages (id,workspace_id,conversation_id,direction,sender_type,external_message_id,content,status) values ('inbound','ws','conversation','inbound','contact','external-1',$1::jsonb,'received')", [JSON.stringify({ type: "text", text: "Qual o horário?" })]);
  return { pg, sql };
}

test("Agent Runtime processes one inbound job and dispatches one outbound reply", async () => {
  const server = createServer(async (request, response) => {
    assert.equal(request.url, "/message/sendText/loja");
    let body = "";
    for await (const chunk of request) body += chunk;
    assert.deepEqual(JSON.parse(body), { number: "5511999999999", textMessage: { text: "Atendemos das 9h às 18h." } });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ key: { id: "provider-runtime-1" } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  const { pg, sql } = await fixture(`http://127.0.0.1:${address.port}`);
  try {
    const queued = await enqueueAgentRuntimeJob(sql, { workspaceId: "ws", agentId: "agent", conversationId: "conversation", inboundMessageId: "inbound", traceId: "trace-runtime" });
    assert.equal(queued.created, true);
    const result = await runNextAgentRuntimeJob(sql, "worker-test", {
      async generate() { return { text: "Atendemos das 9h às 18h.", usedAi: true }; },
    }, memorySecretProvider(new Map([["nexo/ws/conn/api_key", "fixture-api-key"]])));
    assert.equal(result.status, "succeeded");
    const jobs = await pg.query<{ status: string }>("select status from agent_runtime_jobs where id = $1", [queued.id]);
    const messages = await pg.query<{ direction: string; status: string; content: { text?: string } }>("select direction, status, content from messages where workspace_id = 'ws' order by created_at");
    const deliveries = await pg.query<{ provider_message_id: string }>("select provider_message_id from message_deliveries where workspace_id = 'ws'");
    const executions = await pg.query<{ status: string; reason: string; ai_provider: string; output_chars: number }>("select status, reason, ai_provider, output_chars from agent_runtime_execution_logs where workspace_id = 'ws'");
    assert.equal(jobs.rows[0]?.status, "succeeded");
    assert.equal(messages.rows.filter((row) => row.direction === "outbound").length, 1);
    assert.equal(messages.rows.find((row) => row.direction === "outbound")?.status, "sent");
    assert.equal(deliveries.rows[0]?.provider_message_id, "provider-runtime-1");
    assert.equal(executions.rows[0]?.status, "succeeded");
    assert.equal(executions.rows[0]?.reason, "ai");
    assert.equal(executions.rows[0]?.ai_provider, "xai");
    assert.ok((executions.rows[0]?.output_chars ?? 0) > 0);
  } finally {
    await pg.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
