import { defineEventHandler, getRouterParam, readRawBody } from "h3";
import { getSql } from "../../../../../src/lib/db";
import { configuredSecretProvider } from "../../../../../src/lib/connectors/secrets";
import { handleEvolutionWebhook, WebhookRequestError } from "../../../../../src/lib/webhooks/evolution-handler";

function response(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export default defineEventHandler(async (event) => {
  if (event.req.method?.toUpperCase() !== "POST") return response({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const rawBody = await readRawBody(event, "utf8");
    if (rawBody === undefined) return response({ ok: false, error: "WEBHOOK_EMPTY_BODY" }, 400);
    const request = new Request("https://nexo.internal/webhook", { method: "POST", headers: event.req.headers, body: rawBody });
    const sql = await getSql();
    const secretProvider = configuredSecretProvider(sql);
    const outcome = await handleEvolutionWebhook(sql, request, {
      instance: getRouterParam(event, "instance"),
      secretProvider,
    });
    return response({ ok: true, accepted: outcome.accepted, kind: outcome.kind, duplicate: outcome.duplicate ?? false });
  } catch (error) {
    if (error instanceof WebhookRequestError) return response({ ok: false, error: error.message }, error.status);
    return response({ ok: false, error: "WEBHOOK_PROCESSING_FAILED" }, 500);
  }
});
