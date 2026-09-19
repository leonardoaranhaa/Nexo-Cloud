import type { WorkspaceRecord } from "./server";

/**
 * The onboarding prompt is driven by persisted workspace state, not by whether
 * this request happened to create the workspace. This keeps a partially
 * onboarded workspace recoverable after reload, sign-out/sign-in, or a failed
 * completion attempt.
 */
export function workspaceNeedsOnboarding(
  workspace: Pick<WorkspaceRecord, "onboardingCompleted"> | null | undefined,
): boolean {
  return Boolean(workspace && !workspace.onboardingCompleted);
}
