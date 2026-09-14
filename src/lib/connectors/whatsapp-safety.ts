import type { Sql } from "../db.ts";
import { whatsappPolicy, type WhatsAppPolicy } from "./whatsapp-policy.ts";

export type WhatsAppSafetyResult =
  | { allowed: true }
  | { allowed: false; code: "WHATSAPP_DAILY_LIMIT" | "WHATSAPP_BURST_LIMIT" | "WHATSAPP_MIN_DELAY" | "WHATSAPP_HANDOFF_PAUSE"; retryAfterMs: number };

function secondsUntil(value: unknown): number {
  const date = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

function millisecondsSince(value: string | null): number {
  const timestamp = value ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) ? Math.max(0, Date.now() - timestamp) : Number.POSITIVE_INFINITY;
}

export async function reserveWhatsAppOutbound(sql: Sql, input: { workspaceId: string; connectionId: string; policy: WhatsAppPolicy }): Promise<WhatsAppSafetyResult> {
  const rows = await sql.query<{ outbound_day_count: number; outbound_burst_count: number; outbound_last_at: string | null; agent_pause_until: string | null }>(
    `update connections
        set outbound_day = case when outbound_day = current_date then outbound_day else current_date end,
            outbound_day_count = case when outbound_day = current_date then outbound_day_count + 1 else 1 end,
            outbound_burst_started_at = case when outbound_burst_started_at is null or outbound_burst_started_at < current_timestamp - ($4::int * interval '1 millisecond') then current_timestamp else outbound_burst_started_at end,
            outbound_burst_count = case when outbound_burst_started_at is null or outbound_burst_started_at < current_timestamp - ($4::int * interval '1 millisecond') then 1 else outbound_burst_count + 1 end,
            outbound_last_at = current_timestamp,
            updated_at = current_timestamp
      where id = $1 and workspace_id = $2 and status = 'connected'
        and (agent_pause_until is null or agent_pause_until <= current_timestamp)
        and (outbound_day is distinct from current_date or outbound_day_count < $3)
        and (outbound_burst_started_at is null or outbound_burst_started_at < current_timestamp - ($4::int * interval '1 millisecond') or outbound_burst_count < $5)
        and (outbound_last_at is null or outbound_last_at <= current_timestamp - ($6::int * interval '1 millisecond'))
      returning outbound_day_count, outbound_burst_count, outbound_last_at, agent_pause_until`,
    [input.connectionId, input.workspaceId, input.policy.dailyMessageLimit, input.policy.burstWindowMs, input.policy.burstLimit, input.policy.minDelayMs],
  );
  if (rows[0]) return { allowed: true };

  const state = await sql.query<{ outbound_day: string | null; outbound_day_count: number; outbound_burst_started_at: string | null; outbound_burst_count: number; outbound_last_at: string | null; agent_pause_until: string | null }>(
    `select outbound_day::text as outbound_day, outbound_day_count, outbound_burst_started_at, outbound_burst_count, outbound_last_at, agent_pause_until from connections where id = $1 and workspace_id = $2 limit 1`,
    [input.connectionId, input.workspaceId],
  );
  const current = state[0];
  if (!current) return { allowed: false, code: "WHATSAPP_DAILY_LIMIT", retryAfterMs: 60_000 };
  const pauseMs = secondsUntil(current.agent_pause_until);
  if (pauseMs > 0) return { allowed: false, code: "WHATSAPP_HANDOFF_PAUSE", retryAfterMs: pauseMs };
  if (current.outbound_day === new Date().toISOString().slice(0, 10) && current.outbound_day_count >= input.policy.dailyMessageLimit) return { allowed: false, code: "WHATSAPP_DAILY_LIMIT", retryAfterMs: 24 * 60 * 60 * 1000 };
  const burstAge = millisecondsSince(current.outbound_burst_started_at);
  if (Number.isFinite(burstAge) && burstAge < input.policy.burstWindowMs && current.outbound_burst_count >= input.policy.burstLimit) return { allowed: false, code: "WHATSAPP_BURST_LIMIT", retryAfterMs: Math.max(1, input.policy.burstWindowMs - burstAge) };
  const lastAge = millisecondsSince(current.outbound_last_at);
  return { allowed: false, code: "WHATSAPP_MIN_DELAY", retryAfterMs: Math.max(1, input.policy.minDelayMs - lastAge) };
}

export async function pauseWhatsAppAgent(sql: Sql, input: { workspaceId: string; connectionId: string; pauseMinutes: number }): Promise<void> {
  await sql.query(`update connections set agent_pause_until = greatest(coalesce(agent_pause_until, current_timestamp), current_timestamp + ($3::int * interval '1 minute')), updated_at = current_timestamp where id = $1 and workspace_id = $2`, [input.connectionId, input.workspaceId, input.pauseMinutes]);
}

export function policyFromConnectionConfig(config: Record<string, unknown> | null | undefined) {
  return whatsappPolicy(config);
}
