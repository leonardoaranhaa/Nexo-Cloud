import { defineEventHandler } from "h3";
import { getSql } from "../../../../../src/lib/db";
import { pollScheduledWorkflows } from "../../../../../src/lib/workflows/scheduler";

function response(body: Record<string, unknown>, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }); }
export default defineEventHandler(async (event) => {
  const node = event.node;
  if (!node) return response({ ok: false, error: "SCHEDULER_UNAVAILABLE" }, 500);
  const expected = process.env.NEXO_WORKER_TOKEN;
  if (!expected || node.req.headers.authorization !== `Bearer ${expected}`) return response({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (node.req.method?.toUpperCase() !== "POST") return response({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const rawWorker = node.req.headers["x-worker-id"] ?? "workflow-scheduler";
    const workerId = Array.isArray(rawWorker) ? rawWorker[0] : rawWorker;
    const result = await pollScheduledWorkflows(await getSql(), workerId);
    return response({ ok: true, ...result });
  } catch { return response({ ok: false, error: "SCHEDULER_FAILED" }, 500); }
});
