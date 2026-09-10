import assert from "node:assert/strict";
import test from "node:test";
import { decideAgentTurn } from "./decision.ts";
import type { Agent } from "../types.ts";

const agent: Agent = {
  id: "agent",
  name: "Atendimento",
  persona: "Consultivo",
  welcomeMessage: "Olá",
  systemPrompt: "Não invente dados.",
  language: "pt",
  connectionId: "connection",
  status: "live",
  temperature: 0.4,
  maxTokens: 400,
  memoryWindow: 8,
  template: "runtime",
  knowledge: { faqs: [{ id: "hours", q: "Qual o horário?", a: "Atendemos das 9h às 18h." }], notes: "" },
  tools: { handoff: true, handoffKeywords: "humano, atendente", hoursEnabled: false, hoursStart: "08:00", hoursEnd: "18:00", catalog: false, audio: false },
  createdAt: 0,
  updatedAt: 0,
};

test("decision protocol cites a matching FAQ without requiring the model", () => {
  const decision = decideAgentTurn(agent, { text: "Qual é o horário de atendimento?", currentState: "new" });
  assert.equal(decision.answerMode, "faq");
  assert.equal(decision.nextAction, "respond");
  assert.equal(decision.evidence[0]?.sourceId, "faq:hours");
  assert.equal(decision.commercialState, "qualifying");
});

test("decision protocol asks instead of inventing commercial facts without evidence", () => {
  const decision = decideAgentTurn(agent, { text: "Qual o preço do plano?", currentState: "new" });
  assert.equal(decision.answerMode, "ask");
  assert.equal(decision.nextAction, "ask");
  assert.equal(decision.risk, "medium");
  assert.deepEqual(decision.requestedFields, ["need"]);
  assert.equal(decision.commercialState, "qualifying");
});

test("explicit human request becomes a handoff decision", () => {
  const decision = decideAgentTurn(agent, { text: "Quero falar com um atendente", currentState: "qualifying" });
  assert.equal(decision.intent, "human_request");
  assert.equal(decision.answerMode, "handoff");
  assert.equal(decision.nextAction, "handoff");
  assert.equal(decision.commercialState, "handoff_pending");
});
