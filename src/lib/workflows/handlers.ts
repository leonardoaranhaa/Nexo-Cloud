import type { Sql } from "../db.ts";
import type { JsonObject } from "../multitenancy/server.ts";
import { executeWorkflowAgentNode } from "../agent-runtime/runtime.ts";
import type { ClaimedWorkflowRun } from "./queue.ts";
import type { WorkflowNodeHandlers } from "./executor.ts";
import type { WorkflowNode } from "./server.ts";
import { executeWorkflowTool } from "../connectors/tool-gateway.ts";

function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }

export function createWorkflowNodeHandlers(sql: Sql): WorkflowNodeHandlers {
  return {
    async agent(node: WorkflowNode, input: JsonObject, run: ClaimedWorkflowRun): Promise<JsonObject> {
      const agentId = stringValue(node.config?.agentId);
      if (!agentId) throw new Error("WORKFLOW_AGENT_CONFIG_REQUIRED");
      const prompt = stringValue(node.config?.prompt) || JSON.stringify(input).slice(0, 8000);
      const result = await executeWorkflowAgentNode(sql, { workspaceId: run.workspace_id, agentId, prompt });
      return { text: result.text, usedAi: result.usedAi };
    },
    async tool(node: WorkflowNode, input: JsonObject, run: ClaimedWorkflowRun): Promise<JsonObject> {
      return executeWorkflowTool(sql, node, input, run);
    },
  };
}
