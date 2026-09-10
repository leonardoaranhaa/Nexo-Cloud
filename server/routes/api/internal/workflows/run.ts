import { defineEventHandler } from "h3";
import { getSql } from "../../../../../src/lib/db";
import { runNextWorkflowRun } from "../../../../../src/lib/workflows/executor";
import { createWorkflowNodeHandlers } from "../../../../../src/lib/workflows/handlers";

function response(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

export default defineEventHandler(async (event) => {
  const node = event.node;
  if (!node) return response({ ok: false, error: "WORKFLOW_WORKER_UNAVAILABLE" }, 500);
  const expected = process.env.NEXO_WORKER_TOKEN;
  const authorization = node.req.headers.authorization;
  if (!expected || authorization !== `Bearer ${expected}`) return response({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (node.req.method?.toUpperCase() !== "POST") return response({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const workerId = node.req.headers["x-worker-id"] ?? "workflow-worker";
    const sql = await getSql();
    const result = await runNextWorkflowRun(sql, Array.isArray(workerId) ? workerId[0] : workerId, createWorkflowNodeHandlers(sql));
    return response({ ok: true, ...result });
  } catch {
    return response({ ok: false, error: "WORKFLOW_WORKER_FAILED" }, 500);
  }
});
