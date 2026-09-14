import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import type { Sql } from "../db.ts";
import { memorySecretProvider } from "../connectors/secrets.ts";
import { dispatchTextMessageAsRuntime } from "../messaging/router.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../");

async function fixture() {
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
    "0052_whatsapp_safety_limits.sql",
  ]) await pg.exec(await readFile(join(root, "migrations", file), "utf8"));
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
    let text = strings[0] ?? "";
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1] ?? ""}`;
    return (await pg.query<T>(text, values)).rows;
  }) as Sql;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows;
  return { pg, sql };
}

test("isolates WhatsApp limits across concurrent agents and connections", async () => {
  const { pg, sql } = await fixture();
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return new Response(JSON.stringify({ key: { id: `provider-${providerCalls}` } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await pg.query("insert into organizations (id,name,slug,created_by) values ('org','Org','org','user')");
    for (let i = 1; i <= 4; i += 1) {
      await pg.query("insert into workspaces (id,organization_id,name,slug,created_by) values ($1,'org',$2,$3,'user')", [`ws-${i}`, `Workspace ${i}`, `workspace-${i}`]);
      await pg.query("insert into workspace_memberships (workspace_id,user_id,role) values ($1,'user','workspace_admin')", [`ws-${i}`]);
      await pg.query("insert into connections (id,workspace_id,name,provider,status,secret_ref,config,created_by) values ($1,$2,$3,'evolution','connected',$4,$5::jsonb,'user')", [
        `conn-${i}`, `ws-${i}`, `WhatsApp ${i}`, `nexo/ws-${i}/conn-${i}/api_key`, JSON.stringify({ baseUrl: "https://evolution.example", instance: `store-${i}`, whatsappMinDelayMs: 0, whatsappDailyMessageLimit: 5, whatsappBurstLimit: 5, whatsappBurstWindowMs: 300000 }),
      ]);
      await pg.query("insert into agents (id,workspace_id,name,slug,status,language,system_prompt,knowledge,tools,created_by,updated_by) values ($1,$2,$3,$4,'active','pt','Responda brevemente.','{}','{}','user','user')", [`agent-${i}`, `ws-${i}`, `Agent ${i}`, `agent-${i}`]);
      await pg.query("insert into agent_connections (agent_id,connection_id,is_primary) values ($1,$2,true)", [`agent-${i}`, `conn-${i}`]);
    }
    const secrets = memorySecretProvider(new Map(
      Array.from({ length: 4 }, (_, index) => [`nexo/ws-${index + 1}/conn-${index + 1}/api_key`, `fixture-api-key-${index + 1}-1234567890`]),
    ));
    const attempts = Array.from({ length: 4 }, (_, workspaceIndex) => Array.from({ length: 12 }, (_, attempt) => dispatchTextMessageAsRuntime(sql, {
      workspaceId: `ws-${workspaceIndex + 1}`,
      agentId: `agent-${workspaceIndex + 1}`,
      connectionId: `conn-${workspaceIndex + 1}`,
      recipient: `5511999999${String(workspaceIndex)}${String(attempt).padStart(2, "0")}`,
      text: `Mensagem ${attempt}`,
      idempotencyKey: `load:${workspaceIndex + 1}:${attempt}`,
      actor: "agent",
      traceId: `load-trace:${workspaceIndex + 1}:${attempt}`,
    }, secrets))).flat();
    const results = await Promise.all(attempts);
    const sent = results.filter((result) => result.status === "sent");
    const limited = results.filter((result) => result.code === "WHATSAPP_DAILY_LIMIT" || result.code === "WHATSAPP_BURST_LIMIT");
    assert.equal(results.length, 48);
    assert.equal(sent.length, 20);
    assert.equal(limited.length, 28);
    assert.equal(providerCalls, 20);
    const perConnection = await pg.query<{ connection_id: string; sent: number; blocked: number }>(`select connection_id, count(*) filter (where status = 'sent')::int as sent, count(*) filter (where status = 'unknown')::int as blocked from message_deliveries group by connection_id order by connection_id`);
    assert.deepEqual(perConnection.rows, [
      { connection_id: "conn-1", sent: 5, blocked: 7 },
      { connection_id: "conn-2", sent: 5, blocked: 7 },
      { connection_id: "conn-3", sent: 5, blocked: 7 },
      { connection_id: "conn-4", sent: 5, blocked: 7 },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    await pg.close();
  }
});
