import assert from "node:assert/strict";
import test from "node:test";
import { evaluateLearningAttributes } from "./evaluation.ts";

test("eligible evaluation requires evidence-consistent response and good outcome", () => {
  const result = evaluateLearningAttributes({ intent: "pricing_question", confidence: 0.92, risk: "low", answerMode: "answer_with_evidence", nextAction: "respond", commercialState: "converted", evidenceCount: 2 });
  assert.equal(result.status, "eligible");
  assert.equal(result.criticalFailure, false);
  assert.ok(result.overallScore >= 0.8);
});

test("high risk without question or handoff is rejected", () => {
  const result = evaluateLearningAttributes({ intent: "pricing_question", confidence: 0.7, risk: "high", answerMode: "fallback", nextAction: "respond", commercialState: "qualifying", evidenceCount: 0 });
  assert.equal(result.status, "rejected");
  assert.equal(result.criticalFailure, true);
  assert.ok(result.reasons.some((reason) => reason.includes("risco alto")));
});

test("explicit human request without handoff is a critical failure", () => {
  const result = evaluateLearningAttributes({ intent: "human_request", confidence: 0.98, risk: "medium", answerMode: "ask", nextAction: "ask", commercialState: "handoff_pending" });
  assert.equal(result.status, "rejected");
  assert.equal(result.handoffScore, 0);
});
