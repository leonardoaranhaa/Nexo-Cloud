import assert from "node:assert/strict";
import test from "node:test";
import type { Sql } from "../db.ts";
import { getEvolutionConnectionState, startEvolutionQr } from "./evolution-onboarding.ts";
import { validateEvolutionBaseUrl } from "./evolution.ts";
import type { SecretProvider } from "./secrets.ts";

function sqlStub() {
  const updates: string[] = [];
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray): Promise<T[]> => {
    const text = Array.from(strings).join(" ");
    if (text.includes("workspace_memberships")) return [{ organization_id: "org", workspace_role: "workspace_admin", organization_role: null } as T];
    return [];
  }) as Sql;
  sql.query = async <T = Record<string, unknown>>(query: string): Promise<T[]> => {
    updates.push(query);
    if (query.startsWith("select id, workspace_id")) return [{ id: "connection", workspace_id: "workspace", provider: "evolution", secret_ref: "nexo/workspace/connection/api_key", config: { baseUrl: "https://evolution.example", instance: "store" } } as T];
    return [];
  };
  return { sql, updates };
}

const secretProvider: SecretProvider = { resolve: async () => "server-only-api-key" };

test("normalizes a bare hosted Evolution URL to HTTPS", () => {
  assert.equal(
    validateEvolutionBaseUrl("evolution-api-production-7845d.up.railway.app"),
    "https://evolution-api-production-7845d.up.railway.app",
  );
});

test("starts Evolution instance and returns a real QR payload without exposing the API key", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Request[] = [];
  globalThis.fetch = async (input, init) => {
    requests.push(new Request(input, init));
    if (requests.length === 1) return new Response(JSON.stringify({ error: "already exists" }), { status: 409 });
    return new Response(JSON.stringify({ base64: "data:image/png;base64,QR", status: "connecting" }), { status: 200 });
  };
  try {
    const { sql } = sqlStub();
    const result = await startEvolutionQr(sql, "user", { workspaceId: "workspace", connectionId: "connection" }, secretProvider);
    assert.equal(result.status, "qr");
    assert.equal(result.qr, "data:image/png;base64,QR");
    assert.equal(requests[0]?.headers.get("apikey"), "server-only-api-key");
    assert.equal(JSON.stringify(result).includes("server-only-api-key"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("maps Evolution open state to connected and persists health", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ instance: { state: "open" } }), { status: 200 });
  try {
    const { sql, updates } = sqlStub();
    const result = await getEvolutionConnectionState(sql, "user", { workspaceId: "workspace", connectionId: "connection" }, secretProvider);
    assert.equal(result.status, "connected");
    assert.equal(updates.some((query) => query.includes("health_status = 'healthy'")), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
