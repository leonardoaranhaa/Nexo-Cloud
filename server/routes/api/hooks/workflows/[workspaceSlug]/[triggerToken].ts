import { defineEventHandler, getRouterParam, readRawBody } from "h3";
import { getSql } from "../../../../../../src/lib/db";
import { receiveWorkflowWebhook } from "../../../../../../src/lib/workflows/server";

function response(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

export default defineEventHandler(async (event) => {
  const node = event.node;
  if (!node) return response({ ok: false, error: "WORKFLOW_WEBHOOK_RUNTIME_UNAVAILABLE" }, 500);
  if (node.req.method?.toUpperCase() !== "POST") return response({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const raw = await readRawBody(event, "utf8");
    if (raw === undefined || raw.length > 512_000) return response({ ok: false, error: "WORKFLOW_WEBHOOK_PAYLOAD_INVALID" }, 400);
    let payload: unknown = {};
    try { payload = raw ? JSON.parse(raw) : {}; } catch { return response({ ok: false, error: "WORKFLOW_WEBHOOK_JSON_INVALID" }, 400); }
    const headers = node.req.headers;
    const outcome = await receiveWorkflowWebhook(await getSql(), {
      workspaceSlug: getRouterParam(event, "workspaceSlug") ?? "",
      triggerToken: getRouterParam(event, "triggerToken") ?? "",
      eventType: typeof headers["x-nexo-event"] === "string" ? headers["x-nexo-event"] : "webhook.received",
      source: typeof headers["x-nexo-source"] === "string" ? headers["x-nexo-source"] : "external",
      externalEventId: typeof headers["x-idempotency-key"] === "string" ? headers["x-idempotency-key"] : undefined,
      payload,
    });
    return response({ ok: true, ...outcome }, 202);
  } catch (error) {
    if (error instanceof Error && error.message === "WORKFLOW_TRIGGER_NOT_FOUND") return response({ ok: false, error: error.message }, 404);
    return response({ ok: false, error: "WORKFLOW_WEBHOOK_FAILED" }, 500);
  }
});
