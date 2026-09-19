import assert from "node:assert/strict";
import test from "node:test";
import { workspaceNeedsOnboarding } from "./workspace-context.ts";

type WorkspaceState = { onboardingCompleted: boolean };

function contextAfterReload(workspace: WorkspaceState) {
  return {
    activeWorkspace: workspace,
    isFirstWorkspace: workspaceNeedsOnboarding(workspace),
  };
}

test("first-login workspace requires onboarding", () => {
  const context = contextAfterReload({ onboardingCompleted: false });
  assert.equal(context.isFirstWorkspace, true);
});

test("an incomplete existing workspace reopens onboarding after reload", () => {
  const context = contextAfterReload({ onboardingCompleted: false });
  assert.equal(context.activeWorkspace.onboardingCompleted, false);
  assert.equal(context.isFirstWorkspace, true);
});

test("completed workspace does not reopen onboarding after re-entry", () => {
  const context = contextAfterReload({ onboardingCompleted: true });
  assert.equal(context.isFirstWorkspace, false);
});

test("missing workspace does not prompt onboarding", () => {
  assert.equal(workspaceNeedsOnboarding(null), false);
  assert.equal(workspaceNeedsOnboarding(undefined), false);
});
