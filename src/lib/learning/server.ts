import { randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";
import type { JsonValue } from "../multitenancy/server.ts";

export type LearningEventType = "agent_turn_completed" | "lead_qualified" | "lead_converted" | "handoff_requested" | "tool_failed" | "follow_up_sent";
export type LearningConsentScope = "disabled" | "internal_only" | "shared_anonymized";
export type LearningEventInput = { workspaceId: string; eventType: LearningEventType; agentId?: string; productId?: string; agentVersion?: string; outcome?: string; consentScope?: LearningConsentScope; traceId?: string; attributes?: Record<string, unknown> };

const forbiddenKeys = /(?:raw|content|message|prompt|token|secret|password|credential|phone|telephone|email|jwt|payload|webhook)/i;
const emailPattern = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;
const phonePattern = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const bearerPattern = /(?:bearer\s+|sk-|xoxb-|ghp_)[a-z0-9._-]+/gi;

function sanitizeString(value: string): string {
  return value.replace(emailPattern, "[email]").replace(phonePattern, "[phone]").replace(bearerPattern, "[secret]").slice(0, 500);
}
function sanitizeValue(value: unknown, depth = 0): JsonValue | undefined {
  if (depth > 3) return "[depth_limit]";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1) ?? "[removed]");
  if (typeof value === "object") {
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (forbiddenKeys.test(key)) continue;
      const sanitized = sanitizeValue(item, depth + 1);
      if (sanitized !== undefined) result[key.slice(0, 80)] = sanitized;
    }
    return result;
  }
  return undefined;
}

export function sanitizeLearningAttributes(attributes: Record<string, unknown> | undefined): Record<string, JsonValue> {
  const sanitized = sanitizeValue(attributes ?? {});
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) return {};
  const result = sanitized as Record<string, JsonValue>;
  const encoded = JSON.stringify(result);
  return encoded.length <= 8000 ? result : { truncated: true, attributeBytes: encoded.length };
}

export async function recordLearningEvent(sql: Sql, input: LearningEventInput): Promise<{ id?: string; recorded: boolean }> {
  if (!input.workspaceId.trim()) throw new Error("LEARNING_WORKSPACE_REQUIRED");
  if (input.consentScope === "disabled") return { recorded: false };
  const attributes = sanitizeLearningAttributes(input.attributes);
  const rows = await sql.query<{ id: string }>(`insert into nexo_learning_events (id, workspace_id, event_type, agent_id, product_id, agent_version, outcome, consent_scope, trace_id, attributes) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) on conflict (workspace_id, trace_id, event_type) where trace_id is not null do nothing returning id`, [randomUUID(), input.workspaceId, input.eventType, input.agentId ?? null, input.productId ?? null, input.agentVersion?.slice(0, 80) ?? null, input.outcome?.slice(0, 80) ?? null, input.consentScope ?? "internal_only", input.traceId?.slice(0, 160) ?? null, JSON.stringify(attributes)]);
  return rows[0] ? { id: rows[0].id, recorded: true } : { recorded: false };
}
