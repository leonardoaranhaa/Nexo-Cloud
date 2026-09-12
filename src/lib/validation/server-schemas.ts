import { z } from "zod";
import type { JsonObject } from "../multitenancy/server";

const workspaceId = z.string().trim().min(1).max(120);
const agentId = z.string().trim().min(1).max(120);
const blueprintId = z.string().trim().min(1).max(120);
const versionId = z.string().trim().min(1).max(120);
const jsonObject = z.record(z.string(), z.unknown()).transform((value) => value as JsonObject);

export const workspaceOnlyInput = z.object({ workspaceId }).strict();
export const workspaceAgentInput = z.object({ workspaceId, agentId }).strict();
export const workspaceBlueprintInput = z.object({ workspaceId, agentId, blueprintId }).strict();
export const workspaceBlueprintListInput = z.object({ workspaceId, blueprintId }).strict();
export const evaluationHarnessInput = z.object({ workspaceId, agentId, blueprintId, baselineVersionId: versionId, candidateVersionId: versionId }).strict();
export const evaluationHarnessListInput = z.object({ workspaceId, agentId: agentId.optional(), blueprintId: blueprintId.optional() }).strict();
export const evaluationHarnessRunInput = z.object({ workspaceId, runId: z.string().trim().min(1).max(120) }).strict();
export const reviewToolProposalInput = z.object({
  workspaceId,
  proposalId: z.string().trim().min(1).max(120),
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().max(500).optional(),
}).strict();

export const blueprintInput = z.object({
  workspaceId,
  agentId,
  agentType: z.string().trim().min(1).max(80),
  objectives: z.array(z.string().trim().min(1).max(240)).max(20),
  capabilities: z.array(z.string().trim().min(1).max(240)).max(20),
  guardrails: z.array(z.string().trim().min(1).max(240)).max(20),
  testScenarios: z.array(z.union([
    z.string().trim().min(1).max(2000),
    z.record(z.string(), z.unknown()),
  ])).max(20),
  sourceBrief: z.string().trim().max(4000).optional(),
}).strict();

export const updateAgentInput = z.object({
  id: agentId,
  workspaceId,
  name: z.string().trim().min(1).max(120),
  persona: z.string().max(2000),
  welcomeMessage: z.string().max(2000),
  systemPrompt: z.string().max(12000),
  language: z.enum(["pt", "en", "es"]),
  status: z.enum(["draft", "live", "paused"]),
  temperature: z.number().finite().min(0).max(1),
  maxTokens: z.number().int().min(80).max(16000),
  memoryWindow: z.number().int().min(0).max(100),
  knowledge: jsonObject,
  tools: jsonObject,
  metadata: jsonObject.optional(),
}).strict();

export const workflowInput = z.object({ workspaceId, workflowId: z.string().trim().min(1).max(120) }).strict();
export const workspaceRunInput = z.object({
  workspaceId,
  workflowId: z.string().trim().min(1).max(120),
  input: jsonObject.optional(),
  idempotencyKey: z.string().trim().min(1).max(160).optional(),
}).strict();
