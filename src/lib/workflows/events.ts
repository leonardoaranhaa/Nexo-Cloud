import { randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";
import type { JsonObject } from "../multitenancy/server.ts";

type Trigger = { id: string; workflow_id: string; workspace_id: string; version_id: string; config: unknown; type: "event" | "status_change" };
function object(value: unknown): JsonObject { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}; }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function json(value: unknown): JsonObject { return object(value); }
function matches(trigger: Trigger, input: { eventType: string; entityType?: string; toStatus?: string }): boolean {
  const config = json(trigger.config);
  if (trigger.type === "event") return !config.eventType || text(config.eventType) === input.eventType;
  return (!config.eventType || text(config.eventType) === input.eventType) && (!config.entityType || text(config.entityType) === text(input.entityType)) && (!config.toStatus || text(config.toStatus) === text(input.toStatus));
}

export type WorkflowEventInput = { workspaceId: string; eventType: string; source: string; idempotencyKey: string; payload?: unknown; entityType?: string; toStatus?: string };
export type WorkflowEventResult = { eventId: string; duplicate: boolean; enqueuedRunIds: string[] };

export async function publishWorkflowEvent(sql: Sql, input: WorkflowEventInput): Promise<WorkflowEventResult> {
  const eventId = randomUUID();
  const inserted = await sql.query<{ id: string }>(`insert into workflow_events (id, workspace_id, event_type, source, external_event_id, payload, status, correlation_id, idempotency_key) values ($1,$2,$3,$4,$5,$6::jsonb,'received',$7,$8) on conflict do nothing returning id`, [eventId, input.workspaceId, input.eventType.slice(0, 120), input.source.slice(0, 120), input.idempotencyKey.slice(0, 180), JSON.stringify(json(input.payload)), randomUUID(), input.idempotencyKey.slice(0, 180)]);
  if (!inserted[0]) {
    const existing = await sql.query<{ id: string }>(`select id from workflow_events where workspace_id = $1 and idempotency_key = $2`, [input.workspaceId, input.idempotencyKey.slice(0, 180)]);
    return { eventId: existing[0]?.id ?? eventId, duplicate: true, enqueuedRunIds: [] };
  }
  const triggers = await sql.query<Trigger>(`select t.id, t.workflow_id, w.workspace_id, t.type, t.config, v.id as version_id from workflow_triggers t join workflows w on w.id = t.workflow_id and w.workspace_id = $1 and w.status = 'active' and w.deleted_at is null join lateral (select id from workflow_versions where workflow_id = w.id and status = 'published' order by version_number desc limit 1) v on true where t.enabled = true and t.type in ('event','status_change')`, [input.workspaceId]);
  const enqueuedRunIds: string[] = [];
  for (const trigger of triggers.filter((item) => matches(item, input))) {
    const runId = randomUUID();
    const run = await sql.query<{ id: string }>(`insert into workflow_runs (id, workspace_id, workflow_id, workflow_version_id, trigger_id, status, input, correlation_id, idempotency_key) values ($1,$2,$3,$4,$5,'queued',$6::jsonb,$7,$8) on conflict (workspace_id, idempotency_key) do nothing returning id`, [runId, input.workspaceId, trigger.workflow_id, trigger.version_id, trigger.id, JSON.stringify(json(input.payload)), randomUUID(), `event-run:${inserted[0].id}:${trigger.id}`]);
    if (run[0]) enqueuedRunIds.push(run[0].id);
  }
  await sql.query(`update workflow_events set status = 'processed', processed_at = current_timestamp where id = $1`, [inserted[0].id]);
  return { eventId: inserted[0].id, duplicate: false, enqueuedRunIds };
}

export async function publishStatusChange(sql: Sql, input: { workspaceId: string; entityType: string; entityId: string; fromStatus?: string; toStatus: string; payload?: unknown }): Promise<WorkflowEventResult> {
  const eventType = `${input.entityType}.status_changed`;
  return publishWorkflowEvent(sql, { workspaceId: input.workspaceId, eventType, source: "internal", idempotencyKey: `status:${input.entityType}:${input.entityId}:${input.toStatus}`, entityType: input.entityType, toStatus: input.toStatus, payload: { ...json(input.payload), entityType: input.entityType, entityId: input.entityId, fromStatus: input.fromStatus ?? null, toStatus: input.toStatus } });
}
