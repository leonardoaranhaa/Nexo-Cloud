import type { ConnectorContext, HealthcheckResult, ConnectorInstance } from "./runtime.ts";

type MetaPlatform = "whatsapp" | "instagram" | "messenger";
type MetaConfig = { baseUrl?: string; graphVersion?: string; phoneNumberId?: string; accountId?: string; timeoutMs?: number; platform?: MetaPlatform };
export type MetaTextMessage = { baseUrl?: string; graphVersion?: string; phoneNumberId?: string; accountId?: string; recipient: string; text: string; timeoutMs?: number; platform?: MetaPlatform };
export type MetaDispatchResult = { status: "sent" | "failed" | "unknown"; code: "ok" | "invalid_request" | "secret_unavailable" | "unauthorized" | "rate_limited" | "provider_error" | "timeout" | "network_error"; httpStatus?: number; latencyMs: number; message: string; providerMessageId?: string };

function config(value: unknown): MetaConfig { const v = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; return { baseUrl: typeof v.baseUrl === "string" ? v.baseUrl : undefined, graphVersion: typeof v.graphVersion === "string" ? v.graphVersion : undefined, phoneNumberId: typeof v.phoneNumberId === "string" ? v.phoneNumberId : undefined, accountId: typeof v.accountId === "string" ? v.accountId : undefined, timeoutMs: typeof v.timeoutMs === "number" ? v.timeoutMs : undefined, platform: v.platform === "instagram" || v.platform === "messenger" || v.platform === "whatsapp" ? v.platform : undefined }; }
function url(value: string): URL { const parsed = new URL(value); const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname); if (parsed.protocol !== "https:" && !local) throw new Error("META_CONFIG_INVALID"); return parsed; }
function timeout(value: number | undefined): number { return value === undefined ? 10000 : Math.min(Math.max(Math.round(value), 500), 30000); }
function recipient(value: string): string { const normalized = value.trim().replace(/\D/g, ""); if (!/^\d{8,30}$/.test(normalized)) throw new Error("RECIPIENT_INVALID"); return normalized; }
function platformConfig(c: MetaConfig, instanceProvider?: string): { platform: MetaPlatform; baseUrl: string; version: string; accountId: string } { const platform = c.platform ?? (instanceProvider === "instagram" ? "instagram" : instanceProvider === "messenger" ? "messenger" : "whatsapp"); const baseUrl = c.baseUrl ?? (platform === "instagram" ? "https://graph.instagram.com" : "https://graph.facebook.com"); const accountId = platform === "whatsapp" ? c.phoneNumberId ?? "" : c.accountId ?? ""; return { platform, baseUrl, version: c.graphVersion ?? "v26.0", accountId }; }
function endpoint(c: ReturnType<typeof platformConfig>, path: string): string { const base = url(c.baseUrl); return new URL(`/${encodeURIComponent(c.version)}/${encodeURIComponent(c.accountId)}${path}`, base).toString(); }
function resultFor(status: number, latencyMs: number): MetaDispatchResult { if (status === 400) return { status: "failed", code: "invalid_request", httpStatus: status, latencyMs, message: "Meta rejected the message payload" }; if (status === 401 || status === 403) return { status: "failed", code: "unauthorized", httpStatus: status, latencyMs, message: "Meta rejected the configured access token" }; if (status === 429) return { status: "unknown", code: "rate_limited", httpStatus: status, latencyMs, message: "Meta rate limit reached" }; if (status >= 500) return { status: "unknown", code: "provider_error", httpStatus: status, latencyMs, message: "Meta returned a provider error" }; return { status: "failed", code: "network_error", httpStatus: status, latencyMs, message: "Meta returned a non-success status" }; }

export class MetaCloudApiAdapter {
  readonly provider = "meta";
  validateConfig(value: unknown): void { const c = config(value); const resolved = platformConfig(c, "meta"); if (!resolved.accountId || !c.graphVersion) throw new Error("META_CONFIG_INVALID"); url(resolved.baseUrl); }
  async healthcheck(instance: ConnectorInstance, ctx: ConnectorContext): Promise<HealthcheckResult> {
    const started = Date.now();
    try {
      const c = config(instance.config); const resolved = platformConfig(c, instance.provider);
      if (!resolved.accountId || !c.graphVersion) throw new Error("META_CONFIG_INVALID");
      url(resolved.baseUrl);
      const token = await ctx.getSecret("api_key");
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout(c.timeoutMs));
      try {
        const fields = resolved.platform === "whatsapp" ? "id,display_phone_number,verified_name" : resolved.platform === "instagram" ? "id,username" : "id,name";
        const response = await fetch(endpoint(resolved, `?fields=${fields}`), { headers: { accept: "application/json", authorization: `Bearer ${token}` }, signal: controller.signal, redirect: "error" });
        const latencyMs = Date.now() - started;
        if (response.ok) return { status: "healthy", code: "ok", httpStatus: response.status, latencyMs, message: `${resolved.platform} API accepted the account query` };
        const mapped = resultFor(response.status, latencyMs); return { status: mapped.status === "unknown" ? "degraded" : "unhealthy", code: mapped.code === "invalid_request" ? "configuration_invalid" : mapped.code, httpStatus: mapped.httpStatus, latencyMs, message: mapped.message };
      } finally { clearTimeout(timer); }
    } catch (error) {
      const code = error instanceof Error && error.name === "AbortError" ? "timeout" : error instanceof Error && error.message === "META_CONFIG_INVALID" ? "configuration_invalid" : "network_error";
      return { status: "unhealthy", code, latencyMs: Date.now() - started, message: code === "configuration_invalid" ? "Meta social connector configuration is invalid" : code === "timeout" ? "Meta social healthcheck timed out" : "Meta social healthcheck failed" };
    }
  }
}

export class MetaTextDispatcher {
  async sendText(message: MetaTextMessage, ctx: ConnectorContext): Promise<MetaDispatchResult> {
    const started = Date.now(); let c: MetaConfig; let to: string; let resolved: ReturnType<typeof platformConfig>;
    try { c = config(message); c.phoneNumberId = message.phoneNumberId; c.accountId = message.accountId; c.graphVersion = message.graphVersion ?? c.graphVersion; c.platform = message.platform ?? c.platform; resolved = platformConfig(c); if (!resolved.accountId || !c.graphVersion) throw new Error("META_CONFIG_INVALID"); to = recipient(message.recipient); if (!message.text.trim() || new TextEncoder().encode(message.text).length > (resolved.platform === "instagram" ? 1000 : 4096)) throw new Error("TEXT_INVALID"); } catch { return { status: "failed", code: "invalid_request", latencyMs: Date.now() - started, message: "Meta social message configuration is invalid" }; }
    let token: string; try { token = await ctx.getSecret("api_key"); } catch { return { status: "failed", code: "secret_unavailable", latencyMs: Date.now() - started, message: "The Meta access token could not be resolved server-side" }; }
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout(c.timeoutMs));
    try {
      const body = resolved.platform === "whatsapp" ? { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body: message.text } } : { recipient: { id: to }, message: { text: message.text } };
      const response = await fetch(endpoint(resolved, "/messages"), { method: "POST", headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: controller.signal, redirect: "error" });
      const latencyMs = Date.now() - started;
      if (response.ok) { let id: string | undefined; try { const value = await response.json() as { messages?: Array<{ id?: unknown }>; message_id?: unknown }; id = typeof value.messages?.[0]?.id === "string" ? value.messages[0].id : typeof value.message_id === "string" ? value.message_id : undefined; } catch { /* accepted without response body */ } return { status: "sent", code: "ok", httpStatus: response.status, latencyMs, message: `${resolved.platform} API accepted the text message`, ...(id ? { providerMessageId: id.slice(0, 240) } : {}) }; }
      return resultFor(response.status, latencyMs);
    } catch (error) { const aborted = error instanceof Error && error.name === "AbortError"; return { status: "unknown", code: aborted ? "timeout" : "network_error", latencyMs: Date.now() - started, message: aborted ? "Meta social message dispatch timed out" : "Meta social message dispatch failed" }; } finally { clearTimeout(timer); }
  }
}
