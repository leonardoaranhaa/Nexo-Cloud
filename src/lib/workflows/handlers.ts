import type { Sql } from "../db.ts";
import { executeWorkflowAgentNode } from "../agent-runtime/runtime.ts";
import type { ClaimedWorkflowRun } from "./queue.ts";
import type { WorkflowNodeHandlers } from "./executor.ts";
import type { WorkflowNode } from "./server.ts";

type Json = Record<string, unknown>;
function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }

export function createWorkflowNodeHandlers(sql: Sql): WorkflowNodeHandlers {
  return {
    async agent(node: WorkflowNode, input: Json, run: ClaimedWorkflowRun): Promise<Json> {
      const agentId = stringValue(node.config?.agentId);
      if (!agentId) throw new Error("WORKFLOW_AGENT_CONFIG_REQUIRED");
      const prompt = stringValue(node.config?.prompt) || JSON.stringify(input).slice(0, 8000);
      const result = await executeWorkflowAgentNode(sql, { workspaceId: run.workspace_id, agentId, prompt });
      return { text: result.text, usedAi: result.usedAi };
    },
    async tool(): Promise<Json> {
      throw new Error("WORKFLOW_TOOL_GATEWAY_NOT_IMPLEMENTED");
    },
  };
}
