import type { ConnectionProvider } from "../multitenancy/server.ts";

export type ConnectorConfig = {
  baseUrl?: string;
  instance?: string;
  graphVersion?: string;
  phoneNumberId?: string;
  healthcheckUrl?: string;
  authHeader?: string;
  authScheme?: "bearer" | "apikey" | "raw";
  timeoutMs?: number;
};

export type ConnectorInstance = {
  id: string;
  provider: ConnectionProvider;
  secretRef: string;
  config: ConnectorConfig;
};

export type ConnectorContext = {
  workspaceId: string;
  connectionId: string;
  traceId: string;
  getSecret: (name: string) => Promise<string>;
};

export type HealthcheckResult = {
  status: "healthy" | "degraded" | "unhealthy";
  code:
    | "ok"
    | "configuration_invalid"
    | "secret_unavailable"
    | "timeout"
    | "unauthorized"
    | "rate_limited"
    | "provider_error"
    | "network_error";
  latencyMs: number;
  httpStatus?: number;
  message: string;
};

export interface ConnectorAdapter {
  readonly provider: string;
  validateConfig(config: unknown): void;
  healthcheck(instance: ConnectorInstance, ctx: ConnectorContext): Promise<HealthcheckResult>;
}

function asConfig(config: unknown): ConnectorConfig {
  if (!config || typeof config !== "object" || Array.isArray(config)) return {};
  const value = config as Record<string, unknown>;
  return {
    baseUrl: typeof value.baseUrl === "string" ? value.baseUrl : undefined,
    instance: typeof value.instance === "string" ? value.instance : undefined,
    graphVersion: typeof value.graphVersion === "string" ? value.graphVersion : undefined,
    phoneNumberId: typeof value.phoneNumberId === "string" ? value.phoneNumberId : undefined,
    healthcheckUrl: typeof value.healthcheckUrl === "string" ? value.healthcheckUrl : undefined,
    authHeader: typeof value.authHeader === "string" ? value.authHeader : undefined,
    authScheme: value.authScheme === "apikey" || value.authScheme === "raw" ? value.authScheme : "bearer",
    timeoutMs: typeof value.timeoutMs === "number" ? value.timeoutMs : undefined,
  };
}

function invalid(message: string): never {
  throw new Error(`CONNECTOR_CONFIG_INVALID: ${message}`);
}

function normalizeUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    invalid("healthcheckUrl must be an absolute URL");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (url.protocol !== "https:" && !local) invalid("healthcheckUrl must use HTTPS");
  return url;
}

function safeTimeout(value: number | undefined): number {
  if (value === undefined) return 8000;
  if (!Number.isFinite(value)) invalid("timeoutMs must be finite");
  return Math.min(Math.max(Math.round(value), 500), 30000);
}

export class HttpHealthcheckAdapter implements ConnectorAdapter {
  readonly provider = "http";

  validateConfig(config: unknown): void {
    const normalized = asConfig(config);
    if (!normalized.healthcheckUrl) invalid("healthcheckUrl is required");
    normalizeUrl(normalized.healthcheckUrl);
    safeTimeout(normalized.timeoutMs);
    if (normalized.authHeader && !/^[a-zA-Z0-9-]{1,80}$/.test(normalized.authHeader)) {
      invalid("authHeader contains invalid characters");
    }
  }

  async healthcheck(instance: ConnectorInstance, ctx: ConnectorContext): Promise<HealthcheckResult> {
    const startedAt = Date.now();
    let config: ConnectorConfig;
    try {
      config = asConfig(instance.config);
      this.validateConfig(config);
    } catch (error) {
      return {
        status: "unhealthy",
        code: "configuration_invalid",
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message.replace(/^CONNECTOR_CONFIG_INVALID: /, "") : "Invalid connector configuration",
      };
    }

    let secret: string;
    try {
      secret = await ctx.getSecret("api_key");
    } catch {
      return {
        status: "unhealthy",
        code: "secret_unavailable",
        latencyMs: Date.now() - startedAt,
        message: "The connector secret could not be resolved server-side",
      };
    }

    const header = config.authHeader ?? "authorization";
    const scheme = config.authScheme === "apikey" ? "ApiKey" : config.authScheme === "raw" ? "" : "Bearer";
    const authorization = scheme ? `${scheme} ${secret}` : secret;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), safeTimeout(config.timeoutMs));

    try {
      const response = await fetch(normalizeUrl(config.healthcheckUrl!).toString(), {
        method: "GET",
        headers: { accept: "application/json", [header]: authorization },
        signal: controller.signal,
        redirect: "error",
      });
      const latencyMs = Date.now() - startedAt;
      if (response.ok) {
        return { status: "healthy", code: "ok", httpStatus: response.status, latencyMs, message: "Connector responded successfully" };
      }
      if (response.status === 401 || response.status === 403) {
        return { status: "unhealthy", code: "unauthorized", httpStatus: response.status, latencyMs, message: "Connector rejected the configured credential" };
      }
      if (response.status === 429) {
        return { status: "degraded", code: "rate_limited", httpStatus: response.status, latencyMs, message: "Connector rate limit reached" };
      }
      return {
        status: response.status >= 500 ? "degraded" : "unhealthy",
        code: response.status >= 500 ? "provider_error" : "network_error",
        httpStatus: response.status,
        latencyMs,
        message: "Connector returned a non-success status",
      };
    } catch (error) {
      const timeout = error instanceof Error && error.name === "AbortError";
      return {
        status: "unhealthy",
        code: timeout ? "timeout" : "network_error",
        latencyMs: Date.now() - startedAt,
        message: timeout ? "Connector healthcheck timed out" : "Connector healthcheck failed",
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
