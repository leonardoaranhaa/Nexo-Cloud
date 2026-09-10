import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import type { Sql } from "../db";
import { executeLeadCreateOrUpdate, executeLeadUpdateQualification } from "./leads.ts";
import { createQualificationPolicy, evaluateQualification, publishQualificationPolicy } from "./qualification.ts";
import { executeLeadAssignOwner } from "./assignment.ts";
import { executeLeadCreateFollowUp, pollDueLeadFollowUps } from "./follow-ups.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../");

async function fixture() {
  const pg = new PGlite(); await pg.waitReady;
  for (const file of ["0002_multi_tenant_core.sql", "0003_connector_registry.sql", "0004_messaging_dispatch.sql", "0005_webhook_security.sql", "0006_webhook_delivery_states.sql", "0007_agent_runtime_jobs.sql", "0008_conversation_handoff.sql", "0009_agent_runtime_execution_logs.sql", "0010_workflow_core.sql", "0011_workflow_triggers_events.sql", "0012_workflow_queue_leases.sql", "0013_tool_gateway.sql", "0014_workflow_scheduler.sql", "0015_internal_events.sql", "0016_workflow_wait_resume.sql", "0017_meta_webhook_security.sql", "0018_agent_marketplace.sql", "0019_agent_decision_protocol.sql", "0020_knowledge_rag.sql", "0021_crm_lead_tool.sql", "0022_lead_qualification_tool.sql", "0023_product_qualification_policy.sql", "0024_lead_assignment_tool.sql", "0025_lead_follow_up_tool.sql"]) await pg.exec(await readFile(join(root, "migrations", file), "utf8"));
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => { let text = strings[0] ?? ""; for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1] ?? ""}`; return (await pg.query<T>(text, values)).rows; }) as Sql;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows;
  await pg.query("insert into organizations (id,name,slug,created_by) values ('org','Org','org','user')");
  await pg.query("insert into workspaces (id,organization_id,name,slug,created_by) values ('ws','org','Ws','ws','user'), ('ws2','org','Ws2','ws2','other')");
  await pg.query("insert into organization_memberships (organization_id,user_id,role) values ('org','user','owner')");
  await pg.query("insert into workspace_memberships (workspace_id,user_id,role) values ('ws','user','workspace_admin')");
  await pg.query("insert into workspace_memberships (workspace_id,user_id,role) values ('ws','operator-a','operator'), ('ws','operator-b','operator')");
  await pg.query("insert into agents (id,workspace_id,name,slug,status,language,system_prompt,knowledge,tools,created_by,updated_by) values ('agent','ws','Agent','agent','active','pt','prompt','{}','{}','user','user')");
  await pg.query("insert into connections (id,workspace_id,name,provider,status,secret_ref,config,created_by) values ('conn','ws','Conn','evolution','connected','ref','{}','user')");
  await pg.query("insert into agent_connections (agent_id,connection_id,is_primary) values ('agent','conn',true)");
  await pg.query("insert into conversations (id,workspace_id,agent_id,connection_id,external_contact_id) values ('conversation','ws','agent','conn','5511999999999')");
  return { pg, sql };
}

test("lead.create_or_update creates, updates and deduplicates a lead", async () => {
  const { pg, sql } = await fixture();
  try {
    const first = await executeLeadCreateOrUpdate(sql, "user", { workspaceId: "ws", externalContactId: "5511999999999", conversationId: "conversation", name: "Ana", stage: "qualifying", score: 72, intent: "pricing_question", source: "agent_runtime", idempotencyKey: "evt-1", traceId: "trace-1", requestedBy: "model" });
    assert.equal(first.created, true);
    const duplicate = await executeLeadCreateOrUpdate(sql, "user", { workspaceId: "ws", externalContactId: "5511999999999", conversationId: "conversation", stage: "qualified", score: 99, idempotencyKey: "evt-1", requestedBy: "model" });
    assert.equal(duplicate.idempotent, true);
    assert.equal(duplicate.stage, "qualifying");
    const update = await executeLeadCreateOrUpdate(sql, "user", { workspaceId: "ws", externalContactId: "5511999999999", conversationId: "conversation", stage: "qualified", score: 90, idempotencyKey: "evt-2", requestedBy: "system" });
    assert.equal(update.created, false);
    assert.equal(update.stage, "qualified");
    assert.equal(update.score, 90);
    const counts = await pg.query<{ leads: number; events: number; executions: number }>("select (select count(*) from crm_leads) as leads, (select count(*) from crm_lead_events) as events, (select count(*) from tool_executions where status = 'succeeded') as executions");
    assert.deepEqual(counts.rows[0], { leads: 1, events: 2, executions: 3 });
  } finally { await pg.close(); }
});

test("lead.create_or_update blocks another workspace", async () => {
  const { pg, sql } = await fixture();
  try { await assert.rejects(() => executeLeadCreateOrUpdate(sql, "user", { workspaceId: "ws2", externalContactId: "contact", idempotencyKey: "evt-cross", requestedBy: "user" }), /Workspace access denied/); } finally { await pg.close(); }
});

test("lead.update_qualification merges criteria and protects confirmed fields", async () => {
  const { pg, sql } = await fixture();
  try {
    const first = await executeLeadUpdateQualification(sql, "user", { workspaceId: "ws", externalContactId: "5511999999999", conversationId: "conversation", qualificationData: { need: "automação comercial", budget: "R$ 5.000" }, confirmedFields: ["need"], stage: "qualifying", score: 60, idempotencyKey: "qual-1", requestedBy: "user" });
    assert.equal(first.created, true);
    const second = await executeLeadUpdateQualification(sql, "user", { workspaceId: "ws", externalContactId: "5511999999999", conversationId: "conversation", qualificationData: { timeline: "30 dias" }, confirmedFields: ["timeline"], stage: "qualified", score: 80, idempotencyKey: "qual-2", requestedBy: "user" });
    assert.equal(second.created, false);
    assert.deepEqual((await pg.query<{ qualification_data: { need?: string; budget?: string; timeline?: string } }>("select qualification_data from crm_leads where workspace_id = 'ws'")).rows[0]?.qualification_data, { need: "automação comercial", budget: "R$ 5.000", timeline: "30 dias", _confirmedFields: ["need", "timeline"] });
    await assert.rejects(() => executeLeadUpdateQualification(sql, "user", { workspaceId: "ws", externalContactId: "5511999999999", qualificationData: { need: "outro" }, idempotencyKey: "qual-3", requestedBy: "user" }), /LEAD_CONFIRMED_FIELD_CONFLICT:need/);
  } finally { await pg.close(); }
});

test("product qualification policy keeps incomplete leads qualifying and promotes complete leads", async () => {
  const { pg, sql } = await fixture();
  try {
    const policy = await createQualificationPolicy(sql, "user", { workspaceId: "ws", productId: "nexo-product-atendimento-leads", name: "Qualificação comercial", minimumScore: 70, criteria: [
      { key: "need", type: "text_present", required: true, weight: 1 },
      { key: "budget", type: "text_present", required: true, weight: 1 },
      { key: "timeline", type: "text_present", required: true, weight: 1 },
    ] });
    await publishQualificationPolicy(sql, "user", { workspaceId: "ws", policyId: policy.id });
    await executeLeadUpdateQualification(sql, "user", { workspaceId: "ws", externalContactId: "5511999999999", qualificationData: { need: "automação" }, confirmedFields: ["need"], stage: "qualifying", idempotencyKey: "policy-1", requestedBy: "user" });
    const incomplete = await evaluateQualification(sql, "user", { workspaceId: "ws", externalContactId: "5511999999999", productId: "nexo-product-atendimento-leads", conversationId: "conversation", traceId: "policy-trace-1" });
    assert.equal(incomplete.ready, false);
    assert.deepEqual(incomplete.missingFields.sort(), ["budget", "timeline"]);
    await executeLeadUpdateQualification(sql, "user", { workspaceId: "ws", externalContactId: "5511999999999", qualificationData: { budget: "R$ 5.000", timeline: "30 dias" }, confirmedFields: ["budget", "timeline"], stage: "qualifying", idempotencyKey: "policy-2", requestedBy: "user" });
    const complete = await evaluateQualification(sql, "user", { workspaceId: "ws", externalContactId: "5511999999999", productId: "nexo-product-atendimento-leads", conversationId: "conversation", traceId: "policy-trace-2" });
    assert.equal(complete.ready, true);
    assert.equal(complete.score, 100);
    assert.equal(complete.stage, "qualified");
    const lead = await pg.query<{ stage: string }>("select stage from crm_leads where workspace_id = 'ws'");
    assert.equal(lead.rows[0]?.stage, "qualified");
  } finally { await pg.close(); }
});

test("lead.assign_owner distributes qualified leads and rejects ineligible owners", async () => {
  const { pg, sql } = await fixture();
  try {
    await executeLeadCreateOrUpdate(sql, "user", { workspaceId: "ws", externalContactId: "contact-a", stage: "qualified", score: 90, idempotencyKey: "owner-seed-a", requestedBy: "user" });
    await executeLeadCreateOrUpdate(sql, "user", { workspaceId: "ws", externalContactId: "contact-b", stage: "qualified", score: 90, idempotencyKey: "owner-seed-b", requestedBy: "user" });
    const first = await executeLeadAssignOwner(sql, "user", { workspaceId: "ws", externalContactId: "contact-a", idempotencyKey: "assign-a", requestedBy: "user" });
    const duplicate = await executeLeadAssignOwner(sql, "user", { workspaceId: "ws", externalContactId: "contact-a", idempotencyKey: "assign-a", requestedBy: "user" });
    const second = await executeLeadAssignOwner(sql, "user", { workspaceId: "ws", externalContactId: "contact-b", idempotencyKey: "assign-b", requestedBy: "user" });
    assert.equal(first.assigned, true);
    assert.equal(first.ownerId, "operator-a");
    assert.equal(duplicate.idempotent, true);
    assert.equal(second.ownerId, "operator-b");
    await assert.rejects(() => executeLeadAssignOwner(sql, "user", { workspaceId: "ws", externalContactId: "contact-b", ownerId: "viewer", idempotencyKey: "assign-c", requestedBy: "user" }), /ASSIGNMENT_OWNER_NOT_ELIGIBLE/);
    const conversations = await pg.query<{ assigned_to: string }>("select assigned_to from conversations where id = 'conversation'");
    assert.equal(conversations.rows[0]?.assigned_to, null);
  } finally { await pg.close(); }
});

test("lead.create_follow_up is idempotent and cancels when the lead converts", async () => {
  const { pg, sql } = await fixture();
  try {
    await executeLeadCreateOrUpdate(sql, "user", { workspaceId: "ws", externalContactId: "follow-contact", stage: "qualifying", idempotencyKey: "follow-lead", requestedBy: "system" });
    const input = { workspaceId: "ws", externalContactId: "follow-contact", agentId: "agent", connectionId: "conn", message: "Posso ajudar com os próximos detalhes?", scheduledAt: new Date(Date.now() + 86400000).toISOString(), idempotencyKey: "follow-1", requestedBy: "system" as const };
    const first = await executeLeadCreateFollowUp(sql, "user", input);
    const duplicate = await executeLeadCreateFollowUp(sql, "user", input);
    assert.equal(first.created, true);
    assert.equal(duplicate.idempotent, true);
    await pg.query("update crm_leads set stage = 'converted' where workspace_id = 'ws' and external_contact_id = 'follow-contact'");
    await pg.query("update crm_follow_ups set scheduled_at = current_timestamp where id = $1", [first.id]);
    const polled = await pollDueLeadFollowUps(sql, "follow-worker");
    assert.equal(polled.cancelled, 1);
    assert.equal((await pg.query<{ status: string; cancellation_reason: string }>("select status, cancellation_reason from crm_follow_ups where id = $1", [first.id])).rows[0]?.status, "cancelled");
  } finally { await pg.close(); }
});
