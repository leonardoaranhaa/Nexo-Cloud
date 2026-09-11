import assert from "node:assert/strict";
import { test } from "node:test";
import { getNexoBotAuditSummary, listNexoBotAuditEvents, recordNexoBotAudit } from "./audit.ts";

function authorizedSql(rows: unknown[], calls: unknown[][]) {
  return Object.assign(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push(values);
    return strings.join(" ").includes("from workspaces")
      ? [{ organization_id: "org-a", workspace_role: "workspace_admin", organization_role: null }]
      : [];
  }, {
    async query<T>(_query: string, params: unknown[]) {
      calls.push(params);
      return rows as T[];
    },
  }) as never;
}

test("audit record removes sensitive metadata and bounds the payload", async () => {
  const calls: unknown[][] = [];
  const sql = { async query<T>(_query: string, params: unknown[]) { calls.push(params); return [] as T[]; } } as never;
  await recordNexoBotAudit(sql, {
    workspaceId: "ws-a",
    actorId: "user-a",
    eventType: "action_succeeded",
    actionId: "action-a",
    actionType: "create_agent",
    status: "succeeded",
    summary: "Criar agente de teste",
    inputChars: 24,
    outputChars: 10,
    metadata: { historyCount: 2, token: "secret-value", email: "ana@example.com" },
  });
  const metadata = JSON.parse(String(calls[0]?.[14]));
  assert.deepEqual(metadata, { historyCount: 2 });
  assert.equal(calls[0]?.[1], "ws-a");
  assert.equal(calls[0]?.[2], "user-a");
});

test("audit listing is workspace-scoped, filtered and bounded", async () => {
  const calls: unknown[][] = [];
  const events = [{ id: "event-a", workspaceId: "ws-a", actorId: "user-a", eventType: "action_succeeded", actionId: "action-a", actionType: "create_agent", status: "succeeded", summary: "Criar agente", resourceType: "agent", resourceId: "agent-a", durationMs: 80, inputChars: 10, outputChars: 20, errorCode: null, metadata: {}, createdAt: "2026-09-11T10:00:00.000Z" }];
  const result = await listNexoBotAuditEvents(authorizedSql(events, calls), "user-a", { workspaceId: "ws-a", actionType: "create_agent", status: "succeeded", from: "2026-09-11T00:00:00.000Z", limit: 500 });
  const queryParams = calls.at(-1) ?? [];
  assert.deepEqual(result, events);
  assert.equal(queryParams[0], "ws-a");
  assert.equal(queryParams.at(-1), 200);
  assert.equal(queryParams.includes("create_agent"), true);
  assert.equal(queryParams.includes("succeeded"), true);
});

test("audit summary returns operational counters for the workspace", async () => {
  const calls: unknown[][] = [];
  const summary = [{ total: 8, chats: 3, proposed: 2, confirmed: 2, succeeded: 2, failed: 1, pending: 1, averageDurationMs: 412.5, lastEventAt: "2026-09-11T10:00:00.000Z" }];
  const result = await getNexoBotAuditSummary(authorizedSql(summary, calls), "user-a", { workspaceId: "ws-a", to: "2026-09-11T23:59:59.999Z" });
  assert.deepEqual(result, { total: 8, chats: 3, proposed: 2, confirmed: 2, succeeded: 2, failed: 1, pending: 1, averageDurationMs: 412.5, lastEventAt: "2026-09-11T10:00:00.000Z" });
  assert.equal((calls.at(-1) ?? [])[0], "ws-a");
});
