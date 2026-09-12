import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import type { Sql } from "../db.ts";
import { resolveTool } from "../connectors/tool-registry.ts";
import { generateToolProposalsFromBlueprint, listAgentToolProposals } from "./tools.ts";

const root = join(fileURLToPath(new URL("../../..", import.meta.url)));

async function fixture() {
  const pg = new PGlite();
  await pg.waitReady;
  for (const file of [
    "0002_multi_tenant_core.sql",
    "0003_connector_registry.sql",
    "0004_messaging_dispatch.sql",
    "0007_agent_runtime_jobs.sql",
    "0009_agent_runtime_execution_logs.sql",
    "0010_workflow_core.sql",
    "0013_tool_gateway.sql",
    "0018_agent_marketplace.sql",
    "0019_agent_decision_protocol.sql",
    "0020_knowledge_rag.sql",
    "0021_crm_lead_tool.sql",
    "0022_lead_qualification_tool.sql",
    "0023_product_qualification_policy.sql",
    "0024_lead_assignment_tool.sql",
    "0025_lead_follow_up_tool.sql",
    "0030_tool_execution_domain.sql",
    "0031_agent_development_blueprints.sql",
    "0032_native_conversation_tools.sql",
    "0033_calendar_availability.sql",
    "0036_calendar_booking.sql",
    "0039_native_commercial_tool_contracts.sql",
    "0044_agent_tool_proposals.sql",
  ]) await pg.exec(await readFile(join(root, "migrations", file), "utf8"));
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
    let text = strings[0] ?? "";
    for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1] ?? ""}`;
    return (await pg.query<T>(text, values)).rows;
  }) as Sql;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows;
  await pg.query("insert into organizations (id,name,slug,created_by) values ('org','Org','org','user')");
  await pg.query("insert into workspaces (id,organization_id,name,slug,created_by) values ('ws','org','Workspace','ws','user'), ('other','org','Other','other','other-user')");
  await pg.query("insert into workspace_memberships (workspace_id,user_id,role) values ('ws','user','workspace_admin'), ('other','other-user','workspace_admin')");
  await pg.query("insert into agents (id,workspace_id,name,slug,status,language,persona,welcome_message,system_prompt,knowledge,tools,created_by,updated_by) values ('agent','ws','Vendas','vendas','draft','pt','Consultor','Olá!','Converta com responsabilidade.','{}','{}','user','user'), ('other-agent','other','Outro','outro','draft','pt','Atendente','Olá!','Ajude.','{}','{}','other-user','other-user')");
  await pg.query("insert into agent_development_blueprints (id,workspace_id,agent_id,agent_type,capabilities,created_by,updated_by) values ('blueprint','ws','agent','sales',$1::jsonb,'user','user')", [JSON.stringify(["CRM e lead", "qualificação do lead", "consultar disponibilidade", "reservar horário", "transferir para humano", "inventar integração bancária"]) ]);
  await pg.query("insert into agent_development_blueprints (id,workspace_id,agent_id,agent_type,capabilities,created_by,updated_by) values ('other-blueprint','other','other-agent','support',$1::jsonb,'other-user','other-user')", [JSON.stringify(["CRM"]) ]);
  return { pg, sql };
}

test("B2 generates governed drafts from confirmed native tools without granting execution", async () => {
  const { pg, sql } = await fixture();
  try {
    const first = await generateToolProposalsFromBlueprint(sql, "user", { workspaceId: "ws", agentId: "agent", blueprintId: "blueprint" });
    assert.equal(first.proposals.length, 5);
    assert.deepEqual(first.unsupportedCapabilities, ["inventar integração bancária"]);
    assert.ok(first.proposals.every((proposal) => proposal.status === "draft"));
    assert.ok(first.proposals.every((proposal) => proposal.toolId !== "tool_crm_lead_create_or_update"));
    assert.ok(first.proposals.every((proposal) => proposal.riskLevel === "read" ? !proposal.requiresApproval : proposal.requiresApproval));
    const reviewTools = await pg.query<{ key: string; status: string; workspace_id: string }>("select key, status, workspace_id from tools where workspace_id = 'ws' order by key");
    assert.deepEqual(reviewTools.rows.map((row) => row.status), ["review", "review", "review", "review", "review"]);
    assert.equal(reviewTools.rows.every((row) => row.workspace_id === "ws"), true);
    const resolved = await resolveTool(sql, "ws", "lead.create_or_update");
    assert.equal(resolved.status, "active");
    assert.equal(resolved.workspaceId, null);
    const permissions = await pg.query<{ count: number }>("select count(*)::int as count from agent_tool_permissions where workspace_id = 'ws'");
    assert.equal(permissions.rows[0]?.count, 0);

    const second = await generateToolProposalsFromBlueprint(sql, "user", { workspaceId: "ws", agentId: "agent", blueprintId: "blueprint" });
    assert.deepEqual(second.proposals.map((proposal) => proposal.id).sort(), first.proposals.map((proposal) => proposal.id).sort());
    const persisted = await listAgentToolProposals(sql, "user", { workspaceId: "ws", blueprintId: "blueprint" });
    assert.equal(persisted.length, 5);
  } finally {
    await pg.close();
  }
});

test("B2 rejects cross-workspace blueprint access before generating proposals", async () => {
  const { pg, sql } = await fixture();
  try {
    await assert.rejects(
      () => generateToolProposalsFromBlueprint(sql, "other-user", { workspaceId: "ws", agentId: "agent", blueprintId: "blueprint" }),
      /WORKSPACE|permission/i,
    );
    const proposals = await pg.query<{ count: number }>("select count(*)::int as count from agent_tool_proposals");
    assert.equal(proposals.rows[0]?.count, 0);
  } finally {
    await pg.close();
  }
});
