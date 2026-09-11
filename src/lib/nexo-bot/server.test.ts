import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNexoBotAction } from "./server.ts";

test("normalizes safe navigation proposals", () => {
  const action = normalizeNexoBotAction({ action: "navigate", target: "calendar" });
  assert.equal(action?.type, "navigate");
  assert.equal(action?.route, "/calendar");
  assert.equal(action?.requiresConfirmation, false);
});

test("normalizes agent creation with confirmation and bounded fields", () => {
  const action = normalizeNexoBotAction({
    action: "create_agent",
    name: "  Agente de Atendimento  ",
    agentType: "support",
    persona: "Atencioso",
    welcomeMessage: "Olá",
    systemPrompt: "Você atende clientes com evidências e encaminha casos sensíveis.",
  });
  assert.equal(action?.type, "create_agent");
  assert.equal(action?.requiresConfirmation, true);
  assert.equal(action?.name, "Agente de Atendimento");
  assert.equal(action?.agentType, "support");
});

test("rejects unsupported, incomplete and inverted action parameters", () => {
  assert.equal(normalizeNexoBotAction({ action: "delete_workspace", target: "settings" }), null);
  assert.equal(normalizeNexoBotAction({ action: "create_agent", name: "Agente" }), null);
  assert.equal(normalizeNexoBotAction({ action: "provision_calendar_slot", startAt: "2026-09-12T12:00:00Z", endAt: "2026-09-12T11:00:00Z" }), null);
});
