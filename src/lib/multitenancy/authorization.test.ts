import test from "node:test";
import assert from "node:assert/strict";
import { can } from "./server.ts";

test("workspace admin has all workspace permissions", () => {
  assert.equal(can("workspace_admin", "read"), true);
  assert.equal(can("workspace_admin", "write"), true);
  assert.equal(can("workspace_admin", "publish"), true);
  assert.equal(can("workspace_admin", "manage"), true);
});

test("builder can edit but cannot manage workspace", () => {
  assert.equal(can("builder", "read"), true);
  assert.equal(can("builder", "write"), true);
  assert.equal(can("builder", "publish"), true);
  assert.equal(can("builder", "manage"), false);
});

test("operator can publish but cannot edit agent configuration", () => {
  assert.equal(can("operator", "read"), true);
  assert.equal(can("operator", "write"), false);
  assert.equal(can("operator", "publish"), true);
  assert.equal(can("operator", "manage"), false);
});

test("analyst and viewer are read-only", () => {
  for (const role of ["analyst", "viewer"] as const) {
    assert.equal(can(role, "read"), true);
    assert.equal(can(role, "write"), false);
    assert.equal(can(role, "publish"), false);
    assert.equal(can(role, "manage"), false);
  }
});

test("organization owner and admin inherit full workspace permissions", () => {
  for (const role of ["owner", "admin"] as const) {
    assert.equal(can(role, "read"), true);
    assert.equal(can(role, "write"), true);
    assert.equal(can(role, "publish"), true);
    assert.equal(can(role, "manage"), true);
  }
});
