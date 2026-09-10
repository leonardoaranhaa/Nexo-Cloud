import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { randomUUID } from "node:crypto";
import type { JsonObject } from "./server";

export const getWorkspaceContext = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const { ensureDefaultWorkspace, listWorkspaces } = await import("./server");
    const sql = await getSql();
    const workspaces = await listWorkspaces(sql, context.userId);
    if (workspaces.length > 0) return { workspaces, activeWorkspace: workspaces[0] };
    const activeWorkspace = await ensureDefaultWorkspace(sql, context.userId);
    return { workspaces: [activeWorkspace], activeWorkspace };
  });

export const listWorkspaceAgents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ context, data }) => {
    const workspaceId = data.workspaceId.trim();
    if (!workspaceId) throw new Error("workspaceId is required");
    const { getSql } = await import("@/lib/db");
    const { listAgents } = await import("./server");
    return listAgents(await getSql(), context.userId, workspaceId);
  });

export const createWorkspaceAgent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      workspaceId: string;
      name: string;
      persona?: string;
      welcomeMessage?: string;
      systemPrompt?: string;
      agentType?: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { createAgent } = await import("./server");
    return createAgent(await getSql(), context.userId, data);
  });

export const updateWorkspaceAgent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    id: string;
    workspaceId: string;
    name: string;
    persona: string;
    welcomeMessage: string;
    systemPrompt: string;
    language: "pt" | "en" | "es";
    status: "draft" | "live" | "paused";
    temperature: number;
    maxTokens: number;
    memoryWindow: number;
    knowledge: JsonObject;
    tools: JsonObject;
    metadata?: JsonObject;
  }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { updateAgent } = await import("./server");
    await updateAgent(await getSql(), context.userId, data);
    return { ok: true as const };
  });

export const publishWorkspaceAgent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; agentId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { publishAgent } = await import("./server");
    return publishAgent(await getSql(), context.userId, data);
  });

export const listWorkspaceAgentVersions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; agentId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { listAgentVersions } = await import("./server");
    return listAgentVersions(await getSql(), context.userId, data);
  });

export const rollbackWorkspaceAgent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; agentId: string; versionId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { rollbackAgent } = await import("./server");
    return rollbackAgent(await getSql(), context.userId, data);
  });

export const archiveWorkspaceAgent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { archiveAgent } = await import("./server");
    await archiveAgent(await getSql(), context.userId, data.id);
    return { ok: true as const };
  });

export const listWorkspaceConnections = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { listConnections } = await import("./server");
    return listConnections(await getSql(), context.userId, data.workspaceId);
  });

export const createWorkspaceConnection = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    workspaceId: string;
    name: string;
    provider: "evolution" | "meta" | "zapi";
    instance?: string;
    phoneNumberId?: string;
    baseUrl?: string;
  }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { createConnection } = await import("./server");
    return createConnection(await getSql(), context.userId, data);
  });

export const updateWorkspaceConnection = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    id: string;
    workspaceId: string;
    name?: string;
    instance?: string;
    phoneNumberId?: string;
    baseUrl?: string;
    status?: "pending" | "connected" | "disconnected" | "error" | "revoked";
    phone?: string;
  }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { updateConnection } = await import("./server");
    await updateConnection(await getSql(), context.userId, data);
    return { ok: true as const };
  });

export const archiveWorkspaceConnection = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { archiveConnection } = await import("./server");
    await archiveConnection(await getSql(), context.userId, data.id);
    return { ok: true as const };
  });

export const bindWorkspaceAgentConnection = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { agentId: string; workspaceId: string; connectionId: string | null }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { bindAgentConnection } = await import("./server");
    await bindAgentConnection(await getSql(), context.userId, data);
    return { ok: true as const };
  });

export const getWorkspaceConnectionReadiness = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; connectionId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { assessConnectionReadiness } = await import("@/lib/connectors/readiness");
    return assessConnectionReadiness(await getSql(), context.userId, data);
  });

export const runWorkspaceConnectionHealthcheck = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; connectionId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { runConnectionHealthcheck } = await import("@/lib/connectors/healthcheck");
    return runConnectionHealthcheck(await getSql(), context.userId, {
      ...data,
      traceId: randomUUID(),
    });
  });

export const provisionEvolutionConnectionCredential = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    workspaceId: string;
    connectionId: string;
    apiKey: string;
    baseUrl: string;
    instance: string;
  }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { awsSecretsManagerProvisioner, unavailableSecretProvisioner } = await import("@/lib/connectors/secrets");
    const { provisionEvolutionCredential } = await import("./server");
    const provisioner = process.env.NEXO_SECRETS_BACKEND === "aws" && process.env.AWS_REGION
      ? awsSecretsManagerProvisioner({ region: process.env.AWS_REGION })
      : unavailableSecretProvisioner();
    await provisionEvolutionCredential(await getSql(), context.userId, data, provisioner);
    return { ok: true as const };
  });

export const dispatchWorkspaceTextMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    workspaceId: string;
    agentId: string;
    connectionId: string;
    conversationId?: string;
    recipient: string;
    text: string;
    idempotencyKey: string;
    actor: "agent" | "user" | "workflow" | "system";
    traceId: string;
  }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { awsSecretsManagerProvider, unavailableSecretProvider } = await import("@/lib/connectors/secrets");
    const { dispatchTextMessage } = await import("@/lib/messaging/router");
    const provider = process.env.NEXO_SECRETS_BACKEND === "aws" && process.env.AWS_REGION
      ? awsSecretsManagerProvider({ region: process.env.AWS_REGION })
      : unavailableSecretProvider();
    return dispatchTextMessage(await getSql(), context.userId, data, provider);
  });

export const provisionEvolutionWebhookCredential = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; connectionId: string; secret: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { awsSecretsManagerProvisioner, unavailableSecretProvisioner } = await import("@/lib/connectors/secrets");
    const { provisionEvolutionWebhookCredential } = await import("./server");
    const provisioner = process.env.NEXO_SECRETS_BACKEND === "aws" && process.env.AWS_REGION
      ? awsSecretsManagerProvisioner({ region: process.env.AWS_REGION })
      : unavailableSecretProvisioner();
    await provisionEvolutionWebhookCredential(await getSql(), context.userId, data, provisioner);
    return { ok: true as const };
  });
