import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import type { Sql } from "../db";
import { getLeadMetrics } from "./metrics.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../");
async function fixture() {
  const pg = new PGlite(); await pg.waitReady;
  const files = ["0002_multi_tenant_core.sql","0003_connector_registry.sql","0004_messaging_dispatch.sql","0005_webhook_security.sql","0006_webhook_delivery_states.sql","0007_agent_runtime_jobs.sql","0008_conversation_handoff.sql","0009_agent_runtime_execution_logs.sql","0010_workflow_core.sql","0011_workflow_triggers_events.sql","0012_workflow_queue_leases.sql","0013_tool_gateway.sql","0014_workflow_scheduler.sql","0015_internal_events.sql","0016_workflow_wait_resume.sql","0017_meta_webhook_security.sql","0018_agent_marketplace.sql","0019_agent_decision_protocol.sql","0020_knowledge_rag.sql","0021_crm_lead_tool.sql","0022_lead_qualification_tool.sql","0023_product_qualification_policy.sql","0024_lead_assignment_tool.sql","0025_lead_follow_up_tool.sql"];
  for (const file of files) await pg.exec(await readFile(join(root, "migrations", file), "utf8"));
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => { let text = strings[0] ?? ""; for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1] ?? ""}`; return (await pg.query<T>(text, values)).rows; }) as Sql;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows;
  await pg.query("insert into organizations (id,name,slug,created_by) values ('org','Org','org','user')"); await pg.query("insert into workspaces (id,organization_id,name,slug,created_by) values ('ws','org','Ws','ws','user'),('ws2','org','Ws2','ws2','other')"); await pg.query("insert into organization_memberships (organization_id,user_id,role) values ('org','user','owner')"); await pg.query("insert into workspace_memberships (workspace_id,user_id,role) values ('ws','user','workspace_admin')"); await pg.query("insert into agents (id,workspace_id,name,slug,status,language,system_prompt,created_by,updated_by) values ('agent','ws','Sales','sales','active','pt','prompt','user','user')");
  return { pg, sql };
}

test("lead metrics aggregate the workspace data and reject another workspace", async () => { const { pg, sql } = await fixture(); try { await pg.query("insert into crm_leads (id,workspace_id,external_contact_id,stage,score) values ('l1','ws','c1','qualified',80),('l2','ws','c2','converted',95),('l3','ws2','c3','converted',100)"); const metrics = await getLeadMetrics(sql, "user", { workspaceId: "ws", from: new Date(Date.now() - 86400000).toISOString(), to: new Date(Date.now() + 86400000).toISOString() }); assert.equal(metrics.summary.total, 2); assert.equal(metrics.summary.qualified, 1); assert.equal(metrics.summary.converted, 1); assert.equal(metrics.summary.conversionRate, 50); await assert.rejects(() => getLeadMetrics(sql, "user", { workspaceId: "ws2" }), /Workspace access denied/); } finally { await pg.close(); } });
