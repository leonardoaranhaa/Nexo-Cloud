import type { Sql } from "../db.ts";
import { requireWorkspaceAccess, type ConnectionProvider } from "../multitenancy/server.ts";
import { configuredSecretProvider, createSecretResolver, type SecretProvider } from "./secrets.ts";

export type EvolutionQrState = {
  status: "qr" | "connected" | "disconnected" | "error";
  qr?: string;
  phone?: string;
  message: string;
};

type ConnectionRow = {
  id: string;
  workspace_id: string;
  provider: ConnectionProvider;
  secret_ref: string | null;
  config: Record<string, unknown> | null;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function apiUrl(baseUrl: string, path: string): string {
  const url = new URL(path.replace(/^\//, ""), `${baseUrl.replace(/\/$/, "")}/`);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("EVOLUTION_BASE_URL_MUST_USE_HTTPS");
  }
  return url.toString();
}

async function evolutionFetch(baseUrl: string, apiKey: string, path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(apiUrl(baseUrl, path), {
    ...init,
    headers: { "content-type": "application/json", apikey: apiKey, ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.text();
  let parsed: unknown = {};
  try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = {}; }
  if (!response.ok) throw new Error(`EVOLUTION_HTTP_${response.status}`);
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}

function qrFrom(payload: Record<string, unknown>): string | undefined {
  const direct = text(payload.base64) || text(payload.qrcode) || text(payload.code);
  if (direct) return direct;
  const nested = payload.qrcode;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return text((nested as Record<string, unknown>).base64) || text((nested as Record<string, unknown>).code) || undefined;
  }
  return undefined;
}

function stateFrom(payload: Record<string, unknown>): "connected" | "disconnected" | undefined {
  const state = text(payload.state) || text((payload.instance as Record<string, unknown> | undefined)?.state);
  if (["open", "connected", "online"].includes(state.toLowerCase())) return "connected";
  if (["close", "closed", "disconnected"].includes(state.toLowerCase())) return "disconnected";
  return undefined;
}

async function connection(sql: Sql, userId: string, input: { workspaceId: string; connectionId: string }, secretProvider?: SecretProvider, permission: "read" | "write" = "write"): Promise<{ row: ConnectionRow; apiKey: string; baseUrl: string; instance: string }> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, permission);
  const rows = await sql.query<ConnectionRow>(`select id, workspace_id, provider, secret_ref, config from connections where id = $1 and workspace_id = $2 and deleted_at is null limit 1`, [input.connectionId, input.workspaceId]);
  const row = rows[0];
  if (!row) throw new Error("CONNECTION_NOT_FOUND");
  if (row.provider !== "evolution") throw new Error("QR_ONLY_SUPPORTED_FOR_EVOLUTION");
  const baseUrl = text(row.config?.baseUrl);
  const instance = text(row.config?.instance);
  if (!baseUrl || !instance) throw new Error("EVOLUTION_CONNECTION_CONFIGURATION_REQUIRED");
  const apiKey = await createSecretResolver(secretProvider ?? configuredSecretProvider(sql))(row.secret_ref ?? "", { workspaceId: input.workspaceId, connectionId: row.id });
  return { row, apiKey, baseUrl, instance };
}

export async function startEvolutionQr(sql: Sql, userId: string, input: { workspaceId: string; connectionId: string }, secretProvider?: SecretProvider): Promise<EvolutionQrState> {
  const current = await connection(sql, userId, input, secretProvider);
  const resolve = secretProvider ? createSecretResolver(secretProvider) : null;
  const apiKey = resolve ? await resolve(current.row.secret_ref ?? "", { workspaceId: input.workspaceId, connectionId: current.row.id }) : current.apiKey;
  try {
    try {
      await evolutionFetch(current.baseUrl, apiKey, "/instance/create", { method: "POST", body: JSON.stringify({ instanceName: current.instance, integration: "WHATSAPP-BAILEYS", qrcode: true }) });
    } catch (error) {
      if (!(error instanceof Error && /EVOLUTION_HTTP_(400|409)/.test(error.message))) throw error;
    }
    const payload = await evolutionFetch(current.baseUrl, apiKey, `/instance/connect/${encodeURIComponent(current.instance)}`);
    const state = stateFrom(payload);
    const qr = qrFrom(payload);
    if (state === "connected") {
      await sql.query(`update connections set status = 'connected', health_status = 'healthy', last_healthcheck_at = current_timestamp, updated_at = current_timestamp where id = $1 and workspace_id = $2`, [current.row.id, input.workspaceId]);
      return { status: "connected", message: "WhatsApp já está conectado." };
    }
    await sql.query(`update connections set status = 'pending', health_status = 'unknown', updated_at = current_timestamp where id = $1 and workspace_id = $2`, [current.row.id, input.workspaceId]);
    return { status: qr ? "qr" : "disconnected", ...(qr ? { qr } : {}), message: qr ? "Escaneie o QR Code pelo WhatsApp do celular." : "A Evolution não retornou um QR Code. Tente novamente." };
  } catch (error) {
    const code = error instanceof Error ? error.message : "EVOLUTION_QR_FAILED";
    await sql.query(`update connections set status = 'error', health_status = 'failed', health_error = $3, updated_at = current_timestamp where id = $1 and workspace_id = $2`, [current.row.id, input.workspaceId, code.slice(0, 240)]);
    return { status: "error", message: "Não foi possível iniciar a conexão QR. Verifique a URL, API key e instância Evolution." };
  }
}

export async function getEvolutionConnectionState(sql: Sql, userId: string, input: { workspaceId: string; connectionId: string }, secretProvider?: SecretProvider): Promise<EvolutionQrState> {
  const current = await connection(sql, userId, input, secretProvider, "read");
  const resolve = secretProvider ? createSecretResolver(secretProvider) : null;
  const apiKey = resolve ? await resolve(current.row.secret_ref ?? "", { workspaceId: input.workspaceId, connectionId: current.row.id }) : current.apiKey;
  try {
    const payload = await evolutionFetch(current.baseUrl, apiKey, `/instance/connectionState/${encodeURIComponent(current.instance)}`);
    const state = stateFrom(payload);
    if (state === "connected") {
      await sql.query(`update connections set status = 'connected', health_status = 'healthy', last_healthcheck_at = current_timestamp, updated_at = current_timestamp where id = $1 and workspace_id = $2`, [current.row.id, input.workspaceId]);
      return { status: "connected", message: "WhatsApp conectado e pronto para o agente." };
    }
    return { status: state ?? "disconnected", message: state === "disconnected" ? "WhatsApp desconectado; inicie um novo QR Code." : "Aguardando o pareamento do WhatsApp." };
  } catch {
    return { status: "error", message: "Não foi possível consultar o estado da conexão." };
  }
}
