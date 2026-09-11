import {
  CreateSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

export type SecretScope = {
  workspaceId: string;
  connectionId: string;
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
      const expectedPrefix = `nexo/${scope.workspaceId}/${scope.connectionId}/`;
      if (!secretRef.startsWith(expectedPrefix)) {
        throw new SecretResolverError("SECRET_SCOPE_INVALID", "Secret reference is outside the connection scope");
      }
      const envName = localSecretEnvironment[secretRef.slice(expectedPrefix.length)];
      const value = envName ? process.env[envName]?.trim() : undefined;
      if (!value) {
        throw new SecretResolverError("SECRET_NOT_FOUND", "Local development secret was not configured");
      }
      return value;
    },
  };
}

export function configuredSecretProvider(): SecretProvider {
  if (process.env.NEXO_SECRETS_BACKEND === "local") {
    return localDevelopmentSecretProvider();
  }
  if (process.env.NEXO_SECRETS_BACKEND === "aws" && process.env.AWS_REGION) {
    return awsSecretsManagerProvider({ region: process.env.AWS_REGION });
  }
  return unavailableSecretProvider();
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
      const expectedPrefix = `${namespace}/${scope.workspaceId}/${scope.connectionId}/`;
      if (!secretRef.startsWith(expectedPrefix)) {
        throw new SecretResolverError("SECRET_SCOPE_INVALID", "Secret reference is outside the connection scope");
      }
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
      const expectedPrefix = `${namespace}/${scope.workspaceId}/${scope.connectionId}/`;
      if (!secretRef.startsWith(expectedPrefix)) {
        throw new SecretResolverError("SECRET_SCOPE_INVALID", "Secret reference is outside the connection scope");
      }
      if (!value.trim()) {
        throw new SecretResolverError("SECRET_NOT_FOUND", "Cannot provision an empty secret");
      }
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
