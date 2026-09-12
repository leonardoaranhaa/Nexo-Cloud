import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import type { Sql } from "../db.ts";
import { runBlueprintScenarios } from "./scenarios.ts";

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
    "0026_nexo_learning_foundation.sql",
    "0027_nexo_learning_evaluations.sql",
    "0028_nexo_learning_cases.sql",
    "0029_agent_improvement_lab.sql",
    "0030_tool_execution_domain.sql",
    "0031_agent_development_blueprints.sql",
    "0043_agent_blueprint_evaluations.sql",
    "0047_agent_blueprint_evaluation_snapshots.sql",
  ]) {
    await pg.exec(await readFile(join(root, "migrations", file), "utf8"));
  }
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
    let text = strings[0] ?? "";
    for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1] ?? ""}`;
    return (await pg.query<T>(text, values)).rows;
  }) as Sql;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows;
  await pg.query("insert into organizations (id,name,slug,created_by) values ('org','Org','org','user')");
  await pg.query("insert into workspaces (id,organization_id,name,slug,created_by) values ('ws','org','Workspace','ws','user'), ('other','org','Other','other','user')");
  await pg.query("insert into workspace_memberships (workspace_id,user_id,role) values ('ws','user','workspace_admin')");
  await pg.query(`insert into agents (id,workspace_id,name,slug,status,language,persona,welcome_message,system_prompt,knowledge,tools,created_by,updated_by) values ('agent','ws','Atendimento','atendimento','draft','pt','Atendente acolhedor','Olá!','Responda com clareza e peça ajuda humana quando necessário.','{}','{"handoff":true,"handoffKeywords":"humano, atendente"}','user','user')`);
  await pg.query("insert into agent_versions (id,agent_id,version_number,status,config,created_by) values ('version','agent',1,'draft',$1::jsonb,'user')", [JSON.stringify({ name: "Atendimento", persona: "Atendente acolhedor", welcomeMessage: "Olá!", systemPrompt: "Responda com clareza.", language: "pt", knowledge: { faqs: [{ id: "faq-1", q: "qual o prazo", a: "O prazo é de 3 dias." }], notes: "" }, tools: { handoff: true, handoffKeywords: "humano, atendente" }, maxTokens: 200, memoryWindow: 8, temperature: 0.2 })]);
  await pg.query("insert into agent_development_blueprints (id,workspace_id,agent_id,agent_type,test_scenarios,created_by,updated_by) values ('blueprint','ws','agent','support',$1::jsonb,'user','user')", [JSON.stringify([
    { id: "faq", name: "FAQ publicada", input: { channel: "evaluation", message: "Qual o prazo?" }, expected: { contains: ["3 dias"], handoff: false } },
    { id: "human", name: "Pedido de humano", input: { channel: "evaluation", message: "Quero falar com um atendente" }, expected: { handoff: true } },
    { id: "expected-failure", name: "Expectativa deliberadamente não atendida", input: { channel: "evaluation", message: "Qual o prazo?" }, expected: { contains: ["texto que não existe"] } },
  ])]);
  return { pg, sql };
}

test("blueprint scenarios run through the deterministic decision pipeline without outbound side effects", async () => {
  const { pg, sql } = await fixture();
  try {
    const run = await runBlueprintScenarios(sql, "user", { workspaceId: "ws", agentId: "agent", blueprintId: "blueprint" });
    assert.equal(run.status, "succeeded");
    assert.equal(run.scenarioCount, 3);
    assert.equal(run.passedCount, 2);
    assert.equal(run.failedCount, 1);
    const snapshot = await pg.query<{ agent_version_id: string; agent_version_snapshot: { name?: string }; tools_snapshot: unknown[] }>("select agent_version_id, agent_version_snapshot, tools_snapshot from agent_blueprint_evaluation_runs where id = $1", [run.id]);
    assert.equal(snapshot.rows[0]?.agent_version_id, "version");
    assert.equal(snapshot.rows[0]?.agent_version_snapshot?.name, "Atendimento");
    assert.deepEqual(snapshot.rows[0]?.tools_snapshot, []);
    const results = await pg.query<{ scenario_id: string; status: string }>("select scenario_id, status from agent_blueprint_evaluation_results where run_id = $1 order by scenario_id", [run.id]);
    assert.deepEqual(results.rows, [
      { scenario_id: "expected-failure", status: "failed" },
      { scenario_id: "faq", status: "passed" },
      { scenario_id: "human", status: "passed" },
    ]);
    const learningEvents = await pg.query<{ count: number }>("select count(*)::int as count from nexo_learning_events where workspace_id = 'ws'");
    const learningEvaluations = await pg.query<{ count: number }>("select count(*)::int as count from nexo_learning_evaluations where workspace_id = 'ws'");
    assert.equal(learningEvents.rows[0]?.count, 3);
    assert.equal(learningEvaluations.rows[0]?.count, 3);
    const jobs = await pg.query<{ count: number }>("select count(*)::int as count from agent_runtime_jobs");
    const deliveries = await pg.query<{ count: number }>("select count(*)::int as count from message_deliveries");
    assert.equal(jobs.rows[0]?.count, 0);
    assert.equal(deliveries.rows[0]?.count, 0);
  } finally {
    await pg.close();
  }
});

test("blueprint scenarios cannot cross workspace boundaries", async () => {
  const { pg, sql } = await fixture();
  try {
    await assert.rejects(
      () => runBlueprintScenarios(sql, "user", { workspaceId: "other", agentId: "agent", blueprintId: "blueprint" }),
      /WORKSPACE|permission|BLUEPRINT/i,
    );
    const runs = await pg.query<{ count: number }>("select count(*)::int as count from agent_blueprint_evaluation_runs");
    assert.equal(runs.rows[0]?.count, 0);
  } finally {
    await pg.close();
  }
});
