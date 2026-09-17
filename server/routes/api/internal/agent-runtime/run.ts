import { timingSafeEqual } from "node:crypto";
import { randomUUID } from "node:crypto";
import { defineEventHandler } from "h3";
import { getSql } from "../../../../../src/lib/db";
import { configuredSecretProvider } from "../../../../../src/lib/connectors/secrets";
import { runNextAgentRuntimeJob } from "../../../../../src/lib/agent-runtime/runtime";
import { reconcilePendingDeliveries } from "../../../../../src/lib/messaging/router";

function authorized(request: Request, expected: string): boolean {
  const received = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!received.startsWith(prefix)) return false;
  const left = Buffer.from(received.slice(prefix.length));
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export default defineEventHandler(async (event) => {
  const token = (process.env.NEXO_RUNTIME_WORKER_TOKEN || process.env.CRON_SECRET)?.trim();
  if (!token) return json({ ok: false, error: "RUNTIME_WORKER_NOT_CONFIGURED" }, 503);
  const request = new Request("https://nexo.internal/runtime", {
    method: event.req.method ?? "POST",
    headers: event.req.headers,
  });
  if (!authorized(request, token)) return json({ ok: false, error: "RUNTIME_WORKER_UNAUTHORIZED" }, 401);
  if (request.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const sql = await getSql();
    const provider = configuredSecretProvider(sql);
    const reconciledDeliveries = await reconcilePendingDeliveries(sql, 100);
    const batch = Math.min(Math.max(Number(process.env.NEXO_RUNTIME_MAX_BATCH ?? 5), 1), 10);
    const results = [];
    for (let index = 0; index < batch; index += 1) {
      const result = await runNextAgentRuntimeJob(sql, `http-worker:${process.pid}:${randomUUID()}`, undefined, provider);
      results.push(result);
      if (result.status === "idle") break;
    }
    return json({ ok: true, reconciledDeliveries, results });
  } catch {
    return json({ ok: false, error: "RUNTIME_WORKER_FAILED" }, 500);
  }
});
