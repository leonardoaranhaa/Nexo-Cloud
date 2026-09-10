import { defineEventHandler, readBody } from "h3";
import { getSql } from "../../../../../src/lib/db";
import { publishWorkflowEvent } from "../../../../../src/lib/workflows/events";

function response(body: Record<string, unknown>, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }); }
export default defineEventHandler(async (event) => {
  const node = event.node;
  if (!node) return response({ ok: false, error: "EVENT_UNAVAILABLE" }, 500);
  const expected = process.env.NEXO_WORKER_TOKEN;
  if (!expected || node.req.headers.authorization !== `Bearer ${expected}`) return response({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (node.req.method?.toUpperCase() !== "POST") return response({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const body = (await readBody<Record<string, unknown>>(event)) ?? {};
    if (typeof body.workspaceId !== "string" || typeof body.eventType !== "string" || typeof body.idempotencyKey !== "string" || typeof body.source !== "string") return response({ ok: false, error: "EVENT_INPUT_INVALID" }, 400);
    const result = await publishWorkflowEvent(await getSql(), { workspaceId: body.workspaceId, eventType: body.eventType, source: body.source, idempotencyKey: body.idempotencyKey, payload: body.payload, entityType: typeof body.entityType === "string" ? body.entityType : undefined, toStatus: typeof body.toStatus === "string" ? body.toStatus : undefined });
    return response({ ok: true, ...result });
  } catch { return response({ ok: false, error: "EVENT_PUBLISH_FAILED" }, 500); }
});
