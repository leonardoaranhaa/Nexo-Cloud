import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import { memorySecretProvider } from "../connectors/secrets.ts";
import { handleMetaWebhook } from "./meta-handler.ts";
import type { Sql } from "../db";

const root = join(fileURLToPath(new URL("../../..", import.meta.url)));

test("Meta webhook updates outbound delivery and message status", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  for (const file of [
    "0002_multi_tenant_core.sql",
    "0003_connector_registry.sql",
    "0004_messaging_dispatch.sql",
    "0017_meta_webhook_security.sql",
  ]) await pg.exec(await readFile(join(root, "migrations", file), "utf8"));

  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
    let text = strings[0] ?? "";
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1] ?? ""}`;
    return (await pg.query<T>(text, values)).rows;
  }) as Sql;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows;

  await pg.query("insert into organizations (id,name,slug,created_by) values ('org','Org','org','user')");
  await pg.query("insert into workspaces (id,organization_id,name,slug,created_by) values ('ws','org','Ws','ws','user')");
  await pg.query("insert into connections (id,workspace_id,name,provider,status,secret_ref,config,created_by) values ('meta','ws','Meta','meta','connected','nexo/ws/meta/api_key',$1::jsonb,'user')", [JSON.stringify({ phoneNumberId: "phone", graphVersion: "v23.0" })]);
  await pg.query("update connections set meta_app_secret_ref = 'nexo/ws/meta/meta_app_secret', meta_verify_token_ref = 'nexo/ws/meta/meta_verify_token' where id = 'meta'");
  await pg.query("insert into agents (id,workspace_id,name,slug,created_by,updated_by) values ('agent','ws','Agent','agent','user','user')");
  await pg.query("insert into conversations (id,workspace_id,agent_id,connection_id,external_contact_id) values ('conversation','ws','agent','meta','5511999999999')");
  await pg.query("insert into messages (id,workspace_id,conversation_id,direction,sender_type,external_message_id,status) values ('message','ws','conversation','outbound','agent','wamid.inbound','sent')");
  await pg.query("insert into message_deliveries (id,workspace_id,message_id,connection_id,provider,provider_message_id,status,idempotency_key) values ('delivery','ws','message','meta','meta','wamid.outbound','sent','delivery-key')");

  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { statuses: [{ id: "wamid.outbound", status: "delivered" }] } }] }] });
  const signature = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;
  const result = await handleMetaWebhook(sql, new Request("https://nexo.test/api/webhooks/meta/meta", { method: "POST", headers: { "x-hub-signature-256": signature }, body }), {
    connectionId: "meta",
    secretProvider: memorySecretProvider(new Map([
      ["nexo/ws/meta/meta_app_secret", "app-secret"],
      ["nexo/ws/meta/meta_verify_token", "verify-token"],
    ])),
  });

  assert.equal(result.kind, "delivery");
  assert.equal(result.deliveryId, "delivery");
  const delivery = await pg.query<{ status: string }>("select status from message_deliveries where id = 'delivery'");
  const message = await pg.query<{ status: string }>("select status from messages where id = 'message'");
  assert.equal(delivery.rows[0]?.status, "delivered");
  assert.equal(message.rows[0]?.status, "delivered");
  const staleBody = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { statuses: [{ id: "wamid.outbound", status: "sent" }] } }] }] });
  await handleMetaWebhook(sql, new Request("https://nexo.test/api/webhooks/meta/meta", { method: "POST", headers: { "x-hub-signature-256": `sha256=${createHmac("sha256", "app-secret").update(staleBody).digest("hex")}` }, body: staleBody }), {
    connectionId: "meta",
    secretProvider: memorySecretProvider(new Map([["nexo/ws/meta/meta_app_secret", "app-secret"]])),
  });
  const afterStale = await pg.query<{ status: string }>("select status from message_deliveries where id = 'delivery'");
  assert.equal(afterStale.rows[0]?.status, "delivered");
  await pg.close();
});
