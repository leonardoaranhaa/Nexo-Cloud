import test from "node:test";
import assert from "node:assert/strict";
import type { Sql } from "../db.ts";
import { getWorkspaceReadinessReport } from "./readiness-report.ts";

function sqlFixture(): Sql {
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray) => {
    const text = strings.join(" ");
    if (text.includes("from workspaces w")) return [{ organization_id: "org-1", workspace_role: "workspace_admin", organization_role: "owner" }] as T[];
    if (text.includes("from connections")) return [{ provider: "meta", secret_ref: "nexo/ws-1/meta/api_key", health_status: "healthy", config: { phoneNumberId: "phone-1", graphVersion: "v26.0" } }] as T[];
    if (text.includes("from agent_runtime_jobs")) return [{ executions_today: 3, failed_today: 0, queued: 1 }] as T[];
    if (text.includes("from agent_runtime_quota_policies")) return [{ workspace_daily_limit: 10, executions: 3, enabled: true }] as T[];
    if (text.includes("from agent_runtime_execution_logs")) return [{ executions_last_24h: 3, failures_last_24h: 0, last_execution_at: "2026-09-11T18:00:00.000Z" }] as T[];
    throw new Error(`Unexpected query: ${text}`);
  }) as Sql;
  sql.query = async <T = Record<string, unknown>>(text: string) => {
    if (text.includes("from connections")) return [{ provider: "meta", secret_ref: "nexo/ws-1/meta/api_key", health_status: "healthy", config: { phoneNumberId: "phone-1", graphVersion: "v26.0" } }] as T[];
    if (text.includes("from agent_runtime_jobs")) return [{ executions_today: 3, failed_today: 0, queued: 1 }] as T[];
    if (text.includes("from agent_runtime_quota_policies")) return [{ workspace_daily_limit: 10, executions: 3, enabled: true }] as T[];
    if (text.includes("from agent_runtime_execution_logs")) return [{ executions_last_24h: 3, failures_last_24h: 0, last_execution_at: "2026-09-11T18:00:00.000Z" }] as T[];
    throw new Error(`Unexpected query: ${text}`);
  };
  return sql;
}

test("readiness report aggregates healthy connection, runtime, quota and observability", async () => {
  const report = await getWorkspaceReadinessReport(sqlFixture(), "user-1", "ws-1");
  assert.equal(report.status, "ready");
  assert.deepEqual(report.connections, { total: 1, ready: 1, notChecked: 0, unhealthy: 0, needsConfiguration: 0 });
  assert.deepEqual(report.runtime, { executionsToday: 3, failedToday: 0, queued: 1, workspaceDailyLimit: 10, workspaceDailyUsed: 3 });
  assert.deepEqual(report.observability, { executionsLast24h: 3, failuresLast24h: 0, lastExecutionAt: "2026-09-11T18:00:00.000Z" });
});
