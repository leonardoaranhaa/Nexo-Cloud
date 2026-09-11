import assert from "node:assert/strict";
import { test } from "node:test";
import { availabilityToolOutput, listAvailability } from "./availability.ts";
import { bookAvailabilitySlot, listWorkspaceAvailabilitySlots } from "./server.ts";

function fakeSql(rows: unknown[], onQuery: (params: unknown[]) => void) {
  return {
    async query<T>(_query: string, params: unknown[]) {
      onQuery(params);
      return rows as T[];
    },
  } as never;
}

test("availability is queried by workspace and returns sanitized slots", async () => {
  const calls: unknown[][] = [];
  const slots = await listAvailability(fakeSql([
    { id: "slot-1", workspaceId: "ws-a", startAt: "2026-09-11T10:00:00.000Z", endAt: "2026-09-11T10:30:00.000Z", status: "available", resourceLabel: "Consultor 1", metadata: { private: true } },
  ], (params) => calls.push(params)), "ws-a", {
    from: "2026-09-11T09:00:00.000Z",
    to: "2026-09-11T12:00:00.000Z",
    durationMinutes: 30,
  });
  assert.equal(calls[0]?.[0], "ws-a");
  assert.equal(calls[0]?.[3], 30);
  assert.equal(slots[0]?.workspaceId, "ws-a");
  assert.deepEqual(availabilityToolOutput(slots), {
    status: "available_slots_found",
    count: 1,
    slots: [{ id: "slot-1", startAt: "2026-09-11T10:00:00.000Z", endAt: "2026-09-11T10:30:00.000Z", resourceLabel: "Consultor 1" }],
  });
});

test("availability rejects an inverted date range", async () => {
  await assert.rejects(
    () => listAvailability(fakeSql([], () => undefined), "ws-a", {
      from: "2026-09-11T12:00:00.000Z",
      to: "2026-09-11T10:00:00.000Z",
    }),
    /CALENDAR_RANGE_INVALID/,
  );
});

test("workspace calendar listing is scoped, bounded and filterable", async () => {
  const calls: unknown[][] = [];
  const sql = Object.assign(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push(values);
    return strings.join(" ").includes("from workspaces")
      ? [{ organization_id: "org-a", workspace_role: "workspace_admin", organization_role: null }]
      : [{ id: "slot-1", workspaceId: "ws-a", startAt: "2026-09-11T10:00:00.000Z", endAt: "2026-09-11T10:30:00.000Z", status: "booked", resourceLabel: "Consultor 1", metadata: {} }];
  }, {
    async query<T>(_query: string, params: unknown[]) { calls.push(params); return [{ id: "slot-1", workspaceId: "ws-a", startAt: "2026-09-11T10:00:00.000Z", endAt: "2026-09-11T10:30:00.000Z", status: "booked", resourceLabel: "Consultor 1", metadata: {} }] as T[]; },
  }) as never;
  const slots = await listWorkspaceAvailabilitySlots(sql, "user-a", {
    workspaceId: "ws-a",
    from: "2026-09-11T00:00:00.000Z",
    to: "2026-09-12T00:00:00.000Z",
    status: "booked",
    limit: 20,
  });
  const listingCall = calls.at(-1) ?? [];
  assert.equal(listingCall[0], "ws-a");
  assert.equal(listingCall[3], "booked");
  assert.equal(listingCall[4], 20);
  assert.equal(slots[0]?.status, "booked");
});

test("booking claims an available slot and preserves workspace scope", async () => {
  const queryCalls: unknown[][] = [];
  const sql = Object.assign(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const statement = strings.join(" ");
    if (statement.includes("from calendar_bookings") && statement.includes("idempotency_key")) return [];
    if (statement.includes("from calendar_availability_slots")) return [{ id: "slot-a" }];
    if (statement.includes("from calendar_bookings where id")) return [{ id: "booking-a", workspaceId: "ws-a", slotId: "slot-a", conversationId: null, externalContactId: "contact-a", customerName: "Ana", notes: null, status: "confirmed" }];
    return [];
  }, {
    async query<T>(_query: string, params: unknown[]) { queryCalls.push(params); return [{ id: "claimed" }] as T[]; },
  }) as never;
  const booking = await bookAvailabilitySlot(sql, null, { workspaceId: "ws-a", slotId: "slot-a", externalContactId: "contact-a", customerName: "Ana", idempotencyKey: "book-1" });
  assert.equal(booking.workspaceId, "ws-a");
  assert.equal(booking.slotId, "slot-a");
  assert.equal(queryCalls.some((params) => params.includes("ws-a") && params.includes("slot-a")), true);
});
