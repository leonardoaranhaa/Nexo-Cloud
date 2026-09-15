import { defineEventHandler, getRouterParam, readRawBody } from "h3";
import { getSql } from "../../../../../src/lib/db";
import { configuredSecretProvider } from "../../../../../src/lib/connectors/secrets";
import { handleMetaWebhook, WebhookRequestError } from "../../../../../src/lib/webhooks/meta-handler";

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export default defineEventHandler(async (event) => {
  const node = event.node;
  const connectionId = getRouterParam(event, "connectionId");
  if (!node || !connectionId) return json({ ok: false, error: "WEBHOOK_RUNTIME_UNAVAILABLE" }, 500);

  const method = node.req.method?.toUpperCase() ?? "GET";
  const headers = new Headers();
  for (const [key, value] of Object.entries(node.req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(", "));
  }

  let body = "";
  if (method === "POST") body = (await readRawBody(event, "utf8")) ?? "";
  const query = node.req.url?.includes("?") ? node.req.url.slice(node.req.url.indexOf("?")) : "";
  const request = new Request(`https://nexo.internal/api/webhooks/meta/${connectionId}${query}`, {
    method,
    headers,
    body: method === "POST" ? body : undefined,
  });

  try {
    const sql = await getSql();
    const provider = configuredSecretProvider(sql);
    const outcome = await handleMetaWebhook(sql, request, { connectionId, secretProvider: provider });

    if (method === "GET") {
      return new Response(new URL(request.url).searchParams.get("hub.challenge") ?? "", {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    return json({
      ok: true,
      accepted: outcome.accepted,
      kind: outcome.kind,
      duplicate: outcome.duplicate ?? false,
      queued: Boolean(outcome.jobId),
    }, outcome.jobId ? 202 : 200);
  } catch (error) {
    if (error instanceof WebhookRequestError) return json({ ok: false, error: error.message }, error.status);
    return json({ ok: false, error: "WEBHOOK_PROCESSING_FAILED" }, 500);
  }
});
