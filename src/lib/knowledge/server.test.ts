import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import type { Sql } from "../db";
import { createKnowledgeDocument, createKnowledgeSnapshot, publishKnowledgeSnapshot, retrieveKnowledge } from "./server.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../");

async function fixture() {
  const pg = new PGlite();
  await pg.waitReady;
  for (const file of ["0002_multi_tenant_core.sql", "0003_connector_registry.sql", "0004_messaging_dispatch.sql", "0005_webhook_security.sql", "0006_webhook_delivery_states.sql", "0007_agent_runtime_jobs.sql", "0008_conversation_handoff.sql", "0009_agent_runtime_execution_logs.sql", "0010_workflow_core.sql", "0011_workflow_triggers_events.sql", "0012_workflow_queue_leases.sql", "0013_tool_gateway.sql", "0014_workflow_scheduler.sql", "0015_internal_events.sql", "0016_workflow_wait_resume.sql", "0017_meta_webhook_security.sql", "0018_agent_marketplace.sql", "0019_agent_decision_protocol.sql", "0020_knowledge_rag.sql"]) await pg.exec(await readFile(join(root, "migrations", file), "utf8"));
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => { let text = strings[0] ?? ""; for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1] ?? ""}`; return (await pg.query<T>(text, values)).rows; }) as Sql;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows;
  await pg.query("insert into organizations (id,name,slug,created_by) values ('org','Org','org','user')");
  await pg.query("insert into workspaces (id,organization_id,name,slug,created_by) values ('ws','org','Ws','ws','user'), ('ws2','org','Ws2','ws2','other')");
  await pg.query("insert into organization_memberships (organization_id,user_id,role) values ('org','user','owner')");
  await pg.query("insert into workspace_memberships (workspace_id,user_id,role) values ('ws','user','workspace_admin')");
  return { pg, sql };
}

test("RAG persists documents, publishes a snapshot and retrieves evidence", async () => {
  const { pg, sql } = await fixture();
  try {
    const document = await createKnowledgeDocument(sql, "user", { workspaceId: "ws", title: "Política comercial", content: "## Horários\n\nAtendemos de segunda a sexta, das 9h às 18h.\n\n## Prazo\n\nO retorno comercial ocorre em até um dia útil.", sourceType: "markdown" });
    assert.equal(document.chunkCount, 1);
    const snapshot = await createKnowledgeSnapshot(sql, "user", { workspaceId: "ws", name: "Base comercial" });
    await publishKnowledgeSnapshot(sql, "user", { workspaceId: "ws", snapshotId: snapshot.id });
    const results = await retrieveKnowledge(sql, { workspaceId: "ws", query: "Qual o prazo de retorno?" });
    assert.equal(results.length, 1);
    assert.match(results[0]?.excerpt ?? "", /um dia útil/);
    assert.equal(results[0]?.sourceType, "rag_chunk");
  } finally { await pg.close(); }
});

test("RAG rejects cross-workspace document access", async () => {
  const { pg, sql } = await fixture();
  try {
    await assert.rejects(() => createKnowledgeDocument(sql, "user", { workspaceId: "ws2", title: "Privado", content: "Conteúdo privado" }), /Workspace access denied/);
    const results = await retrieveKnowledge(sql, { workspaceId: "ws2", query: "Conteúdo" });
    assert.deepEqual(results, []);
  } finally { await pg.close(); }
});
