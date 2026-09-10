import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import type { Sql } from "../db";
import { listConversationMessages, listConversations, updateConversationHandoff } from "./server.ts";

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
  ]) await pg.exec(await readFile(join(root, "migrations", file), "utf8"));
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
    let text = strings[0] ?? "";
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1] ?? ""}`;
    return (await pg.query<T>(text, values)).rows;
  }) as Sql;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows;
  await pg.query("insert into organizations (id,name,slug,created_by) values ('org','Org','org','operator')");
  await pg.query("insert into workspaces (id,organization_id,name,slug,created_by) values ('ws','org','Ws','ws','operator'), ('other','org','Other','other','operator')");
  await pg.query("insert into workspace_memberships (workspace_id,user_id,role) values ('ws','operator','operator')");
  await pg.query("insert into connector_definitions (id,key,name,provider,version,capabilities) values ('def','evolution','Evolution','evolution','1','{}')");
  await pg.query("insert into connections (id,workspace_id,connector_definition_id,name,provider,status,secret_ref,config,created_by) values ('conn','ws','def','Canal','evolution','connected','ref','{}','operator')");
  await pg.query("insert into agents (id,workspace_id,name,slug,status,language,system_prompt,knowledge,tools,created_by,updated_by) values ('agent','ws','Atendimento','atendimento','active','pt','Prompt','{}','{}','operator','operator')");
  await pg.query("insert into conversations (id,workspace_id,agent_id,connection_id,external_contact_id) values ('conversation','ws','agent','conn','5511999999999')");
  await pg.query("insert into messages (id,workspace_id,conversation_id,direction,sender_type,external_message_id,content,status) values ('message','ws','conversation','inbound','contact','external','{\"text\":\"Olá\"}','received')");
  return { pg, sql };
}

test("lists inbox conversations and messages inside the workspace", async () => {
  const { pg, sql } = await fixture();
  try {
    const conversations = await listConversations(sql, "operator", { workspaceId: "ws", status: "open" });
    assert.equal(conversations.length, 1);
    assert.equal(conversations[0]?.lastMessageText, "Olá");
    assert.equal(conversations[0]?.unreadCount, 1);
    const messages = await listConversationMessages(sql, "operator", { workspaceId: "ws", conversationId: "conversation" });
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.content.text, "Olá");
  } finally {
    await pg.close();
  }
});

test("handoff transitions are persisted and cross-workspace access is denied", async () => {
  const { pg, sql } = await fixture();
  try {
    await updateConversationHandoff(sql, "operator", { workspaceId: "ws", conversationId: "conversation", action: "assign", reason: "Cliente pediu atendimento humano" });
    const rows = await pg.query<{ status: string; assigned_to: string; handoff_reason: string }>("select status, assigned_to, handoff_reason from conversations where id = 'conversation'");
    assert.deepEqual(rows.rows[0], { status: "pending", assigned_to: "operator", handoff_reason: "Cliente pediu atendimento humano" });
    await updateConversationHandoff(sql, "operator", { workspaceId: "ws", conversationId: "conversation", action: "resume" });
    const resumed = await pg.query<{ status: string; assigned_to: string | null }>("select status, assigned_to from conversations where id = 'conversation'");
    assert.deepEqual(resumed.rows[0], { status: "open", assigned_to: null });
    await assert.rejects(
      listConversationMessages(sql, "operator", { workspaceId: "other", conversationId: "conversation" }),
      /WORKSPACE|CONVERSATION/i,
    );
  } finally {
    await pg.close();
  }
});
