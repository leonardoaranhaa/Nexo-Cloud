import type { Sql } from "../db";
import { requireWorkspaceAccess, type ConnectionProvider } from "../multitenancy/server.ts";

export type ConnectionReadiness = {
  connectionId: string;
  provider: ConnectionProvider;
  status: "ready" | "needs_configuration" | "not_checked" | "unhealthy";
  code: "healthcheck_healthy" | "healthcheck_required" | "healthcheck_failed" | "secret_ref_missing" | "provider_config_missing" | "transport_not_implemented";
  message: string;
};

type ConnectionRow = {
  id: string;
  workspace_id: string;
  provider: ConnectionProvider;
  secret_ref: string | null;
  health_status: "healthy" | "degraded" | "unhealthy" | "unknown" | null;
  config: { instance?: string | null; phoneNumberId?: string | null; baseUrl?: string | null };
};

export async function assessConnectionReadiness(
  sql: Sql,
  userId: string,
  input: { workspaceId: string; connectionId: string },
): Promise<ConnectionReadiness> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  const rows = await sql.query<ConnectionRow>(
    `select id, workspace_id, provider, secret_ref, health_status, config
       from connections
      where id = $1 and workspace_id = $2 and deleted_at is null
      limit 1`,
    [input.connectionId, input.workspaceId],
  );
  const row = rows[0];
  if (!row) throw new Error("CONNECTION_NOT_FOUND");

  if (!row.secret_ref) {
    return {
      connectionId: row.id,
      provider: row.provider,
      status: "needs_configuration",
      code: "secret_ref_missing",
      message: "A conexão ainda não possui uma referência de segredo no cofre.",
    };
  }

  const providerConfig = row.config as Record<string, unknown>;
  const configMissing = row.provider === "meta"
    ? typeof providerConfig.phoneNumberId !== "string" || typeof providerConfig.graphVersion !== "string"
    : !row.config?.instance || !row.config?.baseUrl;
  if (configMissing) {
    return {
      connectionId: row.id,
      provider: row.provider,
      status: "needs_configuration",
      code: "provider_config_missing",
      message: "A configuração mínima do provedor ainda não foi preenchida.",
    };
  }

  if (row.provider === "evolution" || row.provider === "meta") {
    if (row.health_status === "healthy") {
      return {
        connectionId: row.id,
        provider: row.provider,
        status: "ready",
        code: "healthcheck_healthy",
        message: `${row.provider === "meta" ? "Meta Cloud API" : "Evolution"} respondeu ao último healthcheck; a conexão está pronta para uso contextual.`,
      };
    }
    if (row.health_status === "unhealthy" || row.health_status === "degraded") {
      return {
        connectionId: row.id,
        provider: row.provider,
        status: "unhealthy",
        code: "healthcheck_failed",
        message: `O último healthcheck do provedor retornou estado ${row.health_status}; corrija a conexão antes de publicar.`,
      };
    }
    return {
      connectionId: row.id,
      provider: row.provider,
      status: "not_checked",
      code: "healthcheck_required",
      message: `${row.provider === "meta" ? "Meta Cloud API" : "Evolution"} configurada, mas ainda não foi validada por healthcheck.`,
    };
  }

  return {
    connectionId: row.id,
    provider: row.provider,
    status: "not_checked",
    code: "transport_not_implemented",
    message: "Configuração pronta; o healthcheck externo será executado pelo Connector Runtime.",
  };
}
