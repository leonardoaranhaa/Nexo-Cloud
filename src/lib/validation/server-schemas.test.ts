import assert from "node:assert/strict";
import test from "node:test";
import { evaluationHarnessInput, reviewToolProposalInput, updateAgentInput, workspaceBlueprintInput } from "./server-schemas.ts";

test("server schemas reject missing workspace and cross-boundary identifiers", () => {
  assert.throws(() => workspaceBlueprintInput.parse({ workspaceId: "", agentId: "agent", blueprintId: "blueprint" }));
  assert.throws(() => workspaceBlueprintInput.parse({ workspaceId: "ws", agentId: "agent", blueprintId: "blueprint", secret: "never" }));
});

test("server schemas reject invalid tool decisions", () => {
  assert.throws(() => reviewToolProposalInput.parse({ workspaceId: "ws", proposalId: "proposal", decision: "publish" }));
  assert.throws(() => reviewToolProposalInput.parse({ workspaceId: "ws", proposalId: "proposal", decision: "approved", reason: "x".repeat(501) }));
});

test("server schemas enforce bounded agent configuration", () => {
  assert.throws(() => updateAgentInput.parse({
    id: "agent", workspaceId: "ws", name: "Agent", persona: "", welcomeMessage: "", systemPrompt: "",
    language: "pt", status: "draft", temperature: 4, maxTokens: 400, memoryWindow: 8, knowledge: {}, tools: {},
  }));
});

test("evaluation harness schema requires explicit version identifiers", () => {
  assert.deepEqual(evaluationHarnessInput.parse({ workspaceId: "ws", agentId: "agent", blueprintId: "blueprint", baselineVersionId: "base", candidateVersionId: "candidate" }), {
    workspaceId: "ws", agentId: "agent", blueprintId: "blueprint", baselineVersionId: "base", candidateVersionId: "candidate",
  });
  assert.throws(() => evaluationHarnessInput.parse({ workspaceId: "ws", agentId: "agent", blueprintId: "blueprint", baselineVersionId: "base" }));
  assert.throws(() => evaluationHarnessInput.parse({ workspaceId: "ws", agentId: "agent", blueprintId: "blueprint", baselineVersionId: "base", candidateVersionId: "candidate", secret: "never" }));
});
