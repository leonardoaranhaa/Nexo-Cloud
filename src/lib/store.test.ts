import assert from "node:assert/strict";
import test from "node:test";
import { useNexo } from "./store.ts";

test("workspace context change clears tenant-local inbox, events and trace", () => {
  const workspace = { id: "ws", organizationId: "org", organizationName: "Org", name: "Workspace", slug: "ws", environment: "development" as const, role: "workspace_admin", onboardingCompleted: true, onboardingGoal: null, onboardingTeamSize: null };
  const other = { ...workspace, id: "other", name: "Other", slug: "other" };
  useNexo.getState().setWorkspaceContext(workspace, [workspace, other]);
  useNexo.getState().pushMessage("agent", { role: "user", content: "tenant secret" });
  useNexo.getState().log("agent", "tenant event");
  useNexo.getState().setTrace("agent", [{ nodeId: "agent", status: "ok", detail: "step" }]);
  useNexo.getState().setWorkspaceContext(other, [workspace, other]);
  const state = useNexo.getState();
  assert.deepEqual(state.inbox, {});
  assert.deepEqual(state.events, []);
  assert.equal(state.activeTrace, null);
});
