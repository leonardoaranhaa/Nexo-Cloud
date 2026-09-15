import assert from "node:assert/strict";
import test from "node:test";
import type { Sql } from "../db.ts";
import { databaseSecretProvider, databaseSecretProvisioner } from "./secrets.ts";

type Stored = {
  workspace_id: string;
  connection_id: string;
  ciphertext: string;
  nonce: string;
  auth_tag: string;
};

function fakeSql(store: Map<string, Stored>): Sql {
  return {
    query: async <T>(text: string, params: unknown[] = []) => {
      const ref = String(params[0] ?? "");
      if (text.includes("select workspace_id, connection_id, ciphertext")) {
        const row = store.get(ref);
        return (row ? [row] : []) as T[];
      }
      if (text.includes("select workspace_id, connection_id from nexo_secret_values")) {
        const row = store.get(ref);
        return (row ? [{ workspace_id: row.workspace_id, connection_id: row.connection_id }] : []) as T[];
      }
      if (text.includes("insert into nexo_secret_values")) {
        store.set(ref, {
          workspace_id: String(params[1]),
          connection_id: String(params[2]),
          ciphertext: String(params[3]),
          nonce: String(params[4]),
          auth_tag: String(params[5]),
        });
        return [] as T[];
      }
      throw new Error(`Unexpected SQL in test: ${text}`);
    },
  } as unknown as Sql;
}

test("database vault encrypts and resolves a secret only in its connection scope", async () => {
  const previousKey = process.env.NEXO_SECRETS_ENCRYPTION_KEY;
  process.env.NEXO_SECRETS_ENCRYPTION_KEY = "test-only-vault-key";
  try {
    const store = new Map<string, Stored>();
    const sql = fakeSql(store);
    const scope = { workspaceId: "ws-1", connectionId: "conn-1", actorId: "user-1" };
    const ref = "nexo/ws-1/conn-1/api_key";
    await databaseSecretProvisioner(sql).put(ref, "railway-api-key", scope);
    const stored = store.get(ref);
    assert.ok(stored);
    assert.notEqual(stored.ciphertext, "railway-api-key");
    assert.equal(await databaseSecretProvider(sql).resolve(ref, scope), "railway-api-key");
    await assert.rejects(
      () => databaseSecretProvider(sql).resolve(ref, { workspaceId: "ws-2", connectionId: "conn-2" }),
      (error: unknown) => error instanceof Error && error.message.includes("outside the connection scope"),
    );
  } finally {
    if (previousKey === undefined) delete process.env.NEXO_SECRETS_ENCRYPTION_KEY;
    else process.env.NEXO_SECRETS_ENCRYPTION_KEY = previousKey;
  }
});

test("database vault rejects a secret reference from another workspace before touching storage", async () => {
  const previousKey = process.env.NEXO_SECRETS_ENCRYPTION_KEY;
  process.env.NEXO_SECRETS_ENCRYPTION_KEY = "test-only-vault-key";
  try {
    const store = new Map<string, Stored>();
    const provisioner = databaseSecretProvisioner(fakeSql(store));
    await assert.rejects(
      () => provisioner.put("nexo/ws-2/conn-1/api_key", "secret", { workspaceId: "ws-1", connectionId: "conn-1" }),
      (error: unknown) => error instanceof Error && error.message.includes("outside the connection scope"),
    );
    assert.equal(store.size, 0);
  } finally {
    if (previousKey === undefined) delete process.env.NEXO_SECRETS_ENCRYPTION_KEY;
    else process.env.NEXO_SECRETS_ENCRYPTION_KEY = previousKey;
  }
});

test("database vault requires a dedicated strong key in production", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousEncryptionKey = process.env.NEXO_SECRETS_ENCRYPTION_KEY;
  const previousAuthSecret = process.env.BETTER_AUTH_SECRET;
  process.env.NODE_ENV = "production";
  process.env.BETTER_AUTH_SECRET = "a-valid-auth-secret-that-must-not-encrypt-connector-secrets";
  try {
    const sql = fakeSql(new Map());
    delete process.env.NEXO_SECRETS_ENCRYPTION_KEY;
    await assert.rejects(
      () => databaseSecretProvisioner(sql).put("nexo/ws-1/conn-1/api_key", "secret", { workspaceId: "ws-1", connectionId: "conn-1" }),
      (error: unknown) => error instanceof Error && error.message.includes("dedicated NEXO_SECRETS_ENCRYPTION_KEY"),
    );
    process.env.NEXO_SECRETS_ENCRYPTION_KEY = "too-short";
    await assert.rejects(
      () => databaseSecretProvisioner(sql).put("nexo/ws-1/conn-1/api_key", "secret", { workspaceId: "ws-1", connectionId: "conn-1" }),
      (error: unknown) => error instanceof Error && error.message.includes("at least 32 characters"),
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousEncryptionKey === undefined) delete process.env.NEXO_SECRETS_ENCRYPTION_KEY;
    else process.env.NEXO_SECRETS_ENCRYPTION_KEY = previousEncryptionKey;
    if (previousAuthSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = previousAuthSecret;
  }
});
