import type { JsonObject } from "../multitenancy/server.ts";
import type { WorkflowDefinition } from "./server.ts";

export type CompiledWorkflowDefinition = WorkflowDefinition & { order: string[] };

export function compileWorkflowDefinition(definition: WorkflowDefinition): CompiledWorkflowDefinition {
  const nodes = definition.nodes;
  const ids = new Set<string>();
  for (const node of nodes) {
    if (!node.id || ids.has(node.id)) throw new Error("WORKFLOW_NODE_ID_DUPLICATE");
    ids.add(node.id);
    if (!["agent", "condition", "wait", "approval", "tool"].includes(node.type)) throw new Error("WORKFLOW_NODE_TYPE_INVALID");
    if (node.type === "agent" && !node.config?.agentId) throw new Error("WORKFLOW_AGENT_CONFIG_REQUIRED");
    if (node.type === "tool" && !node.config?.toolKey) throw new Error("WORKFLOW_TOOL_CONFIG_REQUIRED");
  }
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  for (const node of nodes) { outgoing.set(node.id, []); incoming.set(node.id, 0); }
  for (const edge of definition.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) throw new Error("WORKFLOW_EDGE_NODE_NOT_FOUND");
    if (edge.from === edge.to) throw new Error("WORKFLOW_SELF_EDGE");
    outgoing.get(edge.from)?.push(edge.to);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }
  const queue = nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const count = (incoming.get(next) ?? 0) - 1;
      incoming.set(next, count);
      if (count === 0) queue.push(next);
    }
  }
  if (order.length !== nodes.length) throw new Error("WORKFLOW_CYCLE_NOT_ALLOWED");
  return { ...definition, order };
}

export function evaluateCondition(config: JsonObject | undefined, input: JsonObject): boolean {
  const field = typeof config?.field === "string" ? config.field : "";
  const expected = config?.equals;
  if (!field) return false;
  const actual = field.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, input);
  return actual === expected;
}
