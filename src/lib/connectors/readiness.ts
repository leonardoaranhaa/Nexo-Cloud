import type { Sql } from "../db";
import { requireWorkspaceAccess, type ConnectionProvider } from "../multitenancy/server.ts";

export type ConnectionReadiness = {
  connectionId: string;
  provider: ConnectionProvider;
  status: "ready" | "needs_configuration" | "not_checked";
  code: "ready_for_healthcheck" | "secret_ref_missing" | "provider_config_missing" | "transport_not_implemented";
  message: string;
};

type ConnectionRow = {
  id: string;
  workspace_id: string;
  provider: ConnectionProvider;
  secret_ref: string | null;
  config: { instance?: string | null; phoneNumberId?: string | null; baseUrl?: string | null };
};

export async function assessConnectionReadiness(
  sql: Sql,
  userId: string,
  input: { workspaceId: string; connectionId: string },
): Promise<ConnectionReadiness> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  const rows = await sql.query<ConnectionRow>(
    `select id, workspace_id, provider, secret_ref, config
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

  const configMissing = row.provider === "meta"
    ? !row.config?.phoneNumberId
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

  if (row.provider === "evolution") {
    return {
      connectionId: row.id,
      provider: row.provider,
      status: "ready",
      code: "ready_for_healthcheck",
      message: "Evolution configurada; o healthcheck oficial pode ser executado.",
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
