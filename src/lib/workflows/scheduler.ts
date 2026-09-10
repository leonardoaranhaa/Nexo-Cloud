import { randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";
import type { JsonObject } from "../multitenancy/server.ts";

function object(value: unknown): JsonObject { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}; }
function fields(expression: string): string[] { const parts = expression.trim().split(/\s+/); if (parts.length !== 5) throw new Error("CRON_REQUIRES_FIVE_FIELDS"); return parts; }
function matches(value: number, expression: string, min: number, max: number): boolean {
  return expression.split(",").some((part) => {
    const [range, stepText] = part.split("/"); const step = stepText ? Number(stepText) : 1;
    if (!Number.isInteger(step) || step < 1) return false;
    const [startText, endText] = range === "*" ? [String(min), String(max)] : range.split("-");
    const start = Number(startText); const end = endText === undefined ? start : Number(endText);
    return Number.isInteger(start) && Number.isInteger(end) && start >= min && end <= max && value >= start && value <= end && (value - start) % step === 0;
  });
}
export function validateCron(expression: string): void { fields(expression).forEach((part, index) => { const limits: [number, number] = index === 0 ? [0, 59] : index === 1 ? [0, 23] : index === 2 ? [1, 31] : index === 3 ? [1, 12] : [0, 6]; if (!part || !part.split(",").every((item) => /^\*|\*\/\d+$|\d+(?:-\d+)?(?:\/\d+)?$/.test(item))) throw new Error("CRON_FIELD_INVALID"); if (!limits) throw new Error("CRON_FIELD_INVALID"); }); }
export function nextCronOccurrence(expression: string, from: Date): Date {
  validateCron(expression); const parts = fields(expression); const cursor = new Date(from); cursor.setUTCSeconds(0, 0); cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  for (let i = 0; i < 366 * 24 * 60; i += 1) {
    if (matches(cursor.getUTCMinutes(), parts[0], 0, 59) && matches(cursor.getUTCHours(), parts[1], 0, 23) && matches(cursor.getUTCDate(), parts[2], 1, 31) && matches(cursor.getUTCMonth() + 1, parts[3], 1, 12) && matches(cursor.getUTCDay(), parts[4], 0, 6)) return cursor;
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  throw new Error("CRON_NEXT_OCCURRENCE_NOT_FOUND");
}

type DueTrigger = { id: string; workflow_id: string; workspace_id: string; version_id: string; config: unknown; next_run_at: string };
export async function pollScheduledWorkflows(sql: Sql, workerId: string, now = new Date(), limit = 20): Promise<{ claimed: number; enqueued: string[] }> {
  const nowIso = now.toISOString();
  const due = await sql.query<DueTrigger>(`with candidates as (select t.id from workflow_triggers t join workflows w on w.id = t.workflow_id and w.status = 'active' and w.deleted_at is null join lateral (select id from workflow_versions where workflow_id = w.id and status = 'published' order by version_number desc limit 1) v on true where t.type = 'schedule' and t.enabled = true and t.next_run_at <= $1 and (t.schedule_lease_until is null or t.schedule_lease_until < $1) order by t.next_run_at limit $2 for update skip locked) update workflow_triggers t set schedule_claimed_by = $3, schedule_lease_until = $1::timestamptz + interval '60 seconds' from candidates c where t.id = c.id returning t.id, t.workflow_id, (select workspace_id from workflows where id = t.workflow_id) as workspace_id, (select id from workflow_versions where workflow_id = t.workflow_id and status = 'published' order by version_number desc limit 1) as version_id, t.config, t.next_run_at`, [nowIso, Math.min(Math.max(limit, 1), 100), workerId]);
  const enqueued: string[] = [];
  for (const trigger of due) {
    try {
      const config = object(trigger.config); const cron = typeof config.cronExpression === "string" ? config.cronExpression : ""; const next = nextCronOccurrence(cron, now);
      const idempotencyKey = `schedule:${trigger.id}:${trigger.next_run_at}`;
      const runId = randomUUID();
      const input = object(config.input);
      const inserted = await sql.query<{ id: string }>(`insert into workflow_runs (id, workspace_id, workflow_id, workflow_version_id, trigger_id, status, input, correlation_id, idempotency_key) values ($1,$2,$3,$4,$5,'queued',$6::jsonb,$7,$8) on conflict (workspace_id, idempotency_key) do nothing returning id`, [runId, trigger.workspace_id, trigger.workflow_id, trigger.version_id, trigger.id, JSON.stringify(input), randomUUID(), idempotencyKey]);
      if (inserted[0]) enqueued.push(inserted[0].id);
      await sql.query(`update workflow_triggers set next_run_at = $1, last_fired_at = $2, schedule_claimed_by = null, schedule_lease_until = null, last_received_at = $2, updated_at = current_timestamp where id = $3 and schedule_claimed_by = $4`, [next.toISOString(), nowIso, trigger.id, workerId]);
    } catch (error) {
      await sql.query(`update workflow_triggers set schedule_claimed_by = null, schedule_lease_until = null where id = $1 and schedule_claimed_by = $2`, [trigger.id, workerId]);
      throw error;
    }
  }
  return { claimed: due.length, enqueued };
}
