import { randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";
import { requireWorkspaceAccess } from "../multitenancy/server.ts";

const eligibleRoles = ["workspace_admin", "builder", "operator"];
const terminalStages = new Set(["converted", "lost"]);

export type AssignmentInput = { workspaceId: string; externalContactId: string; conversationId?: string; ownerId?: string; productId?: string; idempotencyKey: string; traceId?: string };
export type AssignmentResult = { assigned: boolean; idempotent: boolean; leadId: string; ownerId?: string; method: "round_robin" | "least_loaded" | "manual" | "no_capacity"; reason: string };

function clean(value: unknown, max = 160): string | undefined { return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined; }

export async function createAssignmentRule(sql: Sql, userId: string, input: { workspaceId: string; productId?: string; name: string; mode?: "round_robin" | "least_loaded"; ownerIds?: string[] }): Promise<{ id: string }> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const ownerIds = [...new Set((input.ownerIds ?? []).map((owner) => clean(owner)).filter((owner): owner is string => Boolean(owner)))].slice(0, 100);
  if (input.productId) {
    const product = await sql<{ id: string }>`select id from agent_products where id = ${input.productId} and status = 'published' limit 1`;
    if (!product[0]) throw new Error("ASSIGNMENT_PRODUCT_NOT_FOUND");
  }
  const id = randomUUID();
  await sql.query(`insert into crm_assignment_rules (id, workspace_id, product_id, name, mode, owner_ids, created_by) values ($1,$2,$3,$4,$5,$6::jsonb,$7)`, [id, input.workspaceId, input.productId ?? null, clean(input.name, 160) ?? "Distribuição comercial", input.mode ?? "round_robin", JSON.stringify(ownerIds), userId]);
  return { id };
}

export async function publishAssignmentRule(sql: Sql, userId: string, input: { workspaceId: string; ruleId: string }): Promise<void> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "publish");
  const rule = await sql<{ id: string; product_id: string | null }>`select id, product_id from crm_assignment_rules where id = ${input.ruleId} and workspace_id = ${input.workspaceId} and status = 'draft' limit 1`;
  if (!rule[0]) throw new Error("ASSIGNMENT_RULE_NOT_FOUND");
  await sql.query(`update crm_assignment_rules set status = 'retired' where workspace_id = $1 and product_id is not distinct from $2 and status = 'published'`, [input.workspaceId, rule[0].product_id]);
  await sql.query(`update crm_assignment_rules set status = 'published', published_at = current_timestamp where id = $1 and workspace_id = $2`, [input.ruleId, input.workspaceId]);
}

async function eligibleOwners(sql: Sql, workspaceId: string, configured: string[]): Promise<string[]> {
  const rows = await sql.query<{ user_id: string }>(`select distinct wm.user_id from workspace_memberships wm left join organization_memberships om on om.user_id = wm.user_id join workspaces w on w.id = wm.workspace_id where wm.workspace_id = $1 and w.status = 'active' and (wm.role = any($2) or om.role in ('owner','admin'))`, [workspaceId, eligibleRoles]);
  const eligible = rows.map((row) => row.user_id).sort();
  return configured.length ? eligible.filter((owner) => configured.includes(owner)) : eligible;
}

export async function assignLeadOwner(sql: Sql, userId: string | null, input: AssignmentInput): Promise<AssignmentResult> {
  if (userId) await requireWorkspaceAccess(sql, userId, input.workspaceId, "operate");
  const contact = clean(input.externalContactId);
  const idempotencyKey = clean(input.idempotencyKey);
  if (!contact) throw new Error("ASSIGNMENT_CONTACT_REQUIRED");
  if (!idempotencyKey) throw new Error("ASSIGNMENT_IDEMPOTENCY_REQUIRED");
  const duplicate = await sql<{ lead_id: string; owner_id: string | null; method: AssignmentResult["method"]; reason: string | null }>`select lead_id, owner_id, method, reason from crm_lead_assignments where workspace_id = ${input.workspaceId} and idempotency_key = ${idempotencyKey} limit 1`;
  if (duplicate[0]) return { assigned: Boolean(duplicate[0].owner_id), idempotent: true, leadId: duplicate[0].lead_id, ownerId: duplicate[0].owner_id ?? undefined, method: duplicate[0].method, reason: duplicate[0].reason ?? "already_processed" };
  const lead = await sql<{ id: string; stage: string; owner_id: string | null }>`select id, stage, owner_id from crm_leads where workspace_id = ${input.workspaceId} and external_contact_id = ${contact} limit 1`;
  if (!lead[0]) throw new Error("LEAD_NOT_FOUND");
  if (lead[0].stage !== "qualified") return { assigned: false, idempotent: false, leadId: lead[0].id, ownerId: lead[0].owner_id ?? undefined, method: "no_capacity", reason: terminalStages.has(lead[0].stage) ? "lead_terminal" : "lead_not_qualified" };
  if (lead[0].owner_id && !input.ownerId) return { assigned: true, idempotent: false, leadId: lead[0].id, ownerId: lead[0].owner_id, method: "manual", reason: "already_assigned" };
  const rules = await sql<{ id: string; mode: AssignmentResult["method"]; owner_ids: string[] }>`select id, mode, owner_ids from crm_assignment_rules where workspace_id = ${input.workspaceId} and product_id is not distinct from ${input.productId ?? null} and status = 'published' order by created_at desc limit 1`;
  const configured = Array.isArray(rules[0]?.owner_ids) ? rules[0].owner_ids : [];
  const owners = await eligibleOwners(sql, input.workspaceId, configured);
  if (input.ownerId && !owners.includes(input.ownerId)) throw new Error("ASSIGNMENT_OWNER_NOT_ELIGIBLE");
  let automaticOwner: string | undefined;
  if (owners.length) {
    if (rules[0]?.mode === "least_loaded") {
      const counts = await sql.query<{ owner_id: string; total: number }>(`select owner_id, count(*)::int as total from crm_lead_assignments where workspace_id = $1 and owner_id = any($2) group by owner_id`, [input.workspaceId, owners]);
      const byOwner = new Map(counts.map((row) => [row.owner_id, Number(row.total)]));
      automaticOwner = [...owners].sort((a, b) => (byOwner.get(a) ?? 0) - (byOwner.get(b) ?? 0) || a.localeCompare(b))[0];
    } else {
      const counts = await sql.query<{ total: number }>(`select count(*)::int as total from crm_lead_assignments where workspace_id = $1 and owner_id = any($2)`, [input.workspaceId, owners]);
      automaticOwner = owners[Number(counts[0]?.total ?? 0) % owners.length];
    }
  }
  const selected = input.ownerId ?? automaticOwner;
  if (!selected) {
    await sql.query(`insert into crm_lead_assignments (id, workspace_id, lead_id, conversation_id, previous_owner_id, owner_id, method, idempotency_key, trace_id, reason) values ($1,$2,$3,$4,$5,null,'no_capacity',$6,$7,'no_eligible_owner')`, [randomUUID(), input.workspaceId, lead[0].id, input.conversationId ?? null, lead[0].owner_id, idempotencyKey, input.traceId ?? null]);
    return { assigned: false, idempotent: false, leadId: lead[0].id, method: "no_capacity", reason: "no_eligible_owner" };
  }
  const method = input.ownerId ? "manual" : (rules[0]?.mode === "least_loaded" ? "least_loaded" : "round_robin");
  await sql.query(`update crm_leads set owner_id = $1, updated_at = current_timestamp where id = $2 and workspace_id = $3`, [selected, lead[0].id, input.workspaceId]);
  if (input.conversationId) await sql.query(`update conversations set assigned_to = $1, updated_at = current_timestamp where id = $2 and workspace_id = $3`, [selected, input.conversationId, input.workspaceId]);
  await sql.query(`insert into crm_lead_assignments (id, workspace_id, lead_id, conversation_id, previous_owner_id, owner_id, method, idempotency_key, trace_id, reason) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'qualified_lead')`, [randomUUID(), input.workspaceId, lead[0].id, input.conversationId ?? null, lead[0].owner_id, selected, method, idempotencyKey, input.traceId ?? null]);
  return { assigned: true, idempotent: false, leadId: lead[0].id, ownerId: selected, method, reason: "qualified_lead" };
}

export async function executeLeadAssignOwner(sql: Sql, userId: string | null, input: AssignmentInput & { requestedBy?: "model" | "system" | "user" }): Promise<AssignmentResult> {
  const tool = await sql<{ id: string }>`select id from tools where workspace_id is null and key = 'lead.assign_owner' and status = 'active' order by version desc limit 1`;
  if (!tool[0]) throw new Error("TOOL_NOT_FOUND");
  const executionId = randomUUID(); const started = Date.now();
  await sql.query(`insert into tool_executions (id, workspace_id, tool_id, requested_by, status, input_hash, input_redacted, started_at) values ($1,$2,$3,$4,'running',$5,$6::jsonb,current_timestamp)`, [executionId, input.workspaceId, tool[0].id, input.requestedBy ?? "system", `assignment:${input.idempotencyKey}`, JSON.stringify({ externalContactId: input.externalContactId, ownerId: input.ownerId, productId: input.productId })]);
  try {
    const result = await assignLeadOwner(sql, userId, input);
    await sql.query(`update tool_executions set status = 'succeeded', output_redacted = $1::jsonb, latency_ms = $2, finished_at = current_timestamp where id = $3`, [JSON.stringify(result), Date.now() - started, executionId]);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "ASSIGNMENT_TOOL_FAILED";
    await sql.query(`update tool_executions set status = 'failed', error_code = $1, error_message = $2, latency_ms = $3, finished_at = current_timestamp where id = $4`, [message.slice(0, 120), message.slice(0, 500), Date.now() - started, executionId]);
    throw error;
  }
}
