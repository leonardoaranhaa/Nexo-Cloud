import { defineEventHandler, readBody } from "h3";
import { getSql } from "../../../../../src/lib/db";
import { expireWorkflowApprovals, requestWorkflowWaitResume } from "../../../../../src/lib/workflows/resume";

function response(body: Record<string, unknown>, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }); }
export default defineEventHandler(async (event) => {
  const node = event.node;
  if (!node) return response({ ok: false, error: "RESUME_UNAVAILABLE" }, 500);
  const expected = process.env.NEXO_WORKER_TOKEN;
  if (!expected || node.req.headers.authorization !== `Bearer ${expected}`) return response({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (node.req.method?.toUpperCase() !== "POST") return response({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const body = (await readBody<Record<string, unknown>>(event)) ?? {};
    const sql = await getSql();
    const expired = await expireWorkflowApprovals(sql);
    let resumed = false;
    if (typeof body.workspaceId === "string" && typeof body.runId === "string") resumed = await requestWorkflowWaitResume(sql, { workspaceId: body.workspaceId, runId: body.runId, reason: typeof body.reason === "string" ? body.reason : undefined });
    return response({ ok: true, expired, resumed });
  } catch { return response({ ok: false, error: "RESUME_FAILED" }, 500); }
});
