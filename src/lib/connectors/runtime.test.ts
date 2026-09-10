import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { HttpHealthcheckAdapter } from "./runtime.ts";
import { createSecretResolver, memorySecretProvider, SecretResolverError } from "./secrets.ts";

test("secret resolver resolves inside scope without exposing the value in errors", async () => {
  const resolver = createSecretResolver(memorySecretProvider(new Map([["secret-1", "fixture-secret-value"]])));
  assert.equal(await resolver("secret-1", { workspaceId: "ws-1", connectionId: "conn-1" }), "fixture-secret-value");
  await assert.rejects(
    () => resolver("missing", { workspaceId: "ws-1", connectionId: "conn-1" }),
    (error: unknown) => error instanceof SecretResolverError && error.code === "SECRET_NOT_FOUND",
  );
});

test("http adapter performs authenticated healthcheck and returns sanitized result", async () => {
  const server = createServer((request, response) => {
    assert.equal(request.headers.authorization, "Bearer fixture-secret-value");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ internalToken: "must-not-leak" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");

  try {
    const result = await new HttpHealthcheckAdapter().healthcheck(
      {
        id: "conn-1",
        provider: "meta",
        secretRef: "secret-1",
        config: { healthcheckUrl: `http://127.0.0.1:${address.port}/health`, timeoutMs: 1000 },
      },
      {
        workspaceId: "ws-1",
        connectionId: "conn-1",
        traceId: "trace-1",
        getSecret: async () => "fixture-secret-value",
      },
    );
    assert.equal(result.status, "healthy");
    assert.equal(result.code, "ok");
    assert.equal(result.httpStatus, 200);
    assert.doesNotMatch(result.message, /fixture-secret-value|must-not-leak/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("http adapter rejects non-local insecure endpoints before network access", () => {
  assert.throws(
    () => new HttpHealthcheckAdapter().validateConfig({ healthcheckUrl: "http://provider.example/health" }),
    /HTTPS/,
  );
});
