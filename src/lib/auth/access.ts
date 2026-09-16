export type AuthAccessState = "pending" | "anonymous" | "authenticated";

export function resolveAuthAccess(input: {
  isPending: boolean;
  hasUser: boolean;
}): AuthAccessState {
  if (input.isPending) return "pending";
  return input.hasUser ? "authenticated" : "anonymous";
}

export function canUseWorkspaceAction(input: {
  access: AuthAccessState;
  workspaceId: string | null;
  backendReady: boolean;
}): boolean {
  return input.access === "authenticated" && Boolean(input.workspaceId) && input.backendReady;
}
