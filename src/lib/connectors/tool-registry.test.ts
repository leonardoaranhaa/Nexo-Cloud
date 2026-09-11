import assert from "node:assert/strict";
import test from "node:test";
import { executionIdempotencyKey, validateToolInput, validateToolOutput } from "./tool-registry.ts";

test("tool input validation enforces required fields, types and unknown-field policy", () => {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["recipient", "text"],
    properties: {
      recipient: { type: "string", minLength: 3, maxLength: 40 },
      text: { type: "string", minLength: 1, maxLength: 500 },
    },
  };
  validateToolInput({ recipient: "+5511999999999", text: "Olá" }, schema);
  assert.throws(() => validateToolInput({ recipient: "+55" }, schema), /INVALID_ARGUMENTS:.*text:REQUIRED/);
  assert.throws(() => validateToolInput({ recipient: 123, text: "Olá" }, schema), /INVALID_ARGUMENTS:.*recipient:EXPECTED_STRING/);
  assert.throws(() => validateToolInput({ recipient: "+5511999999999", text: "Olá", secret: "x" }, schema), /INVALID_ARGUMENTS:.*secret:UNKNOWN_FIELD/);
});

test("tool input validation enforces arrays, enum and numeric limits", () => {
  const schema = { type: "object", properties: { stage: { type: "string", enum: ["new", "qualified"] }, score: { type: "number", minimum: 0, maximum: 1 }, tags: { type: "array", maxItems: 2, items: { type: "string", maxLength: 12 } } } };
  validateToolInput({ stage: "qualified", score: 0.8, tags: ["sales"] }, schema);
  assert.throws(() => validateToolInput({ stage: "lost" }, schema), /INVALID_ARGUMENTS:.*stage:ENUM/);
  assert.throws(() => validateToolInput({ score: 2 }, schema), /INVALID_ARGUMENTS:.*score:MAXIMUM/);
  assert.throws(() => validateToolInput({ tags: ["a", "b", "c"] }, schema), /INVALID_ARGUMENTS:.*tags:MAX_ITEMS/);
});

test("execution idempotency key is stable for the same operation and scoped by workspace", () => {
  const first = executionIdempotencyKey("ws-a", "execution-1", "lead.create_or_update");
  assert.equal(first, executionIdempotencyKey("ws-a", "execution-1", "lead.create_or_update"));
  assert.notEqual(first, executionIdempotencyKey("ws-b", "execution-1", "lead.create_or_update"));
  assert.notEqual(first, executionIdempotencyKey("ws-a", "execution-1", "calendar.book"));
});

test("tool output validation enforces the native commercial result contract", () => {
  const schema = {
    type: "object",
    required: ["leadId", "status"],
    properties: {
      leadId: { type: "string" },
      status: { type: "string", enum: ["succeeded", "failed"] },
    },
  };
  validateToolOutput({ leadId: "lead-1", status: "succeeded" }, schema);
  assert.throws(() => validateToolOutput({ status: "succeeded" }, schema), /INVALID_ARGUMENTS:.*leadId:REQUIRED/);
  assert.throws(() => validateToolOutput({ leadId: "lead-1", status: "pending" }, schema), /INVALID_ARGUMENTS:.*status:ENUM/);
});
