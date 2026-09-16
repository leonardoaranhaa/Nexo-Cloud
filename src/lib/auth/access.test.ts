import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canUseWorkspaceAction, resolveAuthAccess } from "./access.ts";

describe("auth access lifecycle", () => {
  it("keeps the session pending until the auth check resolves", () => {
    assert.equal(resolveAuthAccess({ isPending: true, hasUser: false }), "pending");
    assert.equal(resolveAuthAccess({ isPending: true, hasUser: true }), "pending");
  });

  it("distinguishes anonymous exploration from an authenticated session", () => {
    assert.equal(resolveAuthAccess({ isPending: false, hasUser: false }), "anonymous");
    assert.equal(resolveAuthAccess({ isPending: false, hasUser: true }), "authenticated");
  });

  it("allows workspace actions only with an authenticated, ready context", () => {
    assert.equal(canUseWorkspaceAction({ access: "pending", workspaceId: "ws-1", backendReady: true }), false);
    assert.equal(canUseWorkspaceAction({ access: "anonymous", workspaceId: "ws-1", backendReady: true }), false);
    assert.equal(canUseWorkspaceAction({ access: "authenticated", workspaceId: null, backendReady: true }), false);
    assert.equal(canUseWorkspaceAction({ access: "authenticated", workspaceId: "ws-1", backendReady: false }), false);
    assert.equal(canUseWorkspaceAction({ access: "authenticated", workspaceId: "ws-1", backendReady: true }), true);
  });
});
