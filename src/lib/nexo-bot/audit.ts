import { randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";
import { requireWorkspaceAccess, type JsonObject } from "../multitenancy/server.ts";

export type NexoBotAuditEventType =
  | "chat_completed"
  | "chat_failed"
  | "action_proposed"
  | "action_confirmed"
  | "action_succeeded"
  | "action_failed";

export type NexoBotAuditStatus = "pending" | "succeeded" | "failed";

export type NexoBotAuditEvent = {
  id: string;
  workspaceId: string;
  actorId: string;
  eventType: NexoBotAuditEventType;
  actionId: string | null;
  actionType: string | null;
  status: NexoBotAuditStatus;
  summary: string | null;
  resourceType: string | null;
  resourceId: string | null;
  durationMs: number | null;
  inputChars: number;
  outputChars: number;
  errorCode: string | null;
  metadata: JsonObject;
  createdAt: string;
};

export type NexoBotAuditFilters = {
  workspaceId: string;
  eventType?: NexoBotAuditEventType;
  actionType?: string;
  status?: NexoBotAuditStatus;
  from?: string;
  to?: string;
  limit?: number;
};

export type NexoBotAuditSummary = {
  total: number;
  chats: number;
  proposed: number;
  confirmed: number;
  succeeded: number;
  failed: number;
  pending: number;
  averageDurationMs: number;
  lastEventAt: string | null;
};

type AuditRow = Omit<NexoBotAuditEvent, "metadata"> & { metadata: JsonObject | null };

const EVENT_TYPES = new Set<NexoBotAuditEventType>([
  "chat_completed",
  "chat_failed",
  "action_proposed",
  "action_confirmed",
  "action_succeeded",
  "action_failed",
]);

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim().slice(0, max);
  return result || null;
}

function boundedInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

function sanitizeMetadata(value: JsonObject | undefined): JsonObject {
  if (!value) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, item]) => item !== undefined && !/(token|secret|password|authorization|credential|phone|email)/i.test(key))
      .slice(0, 20)
      .map(([key, item]) => [key.slice(0, 80), typeof item === "string" ? item.slice(0, 500) : item] as const),
  );
}

function mapEvent(row: AuditRow): NexoBotAuditEvent {
  return { ...row, metadata: row.metadata ?? {} };
}

export async function recordNexoBotAudit(
  sql: Sql,
  input: {
    workspaceId: string;
    actorId: string;
    eventType: NexoBotAuditEventType;
    actionId?: string | null;
    actionType?: string | null;
    status: NexoBotAuditStatus;
    summary?: string | null;
    resourceType?: string | null;
    resourceId?: string | null;
    durationMs?: number | null;
    inputChars?: number;
    outputChars?: number;
    errorCode?: string | null;
    metadata?: JsonObject;
  },
): Promise<void> {
  try {
    await sql.query(
      `insert into nexo_bot_audit_events
        (id, workspace_id, actor_id, event_type, action_id, action_type, status, summary, resource_type, resource_id, duration_ms, input_chars, output_chars, error_code, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)`,
      [
        randomUUID(),
        input.workspaceId,
        input.actorId,
        input.eventType,
        boundedText(input.actionId, 160),
        boundedText(input.actionType, 80),
        input.status,
        boundedText(input.summary, 1000),
        boundedText(input.resourceType, 80),
        boundedText(input.resourceId, 160),
        boundedInteger(input.durationMs),
        boundedInteger(input.inputChars) ?? 0,
        boundedInteger(input.outputChars) ?? 0,
        boundedText(input.errorCode, 120),
        JSON.stringify(sanitizeMetadata(input.metadata)),
      ],
    );
  } catch {
    // Observability must not make the primary assistant action unavailable.
  }
}

export async function listNexoBotAuditEvents(sql: Sql, userId: string, input: NexoBotAuditFilters): Promise<NexoBotAuditEvent[]> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  const params: unknown[] = [input.workspaceId];
  const clauses = ["workspace_id = $1"];
  if (input.eventType && EVENT_TYPES.has(input.eventType)) {
    params.push(input.eventType);
    clauses.push(`event_type = $${params.length}`);
  }
  if (input.actionType) {
    params.push(input.actionType.slice(0, 80));
    clauses.push(`action_type = $${params.length}`);
  }
  if (input.status) {
    params.push(input.status);
    clauses.push(`status = $${params.length}`);
  }
  if (input.from) {
    params.push(input.from);
    clauses.push(`created_at >= $${params.length}::timestamptz`);
  }
  if (input.to) {
    params.push(input.to);
    clauses.push(`created_at <= $${params.length}::timestamptz`);
  }
  const limit = Math.min(Math.max(Math.floor(input.limit ?? 100), 1), 200);
  params.push(limit);
  const rows = await sql.query<AuditRow>(
    `select id, workspace_id as "workspaceId", actor_id as "actorId", event_type as "eventType", action_id as "actionId", action_type as "actionType", status, summary, resource_type as "resourceType", resource_id as "resourceId", duration_ms as "durationMs", input_chars as "inputChars", output_chars as "outputChars", error_code as "errorCode", metadata, created_at as "createdAt"
     from nexo_bot_audit_events where ${clauses.join(" and ")} order by created_at desc limit $${params.length}`,
    params,
  );
  return rows.map(mapEvent);
}

export async function getNexoBotAuditSummary(sql: Sql, userId: string, input: Omit<NexoBotAuditFilters, "limit" | "eventType" | "actionType" | "status">): Promise<NexoBotAuditSummary> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  const params: unknown[] = [input.workspaceId];
  const clauses = ["workspace_id = $1"];
  if (input.from) {
    params.push(input.from);
    clauses.push(`created_at >= $${params.length}::timestamptz`);
  }
  if (input.to) {
    params.push(input.to);
    clauses.push(`created_at <= $${params.length}::timestamptz`);
  }
  const rows = await sql.query<{
    total: number | string;
    chats: number | string;
    proposed: number | string;
    confirmed: number | string;
    succeeded: number | string;
    failed: number | string;
    pending: number | string;
    averageDurationMs: number | string | null;
    lastEventAt: string | null;
  }>(
    `select count(*)::int as total,
      count(*) filter (where event_type in ('chat_completed', 'chat_failed'))::int as chats,
      count(*) filter (where event_type = 'action_proposed')::int as proposed,
      count(*) filter (where event_type = 'action_confirmed')::int as confirmed,
      count(*) filter (where event_type = 'action_succeeded')::int as succeeded,
      count(*) filter (where event_type = 'action_failed')::int as failed,
      count(*) filter (where status = 'pending')::int as pending,
      coalesce(avg(duration_ms) filter (where duration_ms is not null), 0)::float as "averageDurationMs",
      max(created_at) as "lastEventAt"
     from nexo_bot_audit_events where ${clauses.join(" and ")}`,
    params,
  );
  const row = rows[0];
  return {
    total: Number(row?.total ?? 0),
    chats: Number(row?.chats ?? 0),
    proposed: Number(row?.proposed ?? 0),
    confirmed: Number(row?.confirmed ?? 0),
    succeeded: Number(row?.succeeded ?? 0),
    failed: Number(row?.failed ?? 0),
    pending: Number(row?.pending ?? 0),
    averageDurationMs: Number(row?.averageDurationMs ?? 0),
    lastEventAt: row?.lastEventAt ?? null,
  };
}

export function isNexoBotAuditEventType(value: unknown): value is NexoBotAuditEventType {
  return typeof value === "string" && EVENT_TYPES.has(value as NexoBotAuditEventType);
}
