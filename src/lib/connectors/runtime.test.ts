import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { HttpHealthcheckAdapter } from "./runtime.ts";
import { EvolutionApiAdapter } from "./evolution.ts";
import { EvolutionTextDispatcher } from "./evolution-messaging.ts";
import { createSecretResolver, localDevelopmentSecretProvider, memorySecretProvider, SecretResolverError } from "./secrets.ts";

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

test("Evolution adapter calls connectionState with the apikey header", async () => {
  const server = createServer((request, response) => {
    assert.equal(request.url, "/instance/connectionState/loja%2Fcentro");
    assert.equal(request.headers.apikey, "test-key");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ state: "open", token: "must-not-leak" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  try {
    const result = await new EvolutionApiAdapter().healthcheck(
      {
        id: "conn-1",
        provider: "evolution",
        secretRef: "secret-1",
        config: { baseUrl: `http://127.0.0.1:${address.port}`, instance: "loja/centro", timeoutMs: 1000 },
      },
      {
        workspaceId: "ws-1",
        connectionId: "conn-1",
        traceId: "trace-1",
        getSecret: async () => "test-key",
      },
    );
    assert.equal(result.status, "healthy");
    assert.equal(result.httpStatus, 200);
    assert.doesNotMatch(result.message, /test-key|must-not-leak/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Evolution dispatcher sends the documented text payload", async () => {
  const server = createServer(async (request, response) => {
    assert.equal(request.url, "/message/sendText/loja%2Fcentro");
    assert.equal(request.headers.apikey, "test-key");
    let body = "";
    for await (const chunk of request) body += chunk;
    assert.deepEqual(JSON.parse(body), { number: "5511999999999", textMessage: { text: "Olá" } });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ key: { id: "provider-id" }, message: { text: "Olá" } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  try {
    const result = await new EvolutionTextDispatcher().sendText(
      { baseUrl: `http://127.0.0.1:${address.port}`, instance: "loja/centro", recipient: "+55 (11) 99999-9999", text: "Olá", timeoutMs: 1000 },
      { workspaceId: "ws-1", connectionId: "conn-1", traceId: "trace-1", getSecret: async () => "test-key" },
    );
    assert.equal(result.status, "sent");
    assert.equal(result.code, "ok");
    assert.equal(result.providerMessageId, "provider-id");
    assert.doesNotMatch(result.message, /test-key|provider-id/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});


test("local development provider resolves Meta credentials from process.env", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousBackend = process.env.NEXO_SECRETS_BACKEND;
  const previousToken = process.env.META_ACCESS_TOKEN;
  process.env.NODE_ENV = "development";
  process.env.NEXO_SECRETS_BACKEND = "local";
  process.env.META_ACCESS_TOKEN = "local-fixture-token";
  try {
    const provider = localDevelopmentSecretProvider();
    assert.equal(
      await provider.resolve("nexo/ws-1/conn-1/api_key", { workspaceId: "ws-1", connectionId: "conn-1" }),
      "local-fixture-token",
    );
    await assert.rejects(
      () => provider.resolve("nexo/ws-other/conn-1/api_key", { workspaceId: "ws-1", connectionId: "conn-1" }),
      (error: unknown) => error instanceof SecretResolverError && error.code === "SECRET_SCOPE_INVALID",
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    if (previousBackend === undefined) delete process.env.NEXO_SECRETS_BACKEND; else process.env.NEXO_SECRETS_BACKEND = previousBackend;
    if (previousToken === undefined) delete process.env.META_ACCESS_TOKEN; else process.env.META_ACCESS_TOKEN = previousToken;
  }
});

test("local development provider cannot be created outside development", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.throws(() => localDevelopmentSecretProvider(), /development/);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
  }
});
