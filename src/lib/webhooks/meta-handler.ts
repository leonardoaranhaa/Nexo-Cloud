import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Sql } from "../db.ts";
import { createSecretResolver, type SecretProvider } from "../connectors/secrets.ts";
import { enqueueAgentRuntimeJob } from "../agent-runtime/queue.ts";
import { WebhookRequestError, type EvolutionWebhookOutcome } from "./evolution-handler.ts";

export { WebhookRequestError } from "./evolution-handler.ts";

type RecordValue = Record<string, unknown>;
type DeliveryState = "sent" | "delivered" | "read" | "failed" | "unknown";

function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function text(value: unknown, max = 300): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

function constantTime(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function signature(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

function deliveryState(value: unknown): DeliveryState | undefined {
  const state = text(value, 30);
  return state === "sent" || state === "delivered" || state === "read" || state === "failed"
    ? state
    : state === "accepted" || state === "queued"
      ? "unknown"
      : undefined;
}

export function verifyMetaSignature(body: string, appSecret: string, provided: string): boolean {
  return constantTime(provided, signature(body, appSecret));
}

async function connection(sql: Sql, id: string) {
  const rows = await sql.query<{
    id: string;
    workspace_id: string;
    status: string;
    config: RecordValue;
    secret_ref: string | null;
    meta_app_secret_ref: string | null;
    meta_verify_token_ref: string | null;
  }>(
    `select id, workspace_id, status, config, secret_ref, meta_app_secret_ref, meta_verify_token_ref
       from connections
      where id = $1 and provider = 'meta' and deleted_at is null
      limit 1`,
    [id],
  );
  if (!rows[0] || rows[0].status === "revoked") throw new WebhookRequestError(404, "WEBHOOK_CONNECTION_NOT_FOUND");
  return rows[0];
}

async function handleDeliveryStatuses(
  sql: Sql,
  workspaceId: string,
  connectionId: string,
  statuses: unknown[],
): Promise<EvolutionWebhookOutcome | undefined> {
  let result: EvolutionWebhookOutcome | undefined;
  for (const statusValue of statuses) {
    const status = record(statusValue);
    const providerMessageId = text(status.id, 240);
    const state = deliveryState(status.status);
    if (!providerMessageId || !state) continue;
    const error = Array.isArray(status.errors) ? record(status.errors[0]) : {};
    const errorCode = error.code === undefined ? undefined : String(error.code).slice(0, 80);
    const errorMessage = text(error.title, 300) ?? text(error.message, 300);
    const deliveries = await sql.query<{ id: string; message_id: string }>(
      `update message_deliveries
          set status = $1,
              last_error_code = $2,
              last_error_message = $3,
              updated_at = current_timestamp
        where workspace_id = $4 and connection_id = $5 and provider_message_id = $6
        returning id, message_id`,
      [state, errorCode ?? null, errorMessage ?? null, workspaceId, connectionId, providerMessageId],
    );
    if (!deliveries[0]) continue;
    await sql.query(
      `update messages
          set status = $1,
              error_code = $2,
              error_message = $3,
              updated_at = current_timestamp
        where id = $4 and workspace_id = $5`,
      [state, errorCode ?? null, errorMessage ?? null, deliveries[0].message_id, workspaceId],
    );
    result = {
      accepted: true,
      kind: "delivery",
      eventId: providerMessageId,
      deliveryId: deliveries[0].id,
    };
  }
  return result;
}

export async function handleMetaWebhook(
  sql: Sql,
  request: Request,
  options: { connectionId: string; secretProvider: SecretProvider; maxBodyBytes?: number },
): Promise<EvolutionWebhookOutcome> {
  const target = await connection(sql, options.connectionId);
  const resolver = createSecretResolver(options.secretProvider);

  if (request.method === "GET") {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const verify = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode !== "subscribe" || !verify || !challenge || !target.meta_verify_token_ref) {
      throw new WebhookRequestError(403, "WEBHOOK_VERIFICATION_FAILED");
    }
    const expected = await resolver(target.meta_verify_token_ref, {
      workspaceId: target.workspace_id,
      connectionId: target.id,
    });
    if (!constantTime(verify, expected)) throw new WebhookRequestError(403, "WEBHOOK_VERIFICATION_FAILED");
    return { accepted: true, kind: "ignored", eventId: challenge.slice(0, 240) };
  }

  if (request.method !== "POST") throw new WebhookRequestError(400, "METHOD_NOT_ALLOWED");
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > (options.maxBodyBytes ?? 1024 * 1024)) {
    throw new WebhookRequestError(413, "WEBHOOK_BODY_TOO_LARGE");
  }
  if (!target.meta_app_secret_ref) throw new WebhookRequestError(401, "WEBHOOK_NOT_CONFIGURED");
  const appSecret = await resolver(target.meta_app_secret_ref, {
    workspaceId: target.workspace_id,
    connectionId: target.id,
  });
  if (!verifyMetaSignature(body, appSecret, request.headers.get("x-hub-signature-256") ?? "")) {
    throw new WebhookRequestError(401, "WEBHOOK_UNAUTHORIZED");
  }

  let payload: RecordValue;
  try {
    payload = record(JSON.parse(body));
  } catch {
    throw new WebhookRequestError(400, "WEBHOOK_INVALID_JSON");
  }

  let accepted: EvolutionWebhookOutcome = { accepted: true, kind: "ignored" };
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entryValue of entries) {
    const entry = record(entryValue);
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const changeValue of changes) {
      const value = record(record(changeValue).value);
      const delivery = await handleDeliveryStatuses(sql, target.workspace_id, target.id, Array.isArray(value.statuses) ? value.statuses : []);
      if (delivery) accepted = delivery;

      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const messageValue of messages) {
        const message = record(messageValue);
        const externalMessageId = text(message.id, 240);
        const sender = text(message.from, 80)?.replace(/\D/g, "");
        const messageText = text(record(message.text).body, 4096);
        if (!externalMessageId || !sender || !messageText || text(message.type, 40) !== "text") continue;

        const agents = await sql.query<{ id: string }>(
          `select a.id
             from agents a
             join agent_connections ac on ac.agent_id = a.id and ac.connection_id = $1 and ac.is_primary = true
            where a.workspace_id = $2 and a.status = 'active' and a.deleted_at is null
            order by a.updated_at desc
            limit 1`,
          [target.id, target.workspace_id],
        );
        if (!agents[0]) continue;

        const conversations = await sql.query<{ id: string }>(
          `select id from conversations
            where workspace_id = $1 and agent_id = $2 and connection_id = $3 and external_contact_id = $4 and status = 'open'
            order by created_at desc limit 1`,
          [target.workspace_id, agents[0].id, target.id, sender],
        );
        const conversationId = conversations[0]?.id ?? randomUUID();
        if (!conversations[0]) {
          await sql.query(
            `insert into conversations (id, workspace_id, agent_id, connection_id, external_contact_id)
             values ($1, $2, $3, $4, $5) on conflict do nothing`,
            [conversationId, target.workspace_id, agents[0].id, target.id, sender],
          );
        }

        const inserted = await sql.query<{ id: string }>(
          `insert into messages (id, workspace_id, conversation_id, direction, sender_type, external_message_id, content, status)
           values ($1, $2, $3, 'inbound', 'contact', $4, $5::jsonb, 'received')
           on conflict do nothing returning id`,
          [randomUUID(), target.workspace_id, conversationId, externalMessageId, JSON.stringify({ type: "text", text: messageText, sender })],
        );
        const actual = inserted[0]?.id ?? (await sql.query<{ id: string }>(
          `select id from messages where workspace_id = $1 and external_message_id = $2 limit 1`,
          [target.workspace_id, externalMessageId],
        ))[0]?.id;
        if (!actual) continue;

        await sql.query(
          `update connections set last_event_at = current_timestamp where id = $1 and workspace_id = $2`,
          [target.id, target.workspace_id],
        );
        const job = await enqueueAgentRuntimeJob(sql, {
          workspaceId: target.workspace_id,
          agentId: agents[0].id,
          conversationId,
          inboundMessageId: actual,
          traceId: randomUUID(),
        });
        accepted = {
          accepted: true,
          kind: "inbound",
          eventId: externalMessageId,
          messageId: actual,
          jobId: job.id,
          ...(inserted[0] ? {} : { duplicate: true }),
        };
      }
    }
  }
  return accepted;
}
