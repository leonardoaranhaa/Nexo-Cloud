import { randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";
import { requireWorkspaceAccess, type JsonObject } from "../multitenancy/server.ts";

export type CalendarBooking = {
  id: string;
  workspaceId: string;
  slotId: string;
  conversationId: string | null;
  externalContactId: string;
  customerName: string | null;
  notes: string | null;
  status: "confirmed" | "cancelled";
};

export type WorkspaceCalendarSlot = {
  id: string;
  workspaceId: string;
  startAt: string;
  endAt: string;
  status: "available" | "booked" | "blocked";
  resourceLabel: string | null;
  metadata: JsonObject;
};

function date(value: string, field: string): string {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) throw new Error(`CALENDAR_${field.toUpperCase()}_INVALID`);
  return parsed.toISOString();
}

export async function listWorkspaceAvailabilitySlots(sql: Sql, userId: string, input: { workspaceId: string; from?: string; to?: string; status?: "available" | "booked" | "blocked"; limit?: number }): Promise<WorkspaceCalendarSlot[]> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  const from = input.from ? date(input.from, "from") : new Date().toISOString();
  const to = input.to ? date(input.to, "to") : new Date(Date.now() + 14 * 86400000).toISOString();
  if (new Date(to) <= new Date(from)) throw new Error("CALENDAR_RANGE_INVALID");
  const params: unknown[] = [input.workspaceId, from, to];
  const filters = ["workspace_id = $1", "start_at >= $2::timestamptz", "start_at < $3::timestamptz"];
  if (input.status) {
    params.push(input.status);
    filters.push(`status = $${params.length}`);
  }
  params.push(Math.min(Math.max(Math.round(input.limit ?? 200), 1), 500));
  return sql.query<WorkspaceCalendarSlot>(
    `select id, workspace_id as "workspaceId", start_at as "startAt", end_at as "endAt", status, resource_label as "resourceLabel", metadata
       from calendar_availability_slots
      where ${filters.join(" and ")}
      order by start_at asc
      limit $${params.length}`,
    params,
  );
}

export async function provisionAvailabilitySlots(sql: Sql, userId: string, input: { workspaceId: string; slots: { startAt: string; endAt: string; resourceLabel?: string }[] }): Promise<number> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "manage");
  if (input.slots.length > 200) throw new Error("CALENDAR_SLOT_BATCH_TOO_LARGE");
  let created = 0;
  for (const slot of input.slots) {
    const startAt = date(slot.startAt, "start");
    const endAt = date(slot.endAt, "end");
    if (new Date(endAt) <= new Date(startAt)) throw new Error("CALENDAR_RANGE_INVALID");
    const result = await sql.query(`insert into calendar_availability_slots (id, workspace_id, start_at, end_at, resource_label) values ($1,$2,$3::timestamptz,$4::timestamptz,$5) on conflict (workspace_id, start_at, end_at) do nothing`, [randomUUID(), input.workspaceId, startAt, endAt, typeof slot.resourceLabel === "string" ? slot.resourceLabel.slice(0, 120) : null]);
    created += result.length;
  }
  return created;
}

export async function blockAvailabilitySlot(sql: Sql, userId: string, input: { workspaceId: string; slotId: string }): Promise<void> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "manage");
  const result = await sql.query(`update calendar_availability_slots set status = 'blocked', updated_at = current_timestamp where id = $1 and workspace_id = $2 and status = 'available'`, [input.slotId, input.workspaceId]);
  if (!result.length) throw new Error("CALENDAR_SLOT_NOT_AVAILABLE");
}

export async function bookAvailabilitySlot(sql: Sql, userId: string | null, input: { workspaceId: string; slotId: string; externalContactId: string; conversationId?: string; customerName?: string; notes?: string; idempotencyKey: string }): Promise<CalendarBooking> {
  if (userId) await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const duplicate = await sql<CalendarBooking>`select id, workspace_id as "workspaceId", slot_id as "slotId", conversation_id as "conversationId", external_contact_id as "externalContactId", customer_name as "customerName", notes, status from calendar_bookings where workspace_id = ${input.workspaceId} and idempotency_key = ${input.idempotencyKey} limit 1`;
  if (duplicate[0]) return duplicate[0];
  const slot = await sql<{ id: string }>`select id from calendar_availability_slots where id = ${input.slotId} and workspace_id = ${input.workspaceId} and status = 'available' limit 1`;
  if (!slot[0]) throw new Error("CALENDAR_SLOT_NOT_AVAILABLE");
  const bookingId = randomUUID();
  const claimed = await sql.query(`update calendar_availability_slots set status = 'booked', updated_at = current_timestamp where id = $1 and workspace_id = $2 and status = 'available'`, [input.slotId, input.workspaceId]);
  if (!claimed.length) throw new Error("CALENDAR_SLOT_NOT_AVAILABLE");
  try {
    await sql.query(`insert into calendar_bookings (id, workspace_id, slot_id, conversation_id, external_contact_id, customer_name, notes, idempotency_key) values ($1,$2,$3,$4,$5,$6,$7,$8)`, [bookingId, input.workspaceId, input.slotId, input.conversationId ?? null, input.externalContactId.slice(0, 160), input.customerName?.slice(0, 160) ?? null, input.notes?.slice(0, 1000) ?? null, input.idempotencyKey]);
  } catch (error) {
    await sql.query(`update calendar_availability_slots set status = 'available', updated_at = current_timestamp where id = $1 and workspace_id = $2 and status = 'booked'`, [input.slotId, input.workspaceId]);
    throw error;
  }
  return (await sql<CalendarBooking>`select id, workspace_id as "workspaceId", slot_id as "slotId", conversation_id as "conversationId", external_contact_id as "externalContactId", customer_name as "customerName", notes, status from calendar_bookings where id = ${bookingId}`).at(0)!;
}
