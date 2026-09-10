import type { ConnectorConfig, ConnectorContext } from "./runtime.ts";

export type EvolutionTextMessage = {
  baseUrl: string;
  instance: string;
  recipient: string;
  text: string;
  timeoutMs?: number;
};

export type EvolutionDispatchResult = {
  status: "sent" | "failed" | "unknown";
  code: "ok" | "secret_unavailable" | "invalid_request" | "unauthorized" | "rate_limited" | "provider_error" | "timeout" | "network_error";
  httpStatus?: number;
  latencyMs: number;
  message: string;
  providerMessageId?: string;
};

function baseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("EVOLUTION_CONFIG_INVALID: baseUrl must be an absolute URL");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (url.protocol !== "https:" && !local) throw new Error("EVOLUTION_CONFIG_INVALID: baseUrl must use HTTPS");
  return url;
}

function timeoutMs(value: number | undefined): number {
  if (value === undefined) return 10000;
  if (!Number.isFinite(value)) throw new Error("EVOLUTION_CONFIG_INVALID: timeoutMs must be finite");
  return Math.min(Math.max(Math.round(value), 500), 30000);
}

function recipient(value: string): string {
  const normalized = value.trim().replace(/^[+\s]/, "").replace(/[\s().-]/g, "");
  if (!/^\d{8,20}$/.test(normalized)) throw new Error("RECIPIENT_INVALID");
  return normalized;
}

export class EvolutionTextDispatcher {
  async sendText(message: EvolutionTextMessage, ctx: ConnectorContext): Promise<EvolutionDispatchResult> {
    const startedAt = Date.now();
    let url: URL;
    let to: string;
    try {
      url = baseUrl(message.baseUrl);
      if (!message.instance.trim()) throw new Error("EVOLUTION_CONFIG_INVALID: instance is required");
      to = recipient(message.recipient);
      if (!message.text.trim() || message.text.length > 4096) throw new Error("TEXT_INVALID");
    } catch {
      return {
        status: "failed",
        code: "invalid_request",
        latencyMs: Date.now() - startedAt,
        message: "Evolution message configuration is invalid",
      };
    }

    let apiKey: string;
    try {
      apiKey = await ctx.getSecret("api_key");
    } catch {
      return { status: "failed", code: "secret_unavailable", latencyMs: Date.now() - startedAt, message: "The Evolution API key could not be resolved server-side" };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs(message.timeoutMs));
    try {
      const endpoint = new URL(`/message/sendText/${encodeURIComponent(message.instance)}`, url).toString();
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json", apikey: apiKey },
        body: JSON.stringify({ number: to, textMessage: { text: message.text } }),
        signal: controller.signal,
        redirect: "error",
      });
      const latencyMs = Date.now() - startedAt;
      if (response.ok) {
        let providerMessageId: string | undefined;
        try {
          const body = await response.json() as { key?: { id?: unknown } };
          providerMessageId = typeof body.key?.id === "string" ? body.key.id.slice(0, 240) : undefined;
        } catch {
          // A successful provider response without a parseable body is still sent;
          // the delivery remains eligible for reconciliation through webhook data.
        }
        return { status: "sent", code: "ok", httpStatus: response.status, latencyMs, message: "Evolution API accepted the text message", ...(providerMessageId ? { providerMessageId } : {}) };
      }
      if (response.status === 400) return { status: "failed", code: "invalid_request", httpStatus: response.status, latencyMs, message: "Evolution API rejected the message payload" };
      if (response.status === 401 || response.status === 403) return { status: "failed", code: "unauthorized", httpStatus: response.status, latencyMs, message: "Evolution API rejected the configured apikey" };
      if (response.status === 429) return { status: "unknown", code: "rate_limited", httpStatus: response.status, latencyMs, message: "Evolution API rate limit reached" };
      if (response.status >= 500) return { status: "unknown", code: "provider_error", httpStatus: response.status, latencyMs, message: "Evolution API returned a provider error" };
      return { status: "failed", code: "network_error", httpStatus: response.status, latencyMs, message: "Evolution API returned a non-success status" };
    } catch (error) {
      const timeout = error instanceof Error && error.name === "AbortError";
      return { status: "unknown", code: timeout ? "timeout" : "network_error", latencyMs: Date.now() - startedAt, message: timeout ? "Evolution message dispatch timed out" : "Evolution message dispatch failed" };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function evolutionConfig(config: ConnectorConfig): { baseUrl: string; instance: string; timeoutMs?: number } {
  return { baseUrl: config.baseUrl ?? "", instance: config.instance ?? "", timeoutMs: config.timeoutMs };
}
