import assert from "node:assert/strict";
import test from "node:test";
import { createImprovementCandidate } from "./lab.ts";

test("improvement lab generates an auditable policy candidate from an eligible case", async () => {
  const calls: string[] = [];
  const sql = { query: async <T>(text: string) => {
    calls.push(text);
    if (text.startsWith("select c.id")) return [{ id: "case-1", workspace_id: "ws", agent_id: "agent-1", product_id: null, case_type: "conversion_success", title: "conversion", summary: "qualified and converted", attributes: { intent: "pricing_question", commercialState: "converted" }, chunk_id: "chunk-1", content: "sanitized engineering case" }] as T[];
    if (text.startsWith("select id, system_prompt")) return [{ id: "agent-1", system_prompt: "protected", persona: "sales", welcome_message: "hello", knowledge: {}, tools: {}, metadata: {} }] as T[];
    if (text.startsWith("insert into nexo_agent_improvement_candidates")) return [{ id: "candidate-1", created_at: "2026-01-01" }] as T[];
    return [] as T[];
  } } as never;
  const result = await createImprovementCandidate(sql, { workspaceId: "ws", caseId: "case-1", requestedBy: "operator" });
  assert.equal(result.created, true);
  assert.equal(result.candidate?.candidateType, "policy");
  assert.equal(result.candidate?.status, "review");
  assert.equal(result.candidate?.proposedChange.safety, "Não publicar automaticamente; executar avaliação offline antes da promoção.");
  assert.ok(calls.some((call) => call.includes("nexo_agent_improvement_sources")));
});

test("improvement lab refuses cases outside the indexed or review states", async () => {
  const sql = { query: async <T>() => [] as T[] } as never;
  await assert.rejects(() => createImprovementCandidate(sql, { workspaceId: "ws", caseId: "rejected", requestedBy: "operator" }), /LEARNING_CASE_NOT_ELIGIBLE/);
});
