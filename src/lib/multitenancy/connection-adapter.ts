import type { Connection } from "@/lib/types";
import type { ConnectionRecord } from "./server";

function epoch(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function connectionRecordToUi(record: ConnectionRecord): Connection {
  return {
    id: record.id,
    name: record.name,
    provider: record.provider,
    status: record.status === "pending" || record.status === "revoked" ? "disconnected" : record.status,
    phone: record.phone ?? undefined,
    instance: record.instance ?? undefined,
    phoneNumberId: record.phoneNumberId ?? undefined,
    baseUrl: record.baseUrl ?? undefined,
    createdAt: epoch(record.createdAt) ?? Date.now(),
    lastEventAt: epoch(record.lastEventAt),
  };
}
