import { randomUUID } from "node:crypto";
import type { Sql } from "../db";
import { requireWorkspaceAccess, type ConnectionProvider, type JsonObject } from "../multitenancy/server.ts";
import { createSecretResolver, type SecretProvider } from "../connectors/secrets.ts";
import { EvolutionTextDispatcher, evolutionConfig } from "../connectors/evolution-messaging.ts";

type DeliveryStatus = "sent" | "failed" | "unknown";

export type DispatchTextInput = {
  workspaceId: string;
  agentId: string;
  connectionId: string;
  conversationId?: string;
  recipient: string;
  text: string;
  idempotencyKey: string;
  actor: "agent" | "user" | "workflow" | "system";
  traceId: string;
};

export type DispatchTextResult = {
  messageId: string;
  deliveryId: string;
  status: DeliveryStatus;
  code: string;
  provider: ConnectionProvider;
  providerMessageId?: string;
  message: string;
  deduplicated?: boolean;
};

type RouteTarget = {
  agent_id: string;
  agent_workspace_id: string;
  agent_status: string;
  connection_id: string;
  connection_workspace_id: string;
  provider: ConnectionProvider;
  connection_status: string;
  secret_ref: string | null;
  config: JsonObject;
};

type ExistingDelivery = {
  message_id: string;
  delivery_id: string;
  status: DeliveryStatus;
  provider: ConnectionProvider;
  provider_message_id: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
};

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value.trim().slice(0, max);
}

function publicResult(row: ExistingDelivery, deduplicated = true): DispatchTextResult {
  return {
    messageId: row.message_id,
    deliveryId: row.delivery_id,
    status: row.status,
    code: row.last_error_code ?? (row.status === "sent" ? "ok" : "in_progress"),
    provider: row.provider,
    ...(row.provider_message_id ? { providerMessageId: row.provider_message_id } : {}),
    message: row.last_error_message ?? (row.status === "sent" ? "Message already accepted by provider" : "Message delivery already exists"),
    ...(deduplicated ? { deduplicated: true } : {}),
  };
}

async function findDelivery(sql: Sql, workspaceId: string, idempotencyKey: string): Promise<ExistingDelivery | undefined> {
  const rows = await sql.query<ExistingDelivery>(
    `select m.id as message_id, d.id as delivery_id, d.status, d.provider,
            d.provider_message_id, d.last_error_code, d.last_error_message
       from message_deliveries d
       join messages m on m.id = d.message_id
      where d.workspace_id = $1 and d.idempotency_key = $2
      limit 1`,
    [workspaceId, idempotencyKey],
  );
  return rows[0];
}

export async function dispatchTextMessage(
  sql: Sql,
  userId: string,
  input: DispatchTextInput,
  secretProvider: SecretProvider,
): Promise<DispatchTextResult> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const agentId = text(input.agentId, "agentId", 120);
  const connectionId = text(input.connectionId, "connectionId", 120);
  const recipient = text(input.recipient, "recipient", 80);
  const content = text(input.text, "text", 4096);
  const idempotencyKey = text(input.idempotencyKey, "idempotencyKey", 160);
  const traceId = text(input.traceId, "traceId", 120);

  const existing = await findDelivery(sql, input.workspaceId, idempotencyKey);
  if (existing) return publicResult(existing);

  const targets = await sql.query<RouteTarget>(
    `select a.id as agent_id, a.workspace_id as agent_workspace_id, a.status as agent_status,
            c.id as connection_id, c.workspace_id as connection_workspace_id,
            c.provider, c.status as connection_status, c.secret_ref, c.config
       from agents a
       join agent_connections ac on ac.agent_id = a.id and ac.connection_id = $3 and ac.is_primary = true
       join connections c on c.id = ac.connection_id and c.deleted_at is null
      where a.id = $2 and a.workspace_id = $1 and a.deleted_at is null
      limit 1`,
    [input.workspaceId, agentId, connectionId],
  );
  const target = targets[0];
  if (!target || target.agent_workspace_id !== input.workspaceId || target.connection_workspace_id !== input.workspaceId) {
    throw new Error("AGENT_CONNECTION_SCOPE_INVALID");
  }
  if (target.agent_status !== "active") throw new Error("AGENT_NOT_ACTIVE");
  if (target.connection_status === "revoked") throw new Error("CONNECTION_REVOKED");
  if (target.provider !== "evolution") throw new Error("PROVIDER_DISPATCH_NOT_IMPLEMENTED");
  if (!target.secret_ref) throw new Error("CONNECTION_SECRET_REF_MISSING");

  let conversationId = input.conversationId?.trim() || "";
  if (conversationId) {
    const conversation = await sql.query<{ id: string; workspace_id: string }>(
      `select id, workspace_id from conversations where id = $1 and workspace_id = $2 limit 1`,
      [conversationId, input.workspaceId],
    );
    if (!conversation[0]) throw new Error("CONVERSATION_SCOPE_INVALID");
  } else {
    const conversations = await sql.query<{ id: string }>(
      `select id from conversations
        where workspace_id = $1 and agent_id = $2 and connection_id = $3
          and external_contact_id = $4 and status = 'open'
        order by created_at desc limit 1`,
      [input.workspaceId, agentId, connectionId, recipient],
    );
    conversationId = conversations[0]?.id ?? randomUUID();
    if (!conversations[0]) {
      await sql.query(
        `insert into conversations (id, workspace_id, agent_id, connection_id, external_contact_id)
         values ($1, $2, $3, $4, $5)
         on conflict do nothing`,
        [conversationId, input.workspaceId, agentId, connectionId, recipient],
      );
      const resolved = await sql.query<{ id: string }>(
        `select id from conversations
          where workspace_id = $1 and agent_id = $2 and connection_id = $3
            and external_contact_id = $4 and status = 'open'
          order by created_at desc limit 1`,
        [input.workspaceId, agentId, connectionId, recipient],
      );
      conversationId = resolved[0]?.id ?? conversationId;
    }
  }

  let messageId: string = randomUUID();
  const deliveryId = randomUUID();
  try {
    await sql.query(
      `insert into messages (id, workspace_id, conversation_id, direction, sender_type, idempotency_key, content, status)
       values ($1, $2, $3, 'outbound', $4, $5, $6::jsonb, 'sending')
       on conflict do nothing`,
      [messageId, input.workspaceId, conversationId, input.actor, idempotencyKey, JSON.stringify({ type: "text", text: content })],
    );
    const claimedMessage = await sql.query<{ id: string }>(
      `select id from messages where workspace_id = $1 and idempotency_key = $2 limit 1`,
      [input.workspaceId, idempotencyKey],
    );
    if (!claimedMessage[0]) throw new Error("MESSAGE_CLAIM_FAILED");
    messageId = claimedMessage[0].id;
    await sql.query(
      `insert into message_deliveries (id, workspace_id, message_id, connection_id, provider, status, attempt_count, idempotency_key)
       values ($1, $2, $3, $4, $5, 'sending', 1, $6)
       on conflict (workspace_id, idempotency_key) do nothing`,
      [deliveryId, input.workspaceId, messageId, connectionId, target.provider, idempotencyKey],
    );
    const claimedDelivery = await findDelivery(sql, input.workspaceId, idempotencyKey);
    if (!claimedDelivery) throw new Error("DELIVERY_CLAIM_FAILED");
    if (claimedDelivery.delivery_id !== deliveryId) return publicResult(claimedDelivery);
  } catch (error) {
    const duplicate = await findDelivery(sql, input.workspaceId, idempotencyKey);
    if (duplicate) return publicResult(duplicate);
    throw error;
  }

  const resolveSecret = createSecretResolver(secretProvider);
  const dispatch = await new EvolutionTextDispatcher().sendText(
    {
      ...evolutionConfig(target.config),
      recipient,
      text: content,
    },
    {
      workspaceId: input.workspaceId,
      connectionId,
      traceId,
      getSecret: (name) => {
        if (name !== "api_key") throw new Error("SECRET_NAME_NOT_ALLOWED");
        return resolveSecret(target.secret_ref!, { workspaceId: input.workspaceId, connectionId });
      },
    },
  );

  const status: DeliveryStatus = dispatch.status;
  await sql.query(
    `update message_deliveries
        set status = $2,
            provider_message_id = $3,
            last_error_code = $4,
            last_error_message = $5,
            sent_at = case when $2 = 'sent' then current_timestamp else sent_at end,
            updated_at = current_timestamp
      where id = $1 and workspace_id = $6`,
    [deliveryId, status, dispatch.providerMessageId ?? null, dispatch.status === "sent" ? null : dispatch.code, dispatch.status === "sent" ? null : dispatch.message, input.workspaceId],
  );
  await sql.query(
    `update messages
        set status = $2,
            error_code = $3,
            error_message = $4,
            updated_at = current_timestamp
      where id = $1 and workspace_id = $5`,
    [messageId, status, dispatch.status === "sent" ? null : dispatch.code, dispatch.status === "sent" ? null : dispatch.message, input.workspaceId],
  );

  return {
    messageId,
    deliveryId,
    status,
    code: dispatch.code,
    provider: target.provider,
    message: dispatch.message,
  };
}
