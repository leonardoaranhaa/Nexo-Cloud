import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import type { Sql } from "../db.ts";
import { runEvaluationHarness } from "./harness.ts";

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
    "0044_agent_tool_proposals.sql",
    "0047_agent_blueprint_evaluation_snapshots.sql",
    "0048_workspace_integrity_guards.sql",
    "0050_agent_evaluation_harness.sql",
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
  await pg.query("insert into agent_versions (id,agent_id,version_number,status,config,created_by) values ('baseline','agent',1,'draft',$1::jsonb,'user'), ('candidate','agent',2,'draft',$2::jsonb,'user')", [
    JSON.stringify({ name: "Atendimento base", persona: "Atendente acolhedor", welcomeMessage: "Olá!", systemPrompt: "Responda com clareza.", language: "pt", knowledge: { faqs: [{ id: "faq-1", q: "qual o prazo", a: "O prazo é de 3 dias." }], notes: "" }, tools: { handoff: true, handoffKeywords: "humano, atendente" }, maxTokens: 200, memoryWindow: 8, temperature: 0.2 }),
    JSON.stringify({ name: "Atendimento candidato", persona: "Atendente acolhedor", welcomeMessage: "Olá!", systemPrompt: "Nunca use esta credencial sk-live-secret-123.", secret: "sk-live-secret-456", language: "pt", knowledge: { faqs: [{ id: "faq-1", q: "qual o prazo", a: "O prazo é de 5 dias." }], notes: "" }, tools: { handoff: true, handoffKeywords: "humano, atendente" }, maxTokens: 200, memoryWindow: 8, temperature: 0.2 }),
  ]);
  await pg.query("insert into agent_development_blueprints (id,workspace_id,agent_id,agent_type,test_scenarios,created_by,updated_by) values ('blueprint','ws','agent','support',$1::jsonb,'user','user')", [JSON.stringify([
    { id: "faq", name: "FAQ publicada", input: { channel: "evaluation", message: "Qual o prazo?" }, expected: { contains: ["3 dias"], handoff: false } },
    { id: "human", name: "Pedido de humano", input: { channel: "evaluation", message: "Quero falar com um atendente" }, expected: { handoff: true } },
    { id: "expected-failure", name: "Expectativa deliberadamente não atendida", input: { channel: "evaluation", message: "Qual o prazo?" }, expected: { contains: ["texto que não existe"] } },
  ])]);
  return { pg, sql };
}

test("B4 compares two versions, records metrics and never creates production side effects", async () => {
  const { pg, sql } = await fixture();
  try {
    const run = await runEvaluationHarness(sql, "user", { workspaceId: "ws", agentId: "agent", blueprintId: "blueprint", baselineVersionId: "baseline", candidateVersionId: "candidate" });
    assert.equal(run.status, "succeeded");
    assert.equal(run.scenarioCount, 3);
    assert.equal(run.regressionCount, 1);
    assert.equal(run.baselineMetrics.successRate, 0.6667);
    assert.equal(run.candidateMetrics.successRate, 0.3333);
    assert.equal(run.baselineMetrics.handoffRate, 0.3333);
    assert.equal(run.candidateMetrics.handoffRate, 0.3333);
    assert.equal(run.comparisons.find((item) => item.scenarioId === "faq")?.regression, true);
    assert.match(run.comparisons.find((item) => item.scenarioId === "faq")?.differences.join(",") ?? "", /status|reply_changed/);
    assert.equal(Object.hasOwn(run.candidateSnapshot, "secret"), false);
    assert.match(JSON.stringify(run.candidateSnapshot), /\[secret\]/);
    const persisted = await pg.query<{ baseline_metrics: { successRate: number }; regression_count: number }>("select baseline_metrics, regression_count from agent_evaluation_harness_runs where id = $1 and workspace_id = 'ws'", [run.id]);
    assert.equal(persisted.rows[0]?.baseline_metrics.successRate, 0.6667);
    assert.equal(persisted.rows[0]?.regression_count, 1);
    const learningEvents = await pg.query<{ count: number }>("select count(*)::int as count from nexo_learning_events");
    const jobs = await pg.query<{ count: number }>("select count(*)::int as count from agent_runtime_jobs");
    const deliveries = await pg.query<{ count: number }>("select count(*)::int as count from message_deliveries");
    assert.equal(learningEvents.rows[0]?.count, 0);
    assert.equal(jobs.rows[0]?.count, 0);
    assert.equal(deliveries.rows[0]?.count, 0);
  } finally {
    await pg.close();
  }
});

test("B4 rejects cross-workspace execution and database writes", async () => {
  const { pg, sql } = await fixture();
  try {
    await assert.rejects(
      () => runEvaluationHarness(sql, "user", { workspaceId: "other", agentId: "agent", blueprintId: "blueprint", baselineVersionId: "baseline", candidateVersionId: "candidate" }),
      /WORKSPACE|permission/i,
    );
    await assert.rejects(
      () => pg.query("insert into agent_evaluation_harness_runs (id,workspace_id,agent_id,blueprint_id,baseline_version_id,candidate_version_id,created_by) values ('cross','other','agent','blueprint','baseline','candidate','user')"),
      /WORKSPACE_ISOLATION_HARNESS/i,
    );
    const runs = await pg.query<{ count: number }>("select count(*)::int as count from agent_evaluation_harness_runs");
    assert.equal(runs.rows[0]?.count, 0);
  } finally {
    await pg.close();
  }
});

test("B4 requires distinct versions", async () => {
  const { pg, sql } = await fixture();
  try {
    await assert.rejects(
      () => runEvaluationHarness(sql, "user", { workspaceId: "ws", agentId: "agent", blueprintId: "blueprint", baselineVersionId: "baseline", candidateVersionId: "baseline" }),
      /VERSIONS_MUST_DIFFER/i,
    );
  } finally {
    await pg.close();
  }
});
