import test from "node:test";
import assert from "node:assert/strict";
import { AGENT_TEMPLATES } from "./templates.ts";

test("templates de Atendimento e Vendas são prontos para revisão", () => {
  for (const id of ["support", "sales"] as const) {
    const template = AGENT_TEMPLATES.find((item) => item.id === id);
    assert.ok(template, `template ${id} deve existir`);
    assert.ok(template.draft.persona.length >= 20);
    assert.ok(template.draft.systemPrompt.length >= 80);
    assert.ok(template.draft.welcomeMessage.length >= 10);
    assert.ok(template.draft.knowledge);
    assert.ok(template.draft.tools.handoff, `${id} deve permitir handoff contextual`);
    assert.ok(template.draft.maxTokens > 0);
    assert.ok(template.draft.memoryWindow > 0);
  }
});

test("Vendas habilita catálogo e Atendimento mantém catálogo desabilitado por padrão", () => {
  const support = AGENT_TEMPLATES.find((item) => item.id === "support")!;
  const sales = AGENT_TEMPLATES.find((item) => item.id === "sales")!;
  assert.equal(support.draft.tools.catalog, false);
  assert.equal(sales.draft.tools.catalog, true);
});
