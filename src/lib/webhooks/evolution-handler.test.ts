import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { SignJWT } from "jose";
import test from "node:test";
import { handleEvolutionWebhook } from "./evolution-handler.ts";
import { memorySecretProvider } from "../connectors/secrets.ts";
import type { Sql } from "../db";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../");

async function fixture() {
  const pg = new PGlite();
  await pg.waitReady;
  for (const file of ["0002_multi_tenant_core.sql", "0003_connector_registry.sql", "0004_messaging_dispatch.sql", "0005_webhook_security.sql", "0006_webhook_delivery_states.sql", "0007_agent_runtime_jobs.sql"]) {
    await pg.exec(await readFile(join(root, "migrations", file), "utf8"));
  }
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
    let text = strings[0] ?? "";
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1] ?? ""}`;
    return (await pg.query<T>(text, values)).rows;
  }) as Sql;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows;
  await pg.query("insert into organizations (id,name,slug,created_by) values ('org','Org','org','user')");
  await pg.query("insert into workspaces (id,organization_id,name,slug,created_by) values ('ws','org','Ws','ws','user')");
  await pg.query("insert into workspace_memberships (workspace_id,user_id,role) values ('ws','user','workspace_admin')");
  await pg.query("insert into connections (id,workspace_id,name,provider,status,secret_ref,webhook_secret_ref,config,created_by) values ('conn','ws','Evolution','evolution','connected','nexo/ws/conn/api_key','nexo/ws/conn/webhook_jwt',$1::jsonb,'user')", [JSON.stringify({ instance: "loja" })]);
  await pg.query("insert into agents (id,workspace_id,name,slug,status,created_by,updated_by) values ('agent','ws','Agent','agent','active','user','user')");
  await pg.query("insert into agent_connections (agent_id,connection_id,is_primary) values ('agent','conn',true)");
  await pg.query("insert into conversations (id,workspace_id,agent_id,connection_id,external_contact_id) values ('conversation','ws','agent','conn','5511999999999')");
  await pg.query("insert into messages (id,workspace_id,conversation_id,direction,sender_type,content,status) values ('outbound','ws','conversation','outbound','agent','{}','sent')");
  await pg.query("insert into message_deliveries (id,workspace_id,message_id,connection_id,provider,provider_message_id,status,idempotency_key) values ('delivery','ws','outbound','conn','evolution','provider-1','sent','outbound-1')");
  return { pg, sql };
}

async function jwt() {
  return new SignJWT({ app: "evolution", action: "webhook" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode("webhook-secret"));
}

function request(body: unknown, token: string): Request {
  return new Request("https://nexo.test/api/webhooks/evolution/loja", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("Evolution inbound webhook authenticates, persists once and deduplicates", async () => {
  const { pg, sql } = await fixture();
  const token = await jwt();
  const body = {
    event: "MESSAGES_UPSERT",
    instance: "loja",
    data: {
      key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false, id: "external-1" },
      pushName: "Cliente",
      message: { conversation: "Preciso de ajuda" },
    },
  };
  try {
    const first = await handleEvolutionWebhook(sql, request(body, token), { secretProvider: memorySecretProvider(new Map([["nexo/ws/conn/webhook_jwt", "webhook-secret"]])) });
    const second = await handleEvolutionWebhook(sql, request(body, token), { secretProvider: memorySecretProvider(new Map([["nexo/ws/conn/webhook_jwt", "webhook-secret"]])) });
    const rows = await pg.query<{ count: number }>("select count(*)::int as count from messages where direction = 'inbound'");
    assert.equal(first.kind, "inbound");
    assert.equal(second.duplicate, true);
    assert.equal(Number(rows.rows[0]?.count), 1);
  } finally {
    await pg.close();
  }
});

test("Evolution messages.update advances delivery status without regression", async () => {
  const { pg, sql } = await fixture();
  const token = await jwt();
  const body = { event: "MESSAGES_UPDATE", instance: "loja", data: { key: { id: "provider-1" }, update: { status: "DELIVERY_ACK" } } };
  try {
    const result = await handleEvolutionWebhook(sql, request(body, token), { secretProvider: memorySecretProvider(new Map([["nexo/ws/conn/webhook_jwt", "webhook-secret"]])) });
    await handleEvolutionWebhook(sql, request({ ...body, data: { key: { id: "provider-1" }, update: { status: "SENT" } } }, token), { secretProvider: memorySecretProvider(new Map([["nexo/ws/conn/webhook_jwt", "webhook-secret"]])) });
    const rows = await pg.query<{ delivery_status: string; message_status: string }>("select d.status as delivery_status, m.status as message_status from message_deliveries d join messages m on m.id = d.message_id where d.id = 'delivery'");
    assert.equal(result.kind, "delivery");
    assert.equal(rows.rows[0]?.delivery_status, "delivered");
    assert.equal(rows.rows[0]?.message_status, "delivered");
  } finally {
    await pg.close();
  }
});
