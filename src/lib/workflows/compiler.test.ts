import assert from "node:assert/strict";
import test from "node:test";
import { compileWorkflowDefinition, evaluateCondition } from "./compiler.ts";

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
