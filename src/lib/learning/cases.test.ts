import assert from "node:assert/strict";
import test from "node:test";
import { classifyLearningCase, retrieveNexoLearning } from "./cases.ts";

test("learning cases classify conversion, handoff and tool failures", () => {
  assert.equal(classifyLearningCase({ commercialState: "converted" }, "eligible"), "conversion_success");
  assert.equal(classifyLearningCase({ intent: "human_request", nextAction: "handoff" }, "eligible"), "handoff_case");
  assert.equal(classifyLearningCase({ toolFailures: 1 }, "eligible"), "tool_failure");
  assert.equal(classifyLearningCase({ regression: true }, "eligible"), "regression_case");
  assert.equal(classifyLearningCase({}, "review"), "failure_case");
});

test("learning retrieval ranks matching internal chunks and keeps workspace filter", async () => {
  const queries: { text: string; params: unknown[] }[] = [];
  const sql = { query: async <T>(text: string, params: unknown[] = []) => { queries.push({ text, params }); return [{ id: "chunk-1", case_id: "case-1", case_type: "success_case", title: "Conversão com evidência", content: "Evidence pricing conversion", lexical_text: "evidence pricing conversion" }] as T[]; } } as never;
  const result = await retrieveNexoLearning(sql, { workspaceId: "ws", query: "pricing evidence", limit: 3 });
  assert.equal(result[0]?.caseId, "case-1");
  assert.ok(result[0]?.score > 0.5);
  assert.deepEqual(queries[0]?.params, ["ws"]);
});
