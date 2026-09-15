import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";

/**
 * Mount Better Auth's complete HTTP API at /api/auth/*.
 *
 * The client SDK calls endpoints such as /sign-up/email and /get-session;
 * forwarding both methods to the server-side handler also preserves the
 * Set-Cookie headers installed by tanstackStartCookies().
 */
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => auth.handler(request),
      POST: ({ request }: { request: Request }) => auth.handler(request),
    },
  },
});
