import type { ConnectorAdapter, ConnectorConfig, ConnectorContext, ConnectorInstance, HealthcheckResult } from "./runtime.ts";

export type EvolutionValidatedConfig = {
  baseUrl: string;
  instance: string;
  timeoutMs: number;
};

export class EvolutionConfigError extends Error {
  readonly code:
    | "base_url_invalid"
    | "base_url_insecure"
    | "base_url_credentials_forbidden"
    | "base_url_suffix_forbidden"
    | "instance_invalid"
    | "timeout_invalid"
    | "api_key_invalid";

  constructor(code: EvolutionConfigError["code"], message: string) {
    super(message);
    this.name = "EvolutionConfigError";
    this.code = code;
  }
}

function localHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function hasInvalidCredentialCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f || /\s/.test(character);
  });
}

export function validateEvolutionApiKey(value: unknown): string {
  if (typeof value !== "string") throw new EvolutionConfigError("api_key_invalid", "Evolution API key is invalid");
  const normalized = value.trim();
  if (normalized.length < 16 || normalized.length > 512 || hasInvalidCredentialCharacters(normalized)) {
    throw new EvolutionConfigError("api_key_invalid", "Evolution API key is invalid");
  }
  return normalized;
}

export function validateEvolutionWebhookSecret(value: unknown): string {
  if (typeof value !== "string") throw new EvolutionConfigError("api_key_invalid", "Evolution webhook secret is invalid");
  const normalized = value.trim();
  if (normalized.length < 16 || normalized.length > 1024 || hasInvalidCredentialCharacters(normalized)) {
    throw new EvolutionConfigError("api_key_invalid", "Evolution webhook secret is invalid");
  }
  return normalized;
}

export function validateEvolutionBaseUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new EvolutionConfigError("base_url_invalid", "Evolution base URL is required");
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new EvolutionConfigError("base_url_invalid", "Evolution base URL must be an absolute URL");
  }
  if (!url.hostname || url.username || url.password || url.search || url.hash) {
    throw new EvolutionConfigError("base_url_credentials_forbidden", "Evolution base URL contains unsupported credentials or suffixes");
  }
  if (url.protocol !== "https:" && !localHost(url.hostname)) {
    throw new EvolutionConfigError("base_url_insecure", "Evolution base URL must use HTTPS outside local development");
  }
  return url.toString().replace(/\/$/, "");
}

export function validateEvolutionInstance(value: unknown): string {
  if (typeof value !== "string") throw new EvolutionConfigError("instance_invalid", "Evolution instance is invalid");
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(normalized)) {
    throw new EvolutionConfigError("instance_invalid", "Evolution instance must use letters, numbers, dot, underscore or hyphen");
  }
  return normalized;
}

export function validateEvolutionTimeout(value: unknown): number {
  if (value === undefined || value === null) return 8000;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new EvolutionConfigError("timeout_invalid", "Evolution timeout must be a finite number");
  }
  return Math.min(Math.max(Math.round(value), 500), 30000);
}

export function parseEvolutionConfig(config: unknown): EvolutionValidatedConfig {
  const value = config && typeof config === "object" && !Array.isArray(config) ? config as ConnectorConfig : {};
  return {
    baseUrl: validateEvolutionBaseUrl(value.baseUrl),
    instance: validateEvolutionInstance(value.instance),
    timeoutMs: validateEvolutionTimeout(value.timeoutMs),
  };
}

export function validateEvolutionCredential(input: { apiKey: unknown; baseUrl: unknown; instance: unknown }): {
  apiKey: string;
  baseUrl: string;
  instance: string;
} {
  return {
    apiKey: validateEvolutionApiKey(input.apiKey),
    baseUrl: validateEvolutionBaseUrl(input.baseUrl),
    instance: validateEvolutionInstance(input.instance),
  };
}

export class EvolutionApiAdapter implements ConnectorAdapter {
  readonly provider = "evolution";

  validateConfig(config: unknown): void {
    parseEvolutionConfig(config);
  }

  async healthcheck(instance: ConnectorInstance, ctx: ConnectorContext): Promise<HealthcheckResult> {
    const startedAt = Date.now();
    let config: EvolutionValidatedConfig;
    try {
      config = parseEvolutionConfig(instance.config);
    } catch (error) {
      return {
        status: "unhealthy",
        code: "configuration_invalid",
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Invalid Evolution configuration",
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
    try {
      apiKey = validateEvolutionApiKey(apiKey);
    } catch {
      return {
        status: "unhealthy",
        code: "secret_invalid",
        latencyMs: Date.now() - startedAt,
        message: "The Evolution API key failed server-side validation",
      };
    }

    const path = `/instance/connectionState/${encodeURIComponent(config.instance)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetch(new URL(path, config.baseUrl).toString(), {
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
