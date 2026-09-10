import type { Sql } from "../db.ts";
import { requireWorkspaceAccess, type JsonObject, type ConnectionProvider } from "./server.ts";
import type { SecretProvisioner } from "../connectors/secrets.ts";

function required(value: string, field: string, max: number): string { if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${field}_INVALID`); return value.trim(); }
function httpsOrLocal(value: string): string { let parsed: URL; try { parsed = new URL(value); } catch { throw new Error("BASE_URL_INVALID"); } const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname); if (parsed.protocol !== "https:" && !local) throw new Error("BASE_URL_MUST_USE_HTTPS"); return parsed.toString().replace(/\/$/, ""); }

export async function provisionMetaCredential(sql: Sql, userId: string, input: { workspaceId: string; connectionId: string; accessToken: string; appSecret: string; verifyToken: string; phoneNumberId: string; graphVersion: string; baseUrl?: string }, provisioner: SecretProvisioner): Promise<void> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "manage");
  const rows = await sql.query<{ workspace_id: string; provider: ConnectionProvider; secret_ref: string | null; config: JsonObject }>(`select workspace_id, provider, secret_ref, config from connections where id = $1 and workspace_id = $2 and deleted_at is null limit 1`, [input.connectionId, input.workspaceId]);
  const connection = rows[0]; if (!connection) throw new Error("CONNECTION_NOT_FOUND"); if (connection.provider !== "meta") throw new Error("META_CONNECTION_REQUIRED");
  const accessToken = required(input.accessToken, "ACCESS_TOKEN", 4096); const appSecret = required(input.appSecret, "APP_SECRET", 1024); const verifyToken = required(input.verifyToken, "VERIFY_TOKEN", 1024); const phoneNumberId = required(input.phoneNumberId, "PHONE_NUMBER_ID", 160); const graphVersion = required(input.graphVersion, "GRAPH_VERSION", 40); const baseUrl = httpsOrLocal(input.baseUrl?.trim() || "https://graph.facebook.com");
  const scope = { workspaceId: input.workspaceId, connectionId: input.connectionId }; const accessRef = connection.secret_ref ?? `nexo/${input.workspaceId}/${input.connectionId}/api_key`; const appRef = `nexo/${input.workspaceId}/${input.connectionId}/meta_app_secret`; const verifyRef = `nexo/${input.workspaceId}/${input.connectionId}/meta_verify_token`;
  await provisioner.put(accessRef, accessToken, scope); await provisioner.put(appRef, appSecret, scope); await provisioner.put(verifyRef, verifyToken, scope);
  await sql.query(`update connections set secret_ref = $2, meta_app_secret_ref = $3, meta_verify_token_ref = $4, config = $5::jsonb, health_status = 'unknown', health_error = null, status = 'disconnected', updated_at = current_timestamp where id = $1 and workspace_id = $6 and deleted_at is null`, [input.connectionId, accessRef, appRef, verifyRef, JSON.stringify({ ...(connection.config ?? {}), baseUrl, graphVersion, phoneNumberId }), input.workspaceId]);
}
