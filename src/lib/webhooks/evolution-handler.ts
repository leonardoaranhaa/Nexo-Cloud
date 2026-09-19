import { jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
import type { Sql } from "../db";
import { createSecretResolver, type SecretProvider } from "../connectors/secrets.ts";
import { enqueueAgentRuntimeJob } from "../agent-runtime/queue.ts";
import { runNextAgentRuntimeJob, type RuntimeModel } from "../agent-runtime/runtime.ts";

type JsonRecord = Record<string, unknown>;
type DeliveryState = "sent" | "delivered" | "read" | "failed" | "unknown";

export type EvolutionWebhookOutcome = {
  accepted: boolean;
  duplicate?: boolean;
  kind: "inbound" | "delivery" | "ignored";
  eventId?: string;
  messageId?: string;
  deliveryId?: string;
  jobId?: string;
};

export class WebhookRequestError extends Error {
  readonly status: 400 | 401 | 403 | 404 | 413;

  constructor(status: 400 | 401 | 403 | 404 | 413, code: string) {
    super(code);
    this.name = "WebhookRequestError";
    this.status = status;
  }
}

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function stringValue(value: unknown, max = 300): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

function normalizeEvent(value: unknown): string {
  return (stringValue(value, 80) ?? "").toLowerCase().replace(/[_-]/g, ".");
}

function normalizeContact(value: string): string {
  return value.split("@")[0]?.replace(/[^0-9]/g, "").slice(0, 80) || value.slice(0, 80);
}

async function verifyWebhookAuth(request: Request, secret: string): Promise<void> {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) throw new WebhookRequestError(401, "WEBHOOK_UNAUTHORIZED");
  const token = authorization.slice(7).trim();
  if (!token) throw new WebhookRequestError(401, "WEBHOOK_UNAUTHORIZED");
  try {
    const key = new TextEncoder().encode(secret);
    const verified = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (verified.payload.app !== "evolution" || verified.payload.action !== "webhook") {
      throw new Error("claims");
    }
  } catch {
    throw new WebhookRequestError(401, "WEBHOOK_UNAUTHORIZED");
  }
}

function textFromMessage(data: JsonRecord): string | undefined {
  const message = record(data.message);
  const conversation = stringValue(message.conversation, 4096);
  if (conversation) return conversation;
  const extended = record(message.extendedTextMessage);
  return stringValue(extended.text, 4096);
}

function statusFromData(data: JsonRecord): DeliveryState | undefined {
  const update = record(data.update);
  const raw = data.status ?? update.status ?? data.messageStatus;
  if (typeof raw !== "string") return undefined;
  const value = raw.toLowerCase().replace(/[-\s]/g, "_");
  if (["sent", "server_ack", "serverack"].includes(value)) return "sent";
  if (["delivered", "delivery_ack", "deliveryack"].includes(value)) return "delivered";
  if (["read", "read_ack", "readack", "played"].includes(value)) return "read";
  if (["failed", "error"].includes(value)) return "failed";
  return "unknown";
}

function rank(status: DeliveryState): number {
  return { failed: 0, unknown: 0, sent: 1, delivered: 2, read: 3 }[status];
}

function eventKey(event: string, instance: string, data: JsonRecord): string {
  const key = record(data.key);
  const id = stringValue(key.id, 240);
  return `${event}:${instance}:${id ?? randomUUID()}`.slice(0, 420);
}

async function locateConnection(sql: Sql, instance: string): Promise<{
  id: string;
  workspace_id: string;
  provider: string;
  status: string;
  config: JsonRecord;
  webhook_secret_ref: string | null;
}> {
  const rows = await sql.query<{
    id: string;
    workspace_id: string;
    provider: string;
    status: string;
    config: JsonRecord;
    webhook_secret_ref: string | null;
  }>(
    `select id, workspace_id, provider, status, config, webhook_secret_ref
       from connections
      where provider = 'evolution'
        and config->>'instance' = $1
        and deleted_at is null
      order by created_at asc limit 2`,
    [instance],
  );
  if (rows.length !== 1) throw new WebhookRequestError(404, "WEBHOOK_CONNECTION_NOT_FOUND");
  if (rows[0].status === "revoked") throw new WebhookRequestError(404, "WEBHOOK_CONNECTION_NOT_FOUND");
  return rows[0];
}

async function persistInbound(sql: Sql, connection: Awaited<ReturnType<typeof locateConnection>>, data: JsonRecord, event: string): Promise<EvolutionWebhookOutcome> {
  const key = record(data.key);
  const externalMessageId = stringValue(key.id, 240);
  const remoteJid = stringValue(key.remoteJid, 240);
  const sender = normalizeContact(remoteJid ?? stringValue(data.sender, 80) ?? "unknown");
  const text = textFromMessage(data);
  if (!externalMessageId || !sender || !text) return { accepted: true, kind: "ignored", eventId: eventKey(event, String(connection.config.instance ?? ""), data) };
  if (key.fromMe === true) return { accepted: true, kind: "ignored", eventId: eventKey(event, String(connection.config.instance ?? ""), data) };

  const agentRows = await sql.query<{ id: string }>(
    `select a.id
       from agents a
       join agent_connections ac on ac.agent_id = a.id and ac.connection_id = $1 and ac.is_primary = true
      where a.workspace_id = $2 and a.status = 'active' and a.deleted_at is null
      order by a.updated_at desc limit 1`,
    [connection.id, connection.workspace_id],
  );
  if (!agentRows[0]) return { accepted: true, kind: "ignored", eventId: externalMessageId };
  const agentId = agentRows[0].id;
  const conversations = await sql.query<{ id: string }>(
    `select id from conversations
      where workspace_id = $1 and agent_id = $2 and connection_id = $3
        and external_contact_id = $4 and status = 'open'
      order by created_at desc limit 1`,
    [connection.workspace_id, agentId, connection.id, sender],
  );
  let conversationId = conversations[0]?.id;
  if (!conversationId) {
    conversationId = randomUUID();
    await sql.query(
      `insert into conversations (id, workspace_id, agent_id, connection_id, external_contact_id)
       values ($1, $2, $3, $4, $5) on conflict do nothing`,
      [conversationId, connection.workspace_id, agentId, connection.id, sender],
    );
    const resolved = await sql.query<{ id: string }>(
      `select id from conversations
        where workspace_id = $1 and agent_id = $2 and connection_id = $3
          and external_contact_id = $4 and status = 'open'
        order by created_at desc limit 1`,
      [connection.workspace_id, agentId, connection.id, sender],
    );
    conversationId = resolved[0]?.id ?? conversationId;
  }
  const messageId = randomUUID();
  const inserted = await sql.query<{ id: string }>(
    `insert into messages (id, workspace_id, conversation_id, direction, sender_type, external_message_id, content, status)
     values ($1, $2, $3, 'inbound', 'contact', $4, $5::jsonb, 'received')
     on conflict do nothing returning id`,
    [messageId, connection.workspace_id, conversationId, externalMessageId, JSON.stringify({ type: "text", text, sender, pushName: stringValue(data.pushName, 160) })],
  );
  const persisted = await sql.query<{ id: string }>(
    `select id from messages where workspace_id = $1 and external_message_id = $2 limit 1`,
    [connection.workspace_id, externalMessageId],
  );
  const actualId = persisted[0]?.id ?? messageId;
  await sql.query(
    `update connections set last_event_at = current_timestamp where id = $1 and workspace_id = $2`,
    [connection.id, connection.workspace_id],
  );
  const job = await enqueueAgentRuntimeJob(sql, {
    workspaceId: connection.workspace_id,
    agentId,
    conversationId,
    inboundMessageId: actualId,
    traceId: randomUUID(),
  });
  return {
    accepted: true,
    kind: "inbound",
    eventId: externalMessageId,
    messageId: actualId,
    jobId: job.id,
    ...(inserted[0] ? {} : { duplicate: true }),
  };
}

async function persistDeliveryStatus(sql: Sql, connection: Awaited<ReturnType<typeof locateConnection>>, data: JsonRecord): Promise<EvolutionWebhookOutcome> {
  const key = record(data.key);
  const providerMessageId = stringValue(key.id, 240);
  const next = statusFromData(data);
  if (!providerMessageId || !next) return { accepted: true, kind: "ignored", eventId: providerMessageId };
  const rows = await sql.query<{ id: string; message_id: string; status: DeliveryState }>(
    `select id, message_id, status from message_deliveries
      where workspace_id = $1 and connection_id = $2 and provider_message_id = $3 limit 1`,
    [connection.workspace_id, connection.id, providerMessageId],
  );
  const delivery = rows[0];
  if (!delivery) return { accepted: true, kind: "ignored", eventId: providerMessageId };
  if (delivery.status === "failed" || rank(next) < rank(delivery.status)) {
    return { accepted: true, kind: "delivery", eventId: providerMessageId, deliveryId: delivery.id, messageId: delivery.message_id };
  }
  await sql.query(
    `update message_deliveries set status = $1, last_error_code = case when $1 = 'failed' then 'provider_failed' else null end, updated_at = current_timestamp
      where id = $2 and workspace_id = $3`,
    [next, delivery.id, connection.workspace_id],
  );
  await sql.query(
    `update messages set status = $1, error_code = case when $1 = 'failed' then 'provider_failed' else null end, updated_at = current_timestamp
      where id = $2 and workspace_id = $3`,
    [next, delivery.message_id, connection.workspace_id],
  );
  return { accepted: true, kind: "delivery", eventId: providerMessageId, deliveryId: delivery.id, messageId: delivery.message_id };
}

export async function handleEvolutionWebhook(
  sql: Sql,
  request: Request,
  options: { instance?: string; secretProvider: SecretProvider; maxBodyBytes?: number; runtimeModel?: RuntimeModel; runAgentImmediately?: boolean },
): Promise<EvolutionWebhookOutcome> {
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > (options.maxBodyBytes ?? 1024 * 1024)) throw new WebhookRequestError(413, "WEBHOOK_BODY_TOO_LARGE");
  let payload: JsonRecord;
  try {
    payload = record(JSON.parse(body));
  } catch {
    throw new WebhookRequestError(400, "WEBHOOK_INVALID_JSON");
  }
  const instance = stringValue(options.instance, 160) ?? stringValue(payload.instance, 160);
  const event = normalizeEvent(payload.event);
  if (!instance || !event) throw new WebhookRequestError(400, "WEBHOOK_FIELDS_INVALID");
  const payloadInstance = stringValue(payload.instance, 160);
  if (options.instance && payloadInstance && payloadInstance !== instance) throw new WebhookRequestError(400, "WEBHOOK_INSTANCE_MISMATCH");
  const connection = await locateConnection(sql, instance);
  if (!connection.webhook_secret_ref) throw new WebhookRequestError(401, "WEBHOOK_NOT_CONFIGURED");
  const resolver = createSecretResolver(options.secretProvider);
  const secret = await resolver(connection.webhook_secret_ref, { workspaceId: connection.workspace_id, connectionId: connection.id });
  await verifyWebhookAuth(request, secret);
  const dataItems = Array.isArray(payload.data) ? payload.data.map(record) : [record(payload.data)];
  if (event === "messages.upsert") {
    const outcome = await persistInbound(sql, connection, dataItems[0] ?? {}, event);
    if (outcome.kind === "inbound" && outcome.jobId && options.runAgentImmediately !== false) {
      await runNextAgentRuntimeJob(sql, `webhook-worker:${randomUUID()}`, options.runtimeModel, options.secretProvider);
    }
    return outcome;
  }
  if (event === "messages.update" || event === "send.message.update") {
    let outcome: EvolutionWebhookOutcome = { accepted: true, kind: "ignored" };
    for (const data of dataItems) outcome = await persistDeliveryStatus(sql, connection, data);
    return outcome;
  }
  return { accepted: true, kind: "ignored", eventId: eventKey(event, instance, dataItems[0] ?? {}) };
}
