import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import {
  CreateSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import type { Sql } from "../db.ts";

export type SecretScope = {
  workspaceId: string;
  connectionId: string;
  actorId?: string;
};

export type SecretProvider = {
  resolve(secretRef: string, scope: SecretScope): Promise<string>;
};

export type SecretProvisioner = {
  put(secretRef: string, value: string, scope: SecretScope): Promise<void>;
};

export class SecretResolverError extends Error {
  readonly code:
    | "SECRET_REF_MISSING"
    | "SECRET_SCOPE_INVALID"
    | "SECRET_PROVIDER_UNAVAILABLE"
    | "SECRET_NOT_FOUND";

  constructor(code: SecretResolverError["code"], message: string) {
    super(message);
    this.name = "SecretResolverError";
    this.code = code;
  }
}

function validateSecretRef(secretRef: string, scope: SecretScope): void {
  if (!secretRef.trim()) {
    throw new SecretResolverError("SECRET_REF_MISSING", "Connection has no secret reference");
  }
  if (!scope.workspaceId.trim() || !scope.connectionId.trim()) {
    throw new SecretResolverError("SECRET_SCOPE_INVALID", "Secret scope is incomplete");
  }
}

function validateScopedRef(secretRef: string, scope: SecretScope, namespace = "nexo"): void {
  validateSecretRef(secretRef, scope);
  const expectedPrefix = `${namespace}/${scope.workspaceId}/${scope.connectionId}/`;
  if (!secretRef.startsWith(expectedPrefix)) {
    throw new SecretResolverError("SECRET_SCOPE_INVALID", "Secret reference is outside the connection scope");
  }
}

function validateSecretValue(value: string): void {
  if (!value.trim()) {
    throw new SecretResolverError("SECRET_NOT_FOUND", "Cannot provision an empty secret");
  }
  if (value.length > 16_000) {
    throw new SecretResolverError("SECRET_SCOPE_INVALID", "Secret value exceeds the allowed size");
  }
}

export function createSecretResolver(provider: SecretProvider) {
  return async function resolveSecret(secretRef: string, scope: SecretScope): Promise<string> {
    validateSecretRef(secretRef, scope);
    const value = await provider.resolve(secretRef, scope);
    if (!value.trim()) {
      throw new SecretResolverError("SECRET_NOT_FOUND", "Secret provider returned an empty secret");
    }
    return value;
  };
}

export function unavailableSecretProvider(): SecretProvider {
  return {
    async resolve(): Promise<string> {
      throw new SecretResolverError(
        "SECRET_PROVIDER_UNAVAILABLE",
        "No server-side secret provider is configured",
      );
    },
  };
}

export function unavailableSecretProvisioner(): SecretProvisioner {
  return {
    async put(): Promise<void> {
      throw new SecretResolverError(
        "SECRET_PROVIDER_UNAVAILABLE",
        "No server-side secret provisioner is configured",
      );
    },
  };
}

const localSecretEnvironment: Readonly<Record<string, string>> = {
  api_key: "META_ACCESS_TOKEN",
  meta_app_secret: "META_APP_SECRET",
  meta_verify_token: "META_VERIFY_TOKEN",
  webhook_jwt: "EVOLUTION_WEBHOOK_JWT",
};

/**
 * Development-only provider backed by process.env. It deliberately supports
 * reads only: local credentials must be edited in .env and are never written
 * by an application request or returned to the browser.
 */
export function localDevelopmentSecretProvider(): SecretProvider {
  if (process.env.NODE_ENV !== "development") {
    throw new SecretResolverError(
      "SECRET_PROVIDER_UNAVAILABLE",
      "Local secret provider is available only in development",
    );
  }
  return {
    async resolve(secretRef: string, scope: SecretScope): Promise<string> {
      validateScopedRef(secretRef, scope);
      const envName = localSecretEnvironment[secretRef.slice(`nexo/${scope.workspaceId}/${scope.connectionId}/`.length)];
      const value = envName ? process.env[envName]?.trim() : undefined;
      if (!value) {
        throw new SecretResolverError("SECRET_NOT_FOUND", "Local development secret was not configured");
      }
      return value;
    },
  };
}

function encryptionKey(): Buffer {
  const dedicatedKey = process.env.NEXO_SECRETS_ENCRYPTION_KEY?.trim();
  const configured = dedicatedKey || process.env.BETTER_AUTH_SECRET?.trim();
  if (process.env.NODE_ENV === "production" && (!dedicatedKey || dedicatedKey.length < 32)) {
    throw new SecretResolverError(
      "SECRET_PROVIDER_UNAVAILABLE",
      "A dedicated NEXO_SECRETS_ENCRYPTION_KEY with at least 32 characters is required in production",
    );
  }
  if (!configured) {
    throw new SecretResolverError(
      "SECRET_PROVIDER_UNAVAILABLE",
      "NEXO_SECRETS_ENCRYPTION_KEY or BETTER_AUTH_SECRET is required",
    );
  }
  // Hashing supports both a dedicated arbitrary-length deployment secret and
  // the existing Better Auth secret while always producing a 256-bit key.
  return createHash("sha256").update(configured, "utf8").digest();
}

function associatedData(secretRef: string, scope: SecretScope): Buffer {
  return Buffer.from(`${scope.workspaceId}:${scope.connectionId}:${secretRef}`, "utf8");
}

function encryptSecret(value: string, secretRef: string, scope: SecretScope) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  cipher.setAAD(associatedData(secretRef, scope));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

function decryptSecret(
  row: { ciphertext: string; nonce: string; auth_tag: string },
  secretRef: string,
  scope: SecretScope,
): string {
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(row.nonce, "base64"));
    decipher.setAAD(associatedData(secretRef, scope));
    decipher.setAuthTag(Buffer.from(row.auth_tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(row.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new SecretResolverError("SECRET_PROVIDER_UNAVAILABLE", "Stored secret could not be decrypted");
  }
}

/**
 * Database-backed secret provider for hosted deployments without AWS. The
 * database stores only encrypted material; plaintext exists only in this
 * server process for the duration of a provider call.
 */
export function databaseSecretProvider(sql: Sql): SecretProvider {
  return {
    async resolve(secretRef: string, scope: SecretScope): Promise<string> {
      validateScopedRef(secretRef, scope);
      const rows = await sql.query<{ workspace_id: string; connection_id: string; ciphertext: string; nonce: string; auth_tag: string }>(
        `select workspace_id, connection_id, ciphertext, nonce, auth_tag
           from nexo_secret_values
          where secret_ref = $1
          limit 1`,
        [secretRef],
      );
      const row = rows[0];
      if (!row) throw new SecretResolverError("SECRET_NOT_FOUND", "Secret reference was not found");
      if (row.workspace_id !== scope.workspaceId || row.connection_id !== scope.connectionId) {
        throw new SecretResolverError("SECRET_SCOPE_INVALID", "Secret reference is outside the connection scope");
      }
      const value = decryptSecret(row, secretRef, scope);
      validateSecretValue(value);
      return value;
    },
  };
}

export function databaseSecretProvisioner(sql: Sql): SecretProvisioner {
  return {
    async put(secretRef: string, value: string, scope: SecretScope): Promise<void> {
      validateScopedRef(secretRef, scope);
      validateSecretValue(value);
      const existing = await sql.query<{ workspace_id: string; connection_id: string }>(
        `select workspace_id, connection_id from nexo_secret_values where secret_ref = $1 limit 1`,
        [secretRef],
      );
      if (existing[0] && (existing[0].workspace_id !== scope.workspaceId || existing[0].connection_id !== scope.connectionId)) {
        throw new SecretResolverError("SECRET_SCOPE_INVALID", "Secret reference belongs to another connection");
      }
      const encrypted = encryptSecret(value, secretRef, scope);
      await sql.query(
        `insert into nexo_secret_values
          (secret_ref, workspace_id, connection_id, ciphertext, nonce, auth_tag, key_version, created_by, updated_by)
         values ($1, $2, $3, $4, $5, $6, 'v1', $7, $7)
         on conflict (secret_ref) do update set
           ciphertext = excluded.ciphertext,
           nonce = excluded.nonce,
           auth_tag = excluded.auth_tag,
           key_version = excluded.key_version,
           updated_by = excluded.updated_by,
           updated_at = current_timestamp`,
        [secretRef, scope.workspaceId, scope.connectionId, encrypted.ciphertext, encrypted.nonce, encrypted.authTag, scope.actorId ?? null],
      );
    },
  };
}

export function configuredSecretProvider(sql?: Sql): SecretProvider {
  if (process.env.NEXO_SECRETS_BACKEND === "local") {
    return localDevelopmentSecretProvider();
  }
  if (process.env.NEXO_SECRETS_BACKEND === "aws" && process.env.AWS_REGION) {
    return awsSecretsManagerProvider({ region: process.env.AWS_REGION });
  }
  if (sql) return databaseSecretProvider(sql);
  return unavailableSecretProvider();
}

export function configuredSecretProvisioner(sql?: Sql): SecretProvisioner {
  if (process.env.NEXO_SECRETS_BACKEND === "local") return unavailableSecretProvisioner();
  if (process.env.NEXO_SECRETS_BACKEND === "aws" && process.env.AWS_REGION) {
    return awsSecretsManagerProvisioner({ region: process.env.AWS_REGION });
  }
  if (sql) return databaseSecretProvisioner(sql);
  return unavailableSecretProvisioner();
}

export function awsSecretsManagerProvider(options: {
  region: string;
  namespace?: string;
  client?: SecretsManagerClient;
}): SecretProvider {
  const client = options.client ?? new SecretsManagerClient({ region: options.region });
  const namespace = options.namespace ?? "nexo";
  return {
    async resolve(secretRef: string, scope: SecretScope): Promise<string> {
      validateScopedRef(secretRef, scope, namespace);
      try {
        const result = await client.send(new GetSecretValueCommand({ SecretId: secretRef }));
        if (!result.SecretString?.trim()) {
          throw new SecretResolverError("SECRET_NOT_FOUND", "AWS secret has no SecretString value");
        }
        return result.SecretString;
      } catch (error) {
        if (error instanceof SecretResolverError) throw error;
        throw new SecretResolverError("SECRET_PROVIDER_UNAVAILABLE", "AWS Secrets Manager could not resolve the secret");
      }
    },
  };
}

export function awsSecretsManagerProvisioner(options: {
  region: string;
  namespace?: string;
  client?: SecretsManagerClient;
}): SecretProvisioner {
  const client = options.client ?? new SecretsManagerClient({ region: options.region });
  const namespace = options.namespace ?? "nexo";
  return {
    async put(secretRef: string, value: string, scope: SecretScope): Promise<void> {
      validateScopedRef(secretRef, scope, namespace);
      validateSecretValue(value);
      try {
        await client.send(new CreateSecretCommand({
          Name: secretRef,
          SecretString: value,
          Tags: [
            { Key: "nexo:workspace-id", Value: scope.workspaceId },
            { Key: "nexo:connection-id", Value: scope.connectionId },
          ],
        }));
      } catch {
        await client.send(new PutSecretValueCommand({ SecretId: secretRef, SecretString: value }));
      }
    },
  };
}

export function memorySecretProvider(
  secrets: ReadonlyMap<string, string>,
): SecretProvider {
  return {
    async resolve(secretRef: string): Promise<string> {
      const value = secrets.get(secretRef);
      if (!value) {
        throw new SecretResolverError("SECRET_NOT_FOUND", "Secret reference was not found");
      }
      return value;
    },
  };
}
