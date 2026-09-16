const LOCAL_DEV_ORIGINS = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://[::1]:8080",
] as const;

function toHttpsOrigin(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;
  if (candidate.includes("*") || candidate.includes("?")) return null;
  const withProtocol = candidate.includes("://") ? candidate : `https://${candidate}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Build the exact origins accepted by Better Auth credential endpoints.
 *
 * Vercel exposes deployment, branch, and production aliases as host-only
 * variables. They must be converted to origins before being passed to
 * Better Auth; otherwise a production deployment-specific URL is rejected by
 * the CSRF origin check even when BETTER_AUTH_URL points to the permanent
 * domain. Only provider-supplied exact hosts are accepted — no broad
 * `*.vercel.app` wildcard is introduced.
 */
export function buildTrustedOrigins(input: {
  explicitBaseURL?: string;
  vercelHosts?: Array<string | undefined>;
}): string[] {
  const origins = new Set<string>();
  const explicit = toHttpsOrigin(input.explicitBaseURL);
  if (explicit) origins.add(explicit);
  for (const host of input.vercelHosts ?? []) {
    const origin = toHttpsOrigin(host);
    if (origin) origins.add(origin);
  }
  for (const origin of LOCAL_DEV_ORIGINS) origins.add(origin);
  return [...origins];
}

export { LOCAL_DEV_ORIGINS };
