/**
 * Local email/password sign-in backed by this app's Better Auth database.
 *
 * Production uses the same Postgres database as application data. The deployer
 * must still provide VITE_AUTH_ENABLED=true, BETTER_AUTH_URL and
 * BETTER_AUTH_SECRET; this flag only enables the Better Auth provider.
 */
export const emailAndPasswordEnabled = true;
