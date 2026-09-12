import type { JsonObject } from "../multitenancy/server.ts";
import type { WorkflowDefinition } from "./server.ts";

export type CompiledWorkflowDefinition = WorkflowDefinition & { order: string[] };

export type WorkflowValidationIssue = { code: string; message: string; nodeId?: string };

function pathValue(input: JsonObject, path: string): unknown {
  const normalized = path.startsWith("$.") ? path.slice(2) : path;
  return normalized.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, input);
}

export function mapWorkflowInput(config: JsonObject | undefined, input: JsonObject): JsonObject {
  const mapping = config?.mapping;
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) return input;
  const output: JsonObject = {};
  for (const [key, source] of Object.entries(mapping)) {
    if (typeof source === "string" && (source.startsWith("$.") || source.includes("."))) {
      const value = pathValue(input, source);
      if (value !== undefined) output[key] = value as never;
    } else output[key] = source as never;
  }
  return output;
}

export function applyWorkflowTransform(config: JsonObject | undefined, input: JsonObject): JsonObject {
  const mapped = mapWorkflowInput(config, input);
  const assign = config?.assign;
  if (!assign || typeof assign !== "object" || Array.isArray(assign)) return mapped;
  return { ...mapped, ...Object.fromEntries(Object.entries(assign).map(([key, value]) => [key, typeof value === "string" && value.startsWith("$." ) ? pathValue(input, value) : value])) } as JsonObject;
}

export function validateWorkflowDefinition(definition: WorkflowDefinition): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = [];
  if (definition.nodes.length === 0) return [{ code: "WORKFLOW_EMPTY", message: "Adicione pelo menos um nó ao workflow." }];
  const ids = new Set<string>();
  for (const node of definition.nodes) {
    if (!node.id || ids.has(node.id)) issues.push({ code: "WORKFLOW_NODE_ID_DUPLICATE", message: "Cada nó precisa ter um identificador único.", nodeId: node.id });
    ids.add(node.id);
    if (node.type === "agent" && !node.config?.agentId) issues.push({ code: "WORKFLOW_AGENT_CONFIG_REQUIRED", message: "Selecione um agente para este nó.", nodeId: node.id });
    if (node.type === "tool" && !node.config?.toolKey) issues.push({ code: "WORKFLOW_TOOL_CONFIG_REQUIRED", message: "Selecione uma ferramenta para este nó.", nodeId: node.id });
    if (node.type === "condition" && !node.config?.field) issues.push({ code: "WORKFLOW_CONDITION_CONFIG_REQUIRED", message: "Informe o campo usado pela condição.", nodeId: node.id });
    if (node.type === "transform" && !node.config?.mapping && !node.config?.assign) issues.push({ code: "WORKFLOW_TRANSFORM_CONFIG_REQUIRED", message: "Configure pelo menos um mapeamento ou atribuição.", nodeId: node.id });
  }
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  for (const node of definition.nodes) { outgoing.set(node.id, []); incoming.set(node.id, 0); }
  const edges = new Set<string>();
  for (const edge of definition.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) { issues.push({ code: "WORKFLOW_EDGE_NODE_NOT_FOUND", message: "Existe uma conexão apontando para um nó inexistente." }); continue; }
    const key = `${edge.from}:${edge.to}:${edge.condition ?? ""}`;
    if (edges.has(key)) issues.push({ code: "WORKFLOW_EDGE_DUPLICATE", message: "Existem conexões duplicadas no workflow." });
    edges.add(key);
    if (edge.from === edge.to) issues.push({ code: "WORKFLOW_SELF_EDGE", message: "Um nó não pode apontar para ele mesmo.", nodeId: edge.from });
    outgoing.get(edge.from)?.push(edge.to);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }
  const roots = definition.nodes.filter((node) => incoming.get(node.id) === 0);
  if (roots.length !== 1) issues.push({ code: "WORKFLOW_ROOT_COUNT_INVALID", message: roots.length === 0 ? "O workflow não possui um ponto de entrada." : "O workflow deve ter exatamente um ponto de entrada." });
  if (roots[0]) {
    const reachable = new Set<string>([roots[0].id]);
    const queue = [roots[0].id];
    while (queue.length) for (const next of outgoing.get(queue.shift()!) ?? []) if (!reachable.has(next)) { reachable.add(next); queue.push(next); }
    for (const node of definition.nodes) if (!reachable.has(node.id)) issues.push({ code: "WORKFLOW_NODE_DISCONNECTED", message: "Este nó não é alcançável a partir do ponto de entrada.", nodeId: node.id });
  }
  return issues;
}

export function compileWorkflowDefinition(definition: WorkflowDefinition): CompiledWorkflowDefinition {
  const nodes = definition.nodes;
  const ids = new Set<string>();
  for (const node of nodes) {
    if (!node.id || ids.has(node.id)) throw new Error("WORKFLOW_NODE_ID_DUPLICATE");
    ids.add(node.id);
    if (!["agent", "condition", "wait", "approval", "tool", "transform"].includes(node.type)) throw new Error("WORKFLOW_NODE_TYPE_INVALID");
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
  const validation = validateWorkflowDefinition(definition);
  if (validation.length > 0) throw new Error(validation[0].code);
  return { ...definition, order };
}

export function evaluateCondition(config: JsonObject | undefined, input: JsonObject): boolean {
  const field = typeof config?.field === "string" ? config.field : "";
  const expected = config?.equals;
  if (!field) return false;
  const actual = field.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, input);
  return actual === expected;
}
