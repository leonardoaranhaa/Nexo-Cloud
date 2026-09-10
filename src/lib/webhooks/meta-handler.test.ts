import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { verifyMetaSignature } from "./meta-handler.ts";

test("Meta webhook accepts only the exact HMAC-SHA256 raw body", () => {
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  const secret = "app-secret-fixture";
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(verifyMetaSignature(body, secret, signature), true);
  assert.equal(verifyMetaSignature(`${body} `, secret, signature), false);
  assert.equal(verifyMetaSignature(body, "wrong-secret", signature), false);
  assert.equal(verifyMetaSignature(body, secret, signature.replace("sha256=", "")), false);
});
