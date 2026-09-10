import type { ConnectorAdapter, ConnectorConfig, ConnectorContext, ConnectorInstance, HealthcheckResult } from "./runtime.ts";

function required(value: string | undefined, field: string): string {
  if (!value?.trim()) throw new Error(`EVOLUTION_CONFIG_INVALID: ${field} is required`);
  return value.trim();
}

function baseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("EVOLUTION_CONFIG_INVALID: baseUrl must be an absolute URL");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (url.protocol !== "https:" && !local) {
    throw new Error("EVOLUTION_CONFIG_INVALID: baseUrl must use HTTPS");
  }
  return url;
}

function timeoutMs(value: number | undefined): number {
  if (value === undefined) return 8000;
  if (!Number.isFinite(value)) throw new Error("EVOLUTION_CONFIG_INVALID: timeoutMs must be finite");
  return Math.min(Math.max(Math.round(value), 500), 30000);
}

export class EvolutionApiAdapter implements ConnectorAdapter {
  readonly provider = "evolution";

  validateConfig(config: unknown): void {
    const value = (config && typeof config === "object" ? config : {}) as ConnectorConfig;
    baseUrl(required(value.baseUrl, "baseUrl"));
    required(value.instance, "instance");
    timeoutMs(value.timeoutMs);
  }

  async healthcheck(instance: ConnectorInstance, ctx: ConnectorContext): Promise<HealthcheckResult> {
    const startedAt = Date.now();
    const config = instance.config;
    try {
      this.validateConfig(config);
    } catch (error) {
      return {
        status: "unhealthy",
        code: "configuration_invalid",
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message.replace(/^EVOLUTION_CONFIG_INVALID: /, "") : "Invalid Evolution configuration",
      };
    }

    let apiKey: string;
    try {
      apiKey = await ctx.getSecret("api_key");
    } catch {
      return {
        status: "unhealthy",
        code: "secret_unavailable",
        latencyMs: Date.now() - startedAt,
        message: "The Evolution API key could not be resolved server-side",
      };
    }

    const url = baseUrl(config.baseUrl!);
    const path = `/instance/connectionState/${encodeURIComponent(config.instance!)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs(config.timeoutMs));
    try {
      const response = await fetch(new URL(path, url).toString(), {
        method: "GET",
        headers: { accept: "application/json", apikey: apiKey },
        signal: controller.signal,
        redirect: "error",
      });
      const latencyMs = Date.now() - startedAt;
      if (response.ok) {
        return {
          status: "healthy",
          code: "ok",
          httpStatus: response.status,
          latencyMs,
          message: "Evolution API accepted the connection-state request",
        };
      }
      if (response.status === 401 || response.status === 403) {
        return { status: "unhealthy", code: "unauthorized", httpStatus: response.status, latencyMs, message: "Evolution API rejected the configured apikey" };
      }
      if (response.status === 429) {
        return { status: "degraded", code: "rate_limited", httpStatus: response.status, latencyMs, message: "Evolution API rate limit reached" };
      }
      return {
        status: response.status >= 500 ? "degraded" : "unhealthy",
        code: response.status >= 500 ? "provider_error" : "network_error",
        httpStatus: response.status,
        latencyMs,
        message: "Evolution API returned a non-success status",
      };
    } catch (error) {
      const timeout = error instanceof Error && error.name === "AbortError";
      return {
        status: "unhealthy",
        code: timeout ? "timeout" : "network_error",
        latencyMs: Date.now() - startedAt,
        message: timeout ? "Evolution API healthcheck timed out" : "Evolution API healthcheck failed",
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
