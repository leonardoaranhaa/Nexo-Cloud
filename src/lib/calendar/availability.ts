import type { Sql } from "../db";

export type AvailabilitySlot = {
  id: string;
  workspaceId: string;
  startAt: string;
  endAt: string;
  status: "available" | "booked" | "blocked";
  resourceLabel: string | null;
};

export type AvailabilityQuery = {
  from: string;
  to: string;
  durationMinutes?: number;
  limit?: number;
};

function parseDate(value: string, field: string): Date {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) throw new Error(`CALENDAR_${field.toUpperCase()}_INVALID`);
  return parsed;
}

export async function listAvailability(
  sql: Sql,
  workspaceId: string,
  input: AvailabilityQuery,
): Promise<AvailabilitySlot[]> {
  const from = parseDate(input.from, "from");
  const to = parseDate(input.to, "to");
  if (to <= from) throw new Error("CALENDAR_RANGE_INVALID");
  const durationMinutes = Math.min(Math.max(Math.round(input.durationMinutes ?? 30), 5), 480);
  const limit = Math.min(Math.max(Math.round(input.limit ?? 20), 1), 50);
  return sql.query<AvailabilitySlot>(
    `select id, workspace_id as "workspaceId", start_at as "startAt", end_at as "endAt", status, resource_label as "resourceLabel"
       from calendar_availability_slots
      where workspace_id = $1
        and status = 'available'
        and start_at >= $2::timestamptz
        and end_at <= $3::timestamptz
        and extract(epoch from (end_at - start_at)) >= ($4 * 60)
      order by start_at
      limit $5`,
    [workspaceId, from.toISOString(), to.toISOString(), durationMinutes, limit],
  );
}

export function availabilityToolOutput(slots: AvailabilitySlot[]): Record<string, unknown> {
  return {
    status: "available_slots_found",
    count: slots.length,
    slots: slots.map((slot) => ({
      id: slot.id,
      startAt: slot.startAt,
      endAt: slot.endAt,
      resourceLabel: slot.resourceLabel,
    })),
  };
}
