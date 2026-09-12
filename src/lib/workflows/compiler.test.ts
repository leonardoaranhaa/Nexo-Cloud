import assert from "node:assert/strict";
import test from "node:test";
import { compileWorkflowDefinition, evaluateCondition, validateWorkflowDefinition } from "./compiler.ts";

test("compiles a valid acyclic graph", () => {
  const result = compileWorkflowDefinition({ nodes: [{ id: "a", type: "condition", config: { field: "source", equals: "ads" } }, { id: "b", type: "wait" }], edges: [{ from: "a", to: "b" }] });
  assert.deepEqual(result.order, ["a", "b"]);
});

test("rejects cycles and missing edge nodes", () => {
  assert.throws(() => compileWorkflowDefinition({ nodes: [{ id: "a", type: "wait" }, { id: "b", type: "wait" }], edges: [{ from: "a", to: "b" }, { from: "b", to: "a" }] }), /WORKFLOW_CYCLE_NOT_ALLOWED/);
  assert.throws(() => compileWorkflowDefinition({ nodes: [{ id: "a", type: "wait" }], edges: [{ from: "a", to: "missing" }] }), /WORKFLOW_EDGE_NODE_NOT_FOUND/);
});

test("evaluates only the limited condition DSL", () => {
  assert.equal(evaluateCondition({ field: "lead.score", equals: 70 }, { lead: { score: 70 } }), true);
  assert.equal(evaluateCondition({ field: "lead.score", equals: 70 }, { lead: { score: 69 } }), false);
});

test("requires one connected entry point and explicit node configuration", () => {
  const issues = validateWorkflowDefinition({
    nodes: [
      { id: "agent", type: "agent", config: {} },
      { id: "tool", type: "tool", config: { toolKey: "lead.create_or_update" } },
    ],
    edges: [],
  });
  assert.deepEqual(issues.map((issue) => issue.code), [
    "WORKFLOW_AGENT_CONFIG_REQUIRED",
    "WORKFLOW_ROOT_COUNT_INVALID",
    "WORKFLOW_NODE_DISCONNECTED",
  ]);
});

test("rejects duplicate connections before publishing", () => {
  assert.throws(() => compileWorkflowDefinition({
    nodes: [
      { id: "a", type: "condition", config: { field: "source", equals: "manual" } },
      { id: "b", type: "wait" },
    ],
    edges: [{ from: "a", to: "b" }, { from: "a", to: "b" }],
  }), /WORKFLOW_EDGE_DUPLICATE/);
});
