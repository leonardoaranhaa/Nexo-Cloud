import assert from "node:assert/strict";
import test from "node:test";
import {
  formatHarnessPercent,
  parseHarnessRunDetail,
  parseHarnessRunSummary,
  summarizeHarnessSnapshot,
} from "./harness-view.ts";

test("B4 view adapters normalize a sanitized run and preserve comparison data", () => {
  const summary = parseHarnessRunSummary({
    id: "run-1",
    workspaceId: "ws",
    agentId: "agent",
    blueprintId: "blueprint",
    baselineVersionId: "v1",
    candidateVersionId: "v2",
    status: "succeeded",
    scenarioCount: 2,
    regressionCount: 1,
    baselineMetrics: { successRate: 1, avgTokens: 20 },
    candidateMetrics: { successRate: 0.5, avgTokens: "40" },
    durationMs: 120,
    createdAt: "2026-09-13T10:00:00Z",
  });

  assert.equal(summary?.status, "succeeded");
  assert.equal(summary?.candidateMetrics.avgTokens, 40);
  assert.equal(summary?.candidateMetrics.handoffRate, 0);
  assert.equal(parseHarnessRunSummary({}), null);

  const detail = parseHarnessRunDetail({
    ...summary,
    baselineSnapshot: { version: { systemPrompt: "Base" }, tools: [{ key: "lead.create_or_update" }] },
    candidateSnapshot: { version: { systemPrompt: "Candidate" }, tools: [] },
    comparisons: [{
      scenarioId: "scenario-1",
      scenarioName: "FAQ",
      baseline: { status: "passed", reply: "ok", toolsCalled: [], handoff: false, outputTokens: 2, failures: [] },
      candidate: { status: "failed", reply: "", toolsCalled: [], handoff: false, outputTokens: 0, failures: ["missing:preço"] },
      regression: true,
      differences: ["status:passed->failed"],
    }],
  });

  assert.equal(detail?.comparisons[0]?.regression, true);
  assert.equal(detail?.comparisons[0]?.candidate.failures[0], "missing:preço");
});

test("B4 view adapters never trust malformed snapshot data", () => {
  const contract = summarizeHarnessSnapshot({
    version: { modelProvider: "openai", modelName: "model", persona: "Persona", systemPrompt: "Prompt" },
    tools: [{ key: "safe.tool" }, { key: 42 }, "not-an-object"],
  });

  assert.deepEqual(contract, {
    model: "openai · model",
    persona: "Persona",
    prompt: "Prompt",
    toolKeys: ["safe.tool"],
  });
  assert.match(formatHarnessPercent(0.6667), /66/);
  assert.equal(summarizeHarnessSnapshot(null).toolKeys.length, 0);
});
