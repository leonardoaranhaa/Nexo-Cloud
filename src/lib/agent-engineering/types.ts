import type { JsonObject } from "../multitenancy/server.ts";

export type BlueprintScenarioInput = {
  channel?: string;
  message: string;
  context?: JsonObject;
};

export type BlueprintScenarioExpected = {
  contains?: string[];
  notContains?: string[];
  toolsCalled?: string[];
  handoff?: boolean;
  maxTokens?: number;
};

export type BlueprintTestScenario = {
  id: string;
  name: string;
  description?: string;
  input: BlueprintScenarioInput;
  expected: BlueprintScenarioExpected;
};

export type ScenarioResultStatus = "passed" | "failed";

export type BlueprintScenarioResult = {
  scenarioId: string;
  name: string;
  status: ScenarioResultStatus;
  reply: string;
  reason: string;
  intent: string;
  nextAction: string;
  toolsCalled: string[];
  handoff: boolean;
  usedAi: boolean;
  evidenceCount: number;
  latencyMs: number;
  outputTokens: number;
  failures: string[];
};
