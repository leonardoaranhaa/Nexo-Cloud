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
    "0010_workflow_core.sql",
    "0011_workflow_triggers_events.sql",
    "0012_workflow_queue_leases.sql",
    "0013_tool_gateway.sql",
    "0014_workflow_scheduler.sql",
    "0015_internal_events.sql",
    "0016_workflow_wait_resume.sql",
    "0017_meta_webhook_security.sql",
    "0052_whatsapp_safety_limits.sql",
    "0018_agent_marketplace.sql",
    "0019_agent_decision_protocol.sql",
    "0020_knowledge_rag.sql",
    "0021_crm_lead_tool.sql",
    "0022_lead_qualification_tool.sql",
    "0023_product_qualification_policy.sql",
    "0024_lead_assignment_tool.sql",
    "0025_lead_follow_up_tool.sql",
    "0026_nexo_learning_foundation.sql",
    "0027_nexo_learning_evaluations.sql",
    "0028_nexo_learning_cases.sql",
    "0029_agent_improvement_lab.sql",
    "0030_tool_execution_domain.sql",
    "0031_agent_development_blueprints.sql",
    "0032_native_conversation_tools.sql",
    "0033_calendar_availability.sql",
    "0035_workspace_integrations.sql",
    "0036_calendar_booking.sql",
    "0038_agent_runtime_quotas.sql",
    "0039_native_commercial_tool_contracts.sql",
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
  await pg.query("insert into agents (id,workspace_id,name,slug,status,language,system_prompt,knowledge,tools,created_by,updated_by) values ('agent','ws','Agent','agent','active','pt','Seja objetivo.',$1::jsonb,'{}','user','user')", [JSON.stringify({ notes: "Atendemos das 9h às 18h." })]);
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
    }, memorySecretProvider(new Map([["nexo/ws/conn/api_key", "fixture-api-key-1234567890"]])));
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
    const decisions = await pg.query<{ intent: string; answer_mode: string; commercial_state: string }>("select intent, answer_mode, commercial_state from agent_runtime_decisions where workspace_id = 'ws'");
    assert.equal(decisions.rows[0]?.intent, "availability_question");
    assert.equal(decisions.rows[0]?.answer_mode, "answer_with_evidence");
    assert.equal(decisions.rows[0]?.commercial_state, "qualifying");
    const leads = await pg.query<{ stage: string; intent: string; score: number }>("select stage, intent, score from crm_leads where workspace_id = 'ws'");
    assert.equal(leads.rows.length, 1);
    assert.equal(leads.rows[0]?.stage, "qualifying");
    assert.equal(leads.rows[0]?.intent, "availability_question");
    assert.equal(Number(leads.rows[0]?.score), 82);
    const learning = await pg.query<{ event_type: string; workspace_id: string; attributes: { intent?: string; content?: string } }>("select event_type, workspace_id, attributes from nexo_learning_events where workspace_id = 'ws'");
    assert.equal(learning.rows.length, 1);
    assert.equal(learning.rows[0]?.event_type, "agent_turn_completed");
    assert.equal(learning.rows[0]?.attributes.intent, "availability_question");
    assert.equal(learning.rows[0]?.attributes.content, undefined);
    const evaluations = await pg.query<{ status: string; overall_score: number; critical_failure: boolean }>("select status, overall_score, critical_failure from nexo_learning_evaluations where workspace_id = 'ws'");
    assert.equal(evaluations.rows.length, 1);
    assert.equal(evaluations.rows[0]?.status, "eligible");
    assert.equal(evaluations.rows[0]?.critical_failure, false);
    const cases = await pg.query<{ status: string; case_type: string }>("select status, case_type from nexo_learning_cases where workspace_id = 'ws'");
    assert.equal(cases.rows.length, 1);
    assert.equal(cases.rows[0]?.status, "indexed");
    assert.equal(cases.rows[0]?.case_type, "success_case");
  } finally {
    await pg.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});


test("Agent Runtime executes only tools authorized by the published version", async () => {
  const server = createServer(async (_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ key: { id: "provider-tool-1" } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  const { pg, sql } = await fixture(`http://127.0.0.1:${address.port}`);
  try {
    await pg.query("insert into agent_versions (id,agent_id,version_number,status,config,created_by) values ('published-tool-version','agent',1,'published',$1::jsonb,'user')", [JSON.stringify({ name: "Agent", systemPrompt: "Seja objetivo." })]);
    await pg.query("insert into agent_tool_permissions (id,workspace_id,agent_version_id,tool_id,enabled,require_approval,allowed_scopes) values ('permission-runtime','ws','published-tool-version','tool_crm_lead_create_or_update',true,false,'{}')");
    await pg.query("insert into workspace_integrations (id,workspace_id,integration_key,name,status,config) values ('crm-runtime','ws','crm.qualificacao','CRM + Qualificação','connected',$1::jsonb)", [JSON.stringify({ pipelineName: "Vendas", defaultStage: "qualifying", captureFields: ["email", "need"] })]);
    const queued = await enqueueAgentRuntimeJob(sql, { workspaceId: "ws", agentId: "agent", conversationId: "conversation", inboundMessageId: "inbound", traceId: "trace-tool-runtime" });
    const result = await runNextAgentRuntimeJob(sql, "worker-tool-test", {
      async generate() {
        return { text: "Registrei seu interesse.", usedAi: true, toolCalls: [{ id: "call-1", name: "lead.create_or_update", arguments: { stage: "new", score: 84, name: "Não deve ser capturado", email: "lead@example.com", intent: "availability_question", qualificationData: { need: "automação", company: "Não permitido" } } }] };
      },
    }, memorySecretProvider(new Map([["nexo/ws/conn/api_key", "fixture-api-key-1234567890"]])));
    assert.equal(result.status, "succeeded");
    const executions = await pg.query<{ status: string; idempotency_key: string }>("select status, idempotency_key from tool_executions where workspace_id = 'ws' order by created_at");
    assert.equal(executions.rows.some((row) => row.status === "succeeded" && row.idempotency_key === `runtime:${queued.id}:tool:call-1`), true);
    const leads = await pg.query<{ score: number; stage: string; name: string | null; email: string | null; qualification_data: { need?: string; company?: string } }>("select score, stage, name, email, qualification_data from crm_leads where workspace_id = 'ws' order by updated_at desc");
    assert.equal(leads.rows.some((row) => Number(row.score) === 84), true);
    assert.equal(leads.rows[0]?.stage, "qualifying");
    assert.equal(leads.rows[0]?.name, null);
    assert.equal(leads.rows[0]?.email, "lead@example.com");
    assert.equal(leads.rows[0]?.qualification_data.need, "automação");
    assert.equal(leads.rows[0]?.qualification_data.company, undefined);
  } finally {
    await pg.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Agent Runtime follows a second model pass after executing a tool call", async () => {
  const server = createServer(async (_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ key: { id: "provider-tool-2" } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  const { pg, sql } = await fixture(`http://127.0.0.1:${address.port}`);
  try {
    await pg.query("insert into agent_versions (id,agent_id,version_number,status,config,created_by) values ('published-tool-version-2','agent',1,'published',$1::jsonb,'user')", [JSON.stringify({ name: "Agent", systemPrompt: "Seja objetivo." })]);
    await pg.query("insert into agent_tool_permissions (id,workspace_id,agent_version_id,tool_id,enabled,require_approval,allowed_scopes) values ('permission-runtime-2','ws','published-tool-version-2','tool_crm_lead_create_or_update',true,false,'{}')");
    const queued = await enqueueAgentRuntimeJob(sql, { workspaceId: "ws", agentId: "agent", conversationId: "conversation", inboundMessageId: "inbound", traceId: "trace-tool-roundtrip" });
    let turns = 0;
    const result = await runNextAgentRuntimeJob(sql, "worker-tool-roundtrip", {
      async generate(input) {
        turns += 1;
        if (turns === 1) {
          return {
            text: "Vou registrar seu interesse.",
            usedAi: true,
            toolCalls: [{ id: "call-2", name: "lead.create_or_update", arguments: { stage: "qualifying", score: 88, intent: "availability_question" } }],
          };
        }
        assert.ok(input.history.some((entry) => entry.content.includes("Qual o horário?") || entry.content.includes("availability_question")));
        assert.equal(input.tools, undefined);
        assert.equal(input.toolRound?.calls[0]?.id, "call-2");
        assert.equal(input.toolRound?.results[0]?.status, "succeeded");
        assert.equal(input.toolRound?.results[0]?.output.stage, "qualifying");
        return { text: "Confirmado: a sua solicitação foi registrada e já foi encaminhada para continuidade.", usedAi: true };
      },
    }, memorySecretProvider(new Map([["nexo/ws/conn/api_key", "fixture-api-key-1234567890"]])));
    assert.equal(result.status, "succeeded");
    const outbound = await pg.query<{ direction: string; content: { text?: string } }>("select direction, content from messages where workspace_id = 'ws' and direction = 'outbound' order by created_at desc limit 1");
    assert.equal(outbound.rows[0]?.content.text, "Confirmado: a sua solicitação foi registrada e já foi encaminhada para continuidade.");
    assert.equal(turns, 2);
    const executions = await pg.query<{ status: string; idempotency_key: string }>("select status, idempotency_key from tool_executions where workspace_id = 'ws' order by created_at");
    assert.equal(executions.rows.some((row) => row.status === "succeeded" && row.idempotency_key === `runtime:${queued.id}:tool:call-2`), true);
  } finally {
    await pg.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Agent Runtime exposes authorized conversation handoff as a native tool", async () => {
  const server = createServer(async (_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ key: { id: "provider-handoff-1" } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  const { pg, sql } = await fixture(`http://127.0.0.1:${address.port}`);
  try {
    await pg.query("insert into agent_versions (id,agent_id,version_number,status,config,created_by) values ('published-handoff-version','agent',1,'published',$1::jsonb,'user')", [JSON.stringify({ name: "Agent", systemPrompt: "Seja objetivo." })]);
    await pg.query("insert into agent_tool_permissions (id,workspace_id,agent_version_id,tool_id,enabled,require_approval,allowed_scopes) values ('permission-handoff','ws','published-handoff-version','tool_conversation_handoff',true,false,'{}')");
    const queued = await enqueueAgentRuntimeJob(sql, { workspaceId: "ws", agentId: "agent", conversationId: "conversation", inboundMessageId: "inbound", traceId: "trace-handoff-tool" });
    let turns = 0;
    const result = await runNextAgentRuntimeJob(sql, "worker-handoff-test", {
      async generate() {
        turns += 1;
        if (turns === 1) return { text: "Vou encaminhar você para uma pessoa.", usedAi: true, toolCalls: [{ id: "handoff-1", name: "conversation.handoff", arguments: { action: "assign", reason: "Cliente solicitou atendimento humano" } }] };
        return { text: "Certo, um atendente continuará o atendimento.", usedAi: true };
      },
    }, memorySecretProvider(new Map([["nexo/ws/conn/api_key", "fixture-api-key-1234567890"]])));
    assert.equal(result.status, "succeeded");
    assert.equal(turns, 2);
    const conversation = await pg.query<{ status: string; handoff_reason: string }>("select status, handoff_reason from conversations where id = 'conversation'");
    assert.deepEqual(conversation.rows[0], { status: "pending", handoff_reason: "Cliente solicitou atendimento humano" });
    const executions = await pg.query<{ status: string; idempotency_key: string }>("select status, idempotency_key from tool_executions where workspace_id = 'ws' order by created_at");
    assert.equal(executions.rows.some((row) => row.status === "succeeded" && row.idempotency_key === `runtime:${queued.id}:tool:handoff-1`), true);
  } finally {
    await pg.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
