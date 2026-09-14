import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { isMigrationFile, migrationName, pendingMigrations } from "./migration-plan.mjs";
import { projectRoot } from "./with-app-env.mjs";

const AUTH_MIGRATION = "0001_auth.sql";

/**
 * The auth-on copy of the Better Auth schema and its source, or null when the
 * app has not turned sign-in on (the shipped state).
 */
function authSchemaCopy(root) {
  const copy = join(root, "migrations", AUTH_MIGRATION);
  const source = join(root, "migrations/auth", AUTH_MIGRATION);
  if (!existsSync(copy) || !existsSync(source)) return null;
  return { copy: readFileSync(copy, "utf8"), source: readFileSync(source, "utf8") };
}

test("_migrations keys on basename, not path", () => {
  assert.equal(migrationName("/migrations/0002_todos.sql"), "0002_todos.sql");
  assert.equal(migrationName("migrations/auth/0001_auth.sql"), "0001_auth.sql");
  assert.equal(migrationName("0001_auth.sql"), "0001_auth.sql");
});

test("a file already applied from another directory does not re-apply", () => {
  // The auth-on path copies migrations/auth/0001_auth.sql into the globbed
  // directory; a database that already has it must not run it twice.
  assert.deepEqual(pendingMigrations(["/migrations/0001_auth.sql"], ["0001_auth.sql"]), []);
});

test("pending migrations are returned in name order", () => {
  assert.deepEqual(
    pendingMigrations(
      ["/migrations/0003_c.sql", "/migrations/0001_a.sql", "/migrations/0002_b.sql"],
      ["0001_a.sql"],
    ),
    [
      { name: "0002_b.sql", path: "/migrations/0002_b.sql" },
      { name: "0003_c.sql", path: "/migrations/0003_c.sql" },
    ],
  );
});

test("non-.sql entries are dropped (readdir also yields the auth/ directory)", () => {
  assert.equal(isMigrationFile("auth"), false);
  assert.deepEqual(pendingMigrations(["auth", "README.md"], []), []);
});

test("the auth schema stays nested while app migrations are discoverable", () => {
  const migrationsDir = join(projectRoot(), "migrations");
  assert.deepEqual(pendingMigrations(readdirSync(migrationsDir), []), [
    { name: "0002_multi_tenant_core.sql", path: "0002_multi_tenant_core.sql" },
    { name: "0003_connector_registry.sql", path: "0003_connector_registry.sql" },
    { name: "0004_messaging_dispatch.sql", path: "0004_messaging_dispatch.sql" },
    { name: "0005_webhook_security.sql", path: "0005_webhook_security.sql" },
      { name: "0006_webhook_delivery_states.sql", path: "0006_webhook_delivery_states.sql" },
      { name: "0007_agent_runtime_jobs.sql", path: "0007_agent_runtime_jobs.sql" },
      { name: "0008_conversation_handoff.sql", path: "0008_conversation_handoff.sql" },
      { name: "0009_agent_runtime_execution_logs.sql", path: "0009_agent_runtime_execution_logs.sql" },
      { name: "0010_workflow_core.sql", path: "0010_workflow_core.sql" },
      { name: "0011_workflow_triggers_events.sql", path: "0011_workflow_triggers_events.sql" },
      { name: "0012_workflow_queue_leases.sql", path: "0012_workflow_queue_leases.sql" },
      { name: "0013_tool_gateway.sql", path: "0013_tool_gateway.sql" },
      { name: "0014_workflow_scheduler.sql", path: "0014_workflow_scheduler.sql" },
      { name: "0015_internal_events.sql", path: "0015_internal_events.sql" },
      { name: "0016_workflow_wait_resume.sql", path: "0016_workflow_wait_resume.sql" },
      { name: "0017_meta_webhook_security.sql", path: "0017_meta_webhook_security.sql" },
      { name: "0018_agent_marketplace.sql", path: "0018_agent_marketplace.sql" },
      { name: "0019_agent_decision_protocol.sql", path: "0019_agent_decision_protocol.sql" },
      { name: "0020_knowledge_rag.sql", path: "0020_knowledge_rag.sql" },
      { name: "0021_crm_lead_tool.sql", path: "0021_crm_lead_tool.sql" },
      { name: "0022_lead_qualification_tool.sql", path: "0022_lead_qualification_tool.sql" },
      { name: "0023_product_qualification_policy.sql", path: "0023_product_qualification_policy.sql" },
      { name: "0024_lead_assignment_tool.sql", path: "0024_lead_assignment_tool.sql" },
      { name: "0025_lead_follow_up_tool.sql", path: "0025_lead_follow_up_tool.sql" },
      { name: "0026_nexo_learning_foundation.sql", path: "0026_nexo_learning_foundation.sql" },
      { name: "0027_nexo_learning_evaluations.sql", path: "0027_nexo_learning_evaluations.sql" },
      { name: "0028_nexo_learning_cases.sql", path: "0028_nexo_learning_cases.sql" },
      { name: "0029_agent_improvement_lab.sql", path: "0029_agent_improvement_lab.sql" },
      { name: "0030_tool_execution_domain.sql", path: "0030_tool_execution_domain.sql" },
      { name: "0031_agent_development_blueprints.sql", path: "0031_agent_development_blueprints.sql" },
      { name: "0032_native_conversation_tools.sql", path: "0032_native_conversation_tools.sql" },
      { name: "0033_calendar_availability.sql", path: "0033_calendar_availability.sql" },
      { name: "0034_workspace_onboarding.sql", path: "0034_workspace_onboarding.sql" },
      { name: "0035_workspace_integrations.sql", path: "0035_workspace_integrations.sql" },
      { name: "0036_calendar_booking.sql", path: "0036_calendar_booking.sql" },
      { name: "0037_marketplace_installation_revisions.sql", path: "0037_marketplace_installation_revisions.sql" },
      { name: "0038_agent_runtime_quotas.sql", path: "0038_agent_runtime_quotas.sql" },
      { name: "0039_native_commercial_tool_contracts.sql", path: "0039_native_commercial_tool_contracts.sql" },
      { name: "0040_nexo_bot_audit.sql", path: "0040_nexo_bot_audit.sql" },
      { name: "0041_workflow_error_handlers.sql", path: "0041_workflow_error_handlers.sql" },
      { name: "0042_nexo_agent_products.sql", path: "0042_nexo_agent_products.sql" },
      { name: "0043_agent_blueprint_evaluations.sql", path: "0043_agent_blueprint_evaluations.sql" },
      { name: "0044_agent_tool_proposals.sql", path: "0044_agent_tool_proposals.sql" },
      { name: "0045_agent_blueprint_workflows.sql", path: "0045_agent_blueprint_workflows.sql" },
      { name: "0046_agent_tool_proposal_reviews.sql", path: "0046_agent_tool_proposal_reviews.sql" },
      { name: "0047_agent_blueprint_evaluation_snapshots.sql", path: "0047_agent_blueprint_evaluation_snapshots.sql" },
      { name: "0048_workspace_integrity_guards.sql", path: "0048_workspace_integrity_guards.sql" },
      { name: "0049_nexo_bot_audit_trace.sql", path: "0049_nexo_bot_audit_trace.sql" },
      { name: "0050_agent_evaluation_harness.sql", path: "0050_agent_evaluation_harness.sql" },
      { name: "0051_promotion_hardening.sql", path: "0051_promotion_hardening.sql" },
      { name: "0052_whatsapp_safety_limits.sql", path: "0052_whatsapp_safety_limits.sql" },
      { name: "0053_meta_social_connectors.sql", path: "0053_meta_social_connectors.sql" },
    ]);
  assert.ok(readdirSync(join(migrationsDir, "auth")).includes("0001_auth.sql"));
});

test("this workspace's auth schema copy is byte-identical to its source", () => {
  // An edited copy diverges silently: basename keying skips it on a database
  // that already ran the original, and applies it on a fresh PGLite preview.
  const pair = authSchemaCopy(projectRoot());
  if (pair === null) return; // sign-in off — nothing has been copied up
  assert.equal(
    pair.copy,
    pair.source,
    "migrations/0001_auth.sql has been edited — it must stay a verbatim copy of migrations/auth/0001_auth.sql",
  );
});

test("the copy check reads both files and catches an edit", () => {
  const root = mkdtempSync(join(tmpdir(), "auth-schema-"));
  mkdirSync(join(root, "migrations/auth"), { recursive: true });
  writeFileSync(join(root, "migrations/auth", AUTH_MIGRATION), "create table t ();\n");
  assert.equal(authSchemaCopy(root), null);

  writeFileSync(join(root, "migrations", AUTH_MIGRATION), "create table t ();\n");
  const same = authSchemaCopy(root);
  assert.equal(same.copy, same.source);

  writeFileSync(join(root, "migrations", AUTH_MIGRATION), "create table t (x int);\n");
  const drifted = authSchemaCopy(root);
  assert.notEqual(drifted.copy, drifted.source);
});
