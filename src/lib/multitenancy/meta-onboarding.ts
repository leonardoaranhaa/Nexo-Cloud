import type { Sql } from "../db.ts";
import { requireWorkspaceAccess, type JsonObject, type ConnectionProvider } from "./server.ts";
import type { SecretProvider, SecretProvisioner } from "../connectors/secrets.ts";
import { configuredSecretProvider, createSecretResolver } from "../connectors/secrets.ts";

function required(value: string, field: string, max: number): string { if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${field}_INVALID`); return value.trim(); }
function httpsOrLocal(value: string): string { let parsed: URL; try { parsed = new URL(value); } catch { throw new Error("BASE_URL_INVALID"); } const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname); if (parsed.protocol !== "https:" && !local) throw new Error("BASE_URL_MUST_USE_HTTPS"); return parsed.toString().replace(/\/$/, ""); }

export async function provisionMetaCredential(sql: Sql, userId: string, input: { workspaceId: string; connectionId: string; accessToken: string; appSecret: string; verifyToken: string; phoneNumberId?: string; accountId?: string; graphVersion: string; baseUrl?: string }, provisioner: SecretProvisioner): Promise<void> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "manage");
  const rows = await sql.query<{ workspace_id: string; provider: ConnectionProvider; secret_ref: string | null; config: JsonObject }>(`select workspace_id, provider, secret_ref, config from connections where id = $1 and workspace_id = $2 and deleted_at is null limit 1`, [input.connectionId, input.workspaceId]);
  const connection = rows[0]; if (!connection) throw new Error("CONNECTION_NOT_FOUND"); if (!["meta", "instagram", "messenger"].includes(connection.provider)) throw new Error("META_SOCIAL_CONNECTION_REQUIRED");
  const accessToken = required(input.accessToken, "ACCESS_TOKEN", 4096); const appSecret = required(input.appSecret, "APP_SECRET", 1024); const verifyToken = required(input.verifyToken, "VERIFY_TOKEN", 1024); const accountId = required(connection.provider === "meta" ? input.phoneNumberId ?? "" : input.accountId ?? "", connection.provider === "meta" ? "PHONE_NUMBER_ID" : "ACCOUNT_ID", 160); const graphVersion = required(input.graphVersion, "GRAPH_VERSION", 40); const baseUrl = httpsOrLocal(input.baseUrl?.trim() || (connection.provider === "instagram" ? "https://graph.instagram.com" : "https://graph.facebook.com"));
  const scope = { workspaceId: input.workspaceId, connectionId: input.connectionId, actorId: userId }; const accessRef = connection.secret_ref ?? `nexo/${input.workspaceId}/${input.connectionId}/api_key`; const appRef = `nexo/${input.workspaceId}/${input.connectionId}/meta_app_secret`; const verifyRef = `nexo/${input.workspaceId}/${input.connectionId}/meta_verify_token`;
  await provisioner.put(accessRef, accessToken, scope); await provisioner.put(appRef, appSecret, scope); await provisioner.put(verifyRef, verifyToken, scope);
  await sql.query(`update connections set secret_ref = $2, meta_app_secret_ref = $3, meta_verify_token_ref = $4, config = $5::jsonb, health_status = 'unknown', health_error = null, status = 'disconnected', updated_at = current_timestamp where id = $1 and workspace_id = $6 and deleted_at is null`, [input.connectionId, accessRef, appRef, verifyRef, JSON.stringify({ ...(connection.config ?? {}), baseUrl, graphVersion, ...(connection.provider === "meta" ? { phoneNumberId: accountId } : { accountId }), platform: connection.provider }), input.workspaceId]);
}

export async function getMetaConnectionState(sql: Sql, userId: string, input: { workspaceId: string; connectionId: string }, secretProvider?: SecretProvider): Promise<{ status: "connected" | "disconnected" | "error"; message: string }> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  const rows = await sql.query<{ id: string; provider: ConnectionProvider; secret_ref: string | null; config: JsonObject }>(`select id, provider, secret_ref, config from connections where id = $1 and workspace_id = $2 and deleted_at is null limit 1`, [input.connectionId, input.workspaceId]);
  const connection = rows[0]; if (!connection || !["meta", "instagram", "messenger"].includes(connection.provider)) throw new Error("META_SOCIAL_CONNECTION_REQUIRED");
  const config = connection.config ?? {}; const baseUrl = httpsOrLocal(typeof config.baseUrl === "string" ? config.baseUrl : connection.provider === "instagram" ? "https://graph.instagram.com" : "https://graph.facebook.com"); const version = typeof config.graphVersion === "string" ? config.graphVersion : "v26.0"; const accountId = typeof config.accountId === "string" ? config.accountId : typeof config.phoneNumberId === "string" ? config.phoneNumberId : "";
  try {
    if (!accountId || !connection.secret_ref) throw new Error("META_SOCIAL_CONFIGURATION_REQUIRED");
    const token = await createSecretResolver(secretProvider ?? configuredSecretProvider(sql))(connection.secret_ref, { workspaceId: input.workspaceId, connectionId: connection.id });
    const response = await fetch(`${baseUrl}/${encodeURIComponent(version)}/${encodeURIComponent(accountId)}?fields=id`, { headers: { accept: "application/json", authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000), redirect: "error" });
    if (!response.ok) throw new Error(`META_SOCIAL_HTTP_${response.status}`);
    await sql.query(`update connections set status = 'connected', health_status = 'healthy', health_error = null, last_healthcheck_at = current_timestamp, updated_at = current_timestamp where id = $1 and workspace_id = $2`, [connection.id, input.workspaceId]);
    return { status: "connected", message: `${connection.provider === "instagram" ? "Instagram" : "Messenger"} conectado e pronto para o agente.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "META_SOCIAL_STATE_FAILED";
    await sql.query(`update connections set status = 'disconnected', health_status = 'unhealthy', health_error = $3, last_healthcheck_at = current_timestamp, updated_at = current_timestamp where id = $1 and workspace_id = $2`, [connection.id, input.workspaceId, message.slice(0, 240)]);
    return { status: "error", message: "Não foi possível consultar o estado do canal Meta." };
  }
}
