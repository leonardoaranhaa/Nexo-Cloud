import type { Sql } from "../db";
import { requireWorkspaceAccess, type ConnectionProvider } from "../multitenancy/server.ts";
import {
  configuredSecretProvider,
  createSecretResolver,
  type SecretProvider,
} from "./secrets.ts";
import { HttpHealthcheckAdapter, type ConnectorConfig, type HealthcheckResult } from "./runtime.ts";
import { EvolutionApiAdapter } from "./evolution.ts";
import { MetaCloudApiAdapter } from "./meta-messaging.ts";

export type HealthcheckRun = HealthcheckResult & {
  connectionId: string;
  provider: ConnectionProvider;
};

type ConnectionRow = {
  id: string;
  workspace_id: string;
  provider: ConnectionProvider;
  secret_ref: string | null;
  config: ConnectorConfig;
};

function adapterForProvider(provider: ConnectionProvider) {
  if (provider === "evolution") return new EvolutionApiAdapter();
  if (provider === "meta") return new MetaCloudApiAdapter();
  // Provider-specific adapters will be added after their exact contracts are verified.
  return new HttpHealthcheckAdapter();
}

export async function runConnectionHealthcheck(
  sql: Sql,
  userId: string,
  input: { workspaceId: string; connectionId: string; traceId: string },
  secretProvider: SecretProvider = configuredSecretProvider(),
): Promise<HealthcheckRun> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const rows = await sql.query<ConnectionRow>(
    `select id, workspace_id, provider, secret_ref, config
       from connections
      where id = $1 and workspace_id = $2 and deleted_at is null
      limit 1`,
    [input.connectionId, input.workspaceId],
  );
  const connection = rows[0];
  if (!connection) throw new Error("CONNECTION_NOT_FOUND");

  const adapter = adapterForProvider(connection.provider);
  const resolveSecret = createSecretResolver(secretProvider);
  const result = await adapter.healthcheck(
    {
      id: connection.id,
      provider: connection.provider,
      secretRef: connection.secret_ref ?? "",
      config: connection.config ?? {},
    },
    {
      workspaceId: input.workspaceId,
      connectionId: connection.id,
      traceId: input.traceId,
      getSecret: (name) => {
        if (name !== "api_key") throw new Error("SECRET_NAME_NOT_ALLOWED");
        return resolveSecret(connection.secret_ref ?? "", {
          workspaceId: input.workspaceId,
          connectionId: connection.id,
        });
      },
    },
  );

  await sql.query(
    `update connections
        set health_status = $2,
            health_error = $3,
            last_healthcheck_at = current_timestamp,
            updated_at = current_timestamp
      where id = $1 and workspace_id = $4 and deleted_at is null`,
    [connection.id, result.status, result.status === "healthy" ? null : result.message, input.workspaceId],
  );

  return { ...result, connectionId: connection.id, provider: connection.provider };
}
