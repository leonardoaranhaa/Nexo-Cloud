import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeLearningAttributes } from "./server.ts";

test("learning sanitizer removes raw content and masks personal data", () => {
  const value = sanitizeLearningAttributes({ intent: "pricing_question", email: "ana@example.com", phone: "+55 11 99999-0000", prompt: "system secret", nested: { outcome: "qualified" } });
  assert.equal(value.email, undefined);
  assert.equal(value.phone, undefined);
  assert.equal(value.prompt, undefined);
  assert.deepEqual(value.nested, { outcome: "qualified" });
});

test("learning sanitizer limits nested and oversized attributes", () => {
  const nested = sanitizeLearningAttributes({ nested: { one: { two: { three: { four: "hidden" } } } } });
  assert.deepEqual(nested.nested, { one: { two: { three: "[depth_limit]" } } });
  const oversized = sanitizeLearningAttributes({ long: Array.from({ length: 20 }, () => "x".repeat(500)) });
  assert.equal(oversized.truncated, true);
});
