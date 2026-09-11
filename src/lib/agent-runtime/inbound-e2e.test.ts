import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { SignJWT } from "jose";
import test from "node:test";
import { memorySecretProvider } from "../connectors/secrets.ts";
import { handleEvolutionWebhook } from "../webhooks/evolution-handler.ts";
import { runNextAgentRuntimeJob } from "./runtime.ts";
import type { Sql } from "../db";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../");

async function fixture(baseUrl: string) {
  const pg = new PGlite();
  await pg.waitReady;
  for (const file of [
    "0002_multi_tenant_core.sql", "0003_connector_registry.sql", "0004_messaging_dispatch.sql",
    "0005_webhook_security.sql", "0006_webhook_delivery_states.sql", "0007_agent_runtime_jobs.sql",
    "0008_conversation_handoff.sql", "0009_agent_runtime_execution_logs.sql", "0010_workflow_core.sql",
    "0011_workflow_triggers_events.sql", "0012_workflow_queue_leases.sql", "0013_tool_gateway.sql",
    "0014_workflow_scheduler.sql", "0015_internal_events.sql", "0016_workflow_wait_resume.sql",
    "0017_meta_webhook_security.sql", "0018_agent_marketplace.sql", "0019_agent_decision_protocol.sql",
    "0020_knowledge_rag.sql", "0021_crm_lead_tool.sql", "0022_lead_qualification_tool.sql",
    "0023_product_qualification_policy.sql", "0024_lead_assignment_tool.sql", "0025_lead_follow_up_tool.sql",
    "0026_nexo_learning_foundation.sql", "0027_nexo_learning_evaluations.sql", "0028_nexo_learning_cases.sql",
    "0029_agent_improvement_lab.sql", "0030_tool_execution_domain.sql", "0031_agent_development_blueprints.sql",
    "0038_agent_runtime_quotas.sql",
  ]) await pg.exec(await readFile(join(root, "migrations", file), "utf8"));
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
    let text = strings[0] ?? "";
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1] ?? ""}`;
    return (await pg.query<T>(text, values)).rows;
  }) as Sql;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows;
  await pg.query("insert into organizations (id,name,slug,created_by) values ('org','Org','org','user')");
  await pg.query("insert into workspaces (id,organization_id,name,slug,created_by) values ('ws','org','Ws','ws','user')");
  await pg.query("insert into workspace_memberships (workspace_id,user_id,role) values ('ws','user','workspace_admin')");
  await pg.query(
    "insert into connections (id,workspace_id,name,provider,status,secret_ref,webhook_secret_ref,config,created_by) values ('conn','ws','Evolution','evolution','connected','nexo/ws/conn/api_key','nexo/ws/conn/webhook_jwt',$1::jsonb,'user')",
    [JSON.stringify({ baseUrl, instance: "loja" })],
  );
  await pg.query(
    "insert into agents (id,workspace_id,name,slug,status,language,system_prompt,knowledge,tools,created_by,updated_by) values ('agent','ws','Agent','agent','active','pt','Seja objetivo.',$1::jsonb,$2::jsonb,'user','user')",
    [JSON.stringify({ notes: "Atendemos das 9h às 18h." }), JSON.stringify({ handoff: true })],
  );
  await pg.query("insert into agent_connections (agent_id,connection_id,is_primary) values ('agent','conn',true)");
  return { pg, sql };
}

async function webhookToken() {
  return new SignJWT({ app: "evolution", action: "webhook" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode("webhook-secret"));
}

test("Evolution inbound flows through queue, runtime, dispatch and operational history", async () => {
  let dispatched = 0;
  const server = createServer(async (request, response) => {
    assert.equal(request.url, "/message/sendText/loja");
    let body = "";
    for await (const chunk of request) body += chunk;
    assert.deepEqual(JSON.parse(body), { number: "5511999999999", textMessage: { text: "Resposta operacional" } });
    dispatched += 1;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ key: { id: "provider-e2e-1" } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  const { pg, sql } = await fixture(`http://127.0.0.1:${address.port}`);
  const secrets = memorySecretProvider(new Map([
    ["nexo/ws/conn/api_key", "fixture-api-key"],
    ["nexo/ws/conn/webhook_jwt", "webhook-secret"],
  ]));
  const body = {
    event: "MESSAGES_UPSERT",
    instance: "loja",
    data: {
      key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false, id: "external-e2e-1" },
      pushName: "Cliente",
      message: { conversation: "Preciso de ajuda" },
    },
  };
  const request = async () => new Request("https://nexo.test/api/webhooks/evolution/loja", {
    method: "POST",
    headers: { authorization: `Bearer ${await webhookToken()}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  try {
    const first = await handleEvolutionWebhook(sql, await request(), { secretProvider: secrets });
    const second = await handleEvolutionWebhook(sql, await request(), { secretProvider: secrets });
    assert.equal(first.kind, "inbound");
    assert.equal(second.duplicate, true);
    assert.equal(first.jobId, second.jobId);

    const result = await runNextAgentRuntimeJob(sql, "worker-e2e", {
      async generate() { return { text: "Resposta operacional", usedAi: true }; },
    }, secrets);
    assert.equal(result.status, "succeeded");
    assert.equal(dispatched, 1);

    const messages = await pg.query<{ direction: string; status: string; content: { text?: string } }>(
      "select direction, status, content from messages where workspace_id = 'ws' order by created_at",
    );
    assert.equal(messages.rows.filter((row) => row.direction === "inbound").length, 1);
    assert.equal(messages.rows.filter((row) => row.direction === "outbound").length, 1);
    assert.equal(messages.rows.find((row) => row.direction === "outbound")?.status, "sent");
    assert.equal(messages.rows.find((row) => row.direction === "outbound")?.content.text, "Resposta operacional");

    const job = await pg.query<{ status: string }>("select status from agent_runtime_jobs where workspace_id = 'ws'");
    const delivery = await pg.query<{ status: string; provider_message_id: string }>("select status, provider_message_id from message_deliveries where workspace_id = 'ws'");
    const execution = await pg.query<{ status: string }>("select status from agent_runtime_execution_logs where workspace_id = 'ws'");
    assert.equal(job.rows[0]?.status, "succeeded");
    assert.equal(delivery.rows[0]?.status, "sent");
    assert.equal(delivery.rows[0]?.provider_message_id, "provider-e2e-1");
    assert.equal(execution.rows[0]?.status, "succeeded");
  } finally {
    await pg.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
