import assert from "node:assert/strict";
import { test } from "node:test";
import { availabilityToolOutput, listAvailability } from "./availability.ts";

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
