import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { randomUUID } from "node:crypto";
import type { JsonObject } from "./server";
import {
  blueprintInput,
  reviewToolProposalInput,
  updateAgentInput,
  workspaceBlueprintInput,
  workspaceBlueprintListInput,
  workspaceOnlyInput,
  workspaceRunInput,
} from "../validation/server-schemas";

export const getWorkspaceContext = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const { ensureDefaultWorkspace, listWorkspaces } = await import("./server");
    const sql = await getSql();
    const workspaces = await listWorkspaces(sql, context.userId);
    if (workspaces.length > 0) return { workspaces, activeWorkspace: workspaces[0], isFirstWorkspace: false };
    const activeWorkspace = await ensureDefaultWorkspace(sql, context.userId);
    return { workspaces: [activeWorkspace], activeWorkspace, isFirstWorkspace: true };
  });

export const getWorkspaceReadiness = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input) => workspaceOnlyInput.parse(input))
  .handler(async ({ context, data }) => {
    const workspaceId = data.workspaceId.trim();
    if (!workspaceId) throw new Error("workspaceId is required");
    const { getSql } = await import("@/lib/db");
    const { getWorkspaceReadinessReport } = await import("@/lib/observability/readiness-report");
    return getWorkspaceReadinessReport(await getSql(), context.userId, workspaceId);
  });

export const completeWorkspaceOnboarding = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; name: string; goal: string; teamSize: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { completeWorkspaceOnboarding: saveOnboarding } = await import("./server");
    await saveOnboarding(await getSql(), context.userId, data);
    return { ok: true as const };
  });

export const listWorkspaceAgents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input) => workspaceOnlyInput.parse(input))
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

export const upsertWorkspaceAgentDevelopmentBlueprint = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input) => blueprintInput.parse(input))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { upsertAgentDevelopmentBlueprint } = await import("./server");
    return upsertAgentDevelopmentBlueprint(await getSql(), context.userId, data);
  });

export const runWorkspaceAgentBlueprintScenarios = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input) => workspaceBlueprintInput.parse(input))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { runBlueprintScenarios } = await import("@/lib/agent-engineering/scenarios");
    return runBlueprintScenarios(await getSql(), context.userId, data);
  });

export const generateWorkspaceAgentToolProposals = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input) => workspaceBlueprintInput.parse(input))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { generateToolProposalsFromBlueprint } = await import("@/lib/agent-engineering/tools");
    return generateToolProposalsFromBlueprint(await getSql(), context.userId, data);
  });

export const listWorkspaceAgentToolProposals = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input) => workspaceBlueprintListInput.parse(input))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { listAgentToolProposals } = await import("@/lib/agent-engineering/tools");
    return listAgentToolProposals(await getSql(), context.userId, data);
  });

export const reviewWorkspaceAgentToolProposal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input) => reviewToolProposalInput.parse(input))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { reviewAgentToolProposal } = await import("@/lib/agent-engineering/tools");
    return reviewAgentToolProposal(await getSql(), context.userId, data);
  });

export const generateWorkspaceAgentWorkflow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input) => workspaceBlueprintInput.parse(input))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { generateWorkflowFromBlueprint } = await import("@/lib/agent-engineering/workflows");
    return generateWorkflowFromBlueprint(await getSql(), context.userId, data);
  });

export const updateWorkspaceAgent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input) => updateAgentInput.parse(input))
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
    const { configuredSecretProvider } = await import("@/lib/connectors/secrets");
    const { dispatchTextMessage } = await import("@/lib/messaging/router");
    const provider = configuredSecretProvider();
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

export const provisionMetaConnectionCredential = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; connectionId: string; accessToken: string; appSecret: string; verifyToken: string; phoneNumberId: string; graphVersion: string; baseUrl?: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { awsSecretsManagerProvisioner, unavailableSecretProvisioner } = await import("@/lib/connectors/secrets");
    const { provisionMetaCredential } = await import("./meta-onboarding");
    const provisioner = process.env.NEXO_SECRETS_BACKEND === "aws" && process.env.AWS_REGION
      ? awsSecretsManagerProvisioner({ region: process.env.AWS_REGION })
      : unavailableSecretProvisioner();
    await provisionMetaCredential(await getSql(), context.userId, data, provisioner);
    return { ok: true as const };
  });

export const listWorkspaceConversations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; status?: "open" | "pending" | "closed"; agentId?: string; search?: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { listConversations } = await import("./server");
    return listConversations(await getSql(), context.userId, data);
  });

export const listWorkspaceConversationMessages = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; conversationId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { listConversationMessages } = await import("./server");
    return listConversationMessages(await getSql(), context.userId, data);
  });

export const markWorkspaceConversationRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; conversationId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { markConversationRead } = await import("./server");
    await markConversationRead(await getSql(), context.userId, data);
    return { ok: true as const };
  });

export const updateWorkspaceConversationHandoff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; conversationId: string; action: "assign" | "release" | "resume" | "close"; reason?: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { updateConversationHandoff } = await import("./server");
    await updateConversationHandoff(await getSql(), context.userId, data);
    return { ok: true as const };
  });

export const sendWorkspaceConversationMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; conversationId: string; text: string; idempotencyKey: string; traceId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { configuredSecretProvider } = await import("@/lib/connectors/secrets");
    const { assertConversationAccess } = await import("./server");
    const { dispatchTextMessage } = await import("@/lib/messaging/router");
    const sql = await getSql();
    const target = await assertConversationAccess(sql, context.userId, data);
    const provider = configuredSecretProvider();
    return dispatchTextMessage(sql, context.userId, {
      workspaceId: data.workspaceId,
      agentId: target.agentId,
      connectionId: target.connectionId,
      conversationId: data.conversationId,
      recipient: target.externalContactId,
      text: data.text,
      idempotencyKey: data.idempotencyKey,
      actor: "user",
      traceId: data.traceId,
    }, provider);
  });

export const listWorkspaceAgentRuntimeExecutions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; status?: "running" | "succeeded" | "failed" | "skipped"; agentId?: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { listAgentRuntimeExecutions } = await import("./server");
    return listAgentRuntimeExecutions(await getSql(), context.userId, data);
  });

export const listWorkspaceWorkflows = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { listWorkflows } = await import("../workflows/server");
    return listWorkflows(await getSql(), context.userId, data);
  });

export const createWorkspaceWorkflow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; name: string; description?: string; triggerType?: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { createWorkflow } = await import("../workflows/server");
    return createWorkflow(await getSql(), context.userId, data);
  });

export const saveWorkspaceWorkflowDefinition = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; workflowId: string; definition: unknown }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { saveWorkflowDefinition } = await import("../workflows/server");
    await saveWorkflowDefinition(await getSql(), context.userId, data);
    return { ok: true as const };
  });

export const getWorkspaceWorkflowDefinition = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; workflowId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { getWorkflowDefinition } = await import("../workflows/server");
    return getWorkflowDefinition(await getSql(), context.userId, data);
  });

export const publishWorkspaceWorkflow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; workflowId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { publishWorkflow } = await import("../workflows/server");
    await publishWorkflow(await getSql(), context.userId, data);
    return { ok: true as const };
  });

export const runWorkspaceWorkflow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input) => workspaceRunInput.parse(input))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { runWorkflowManually } = await import("../workflows/server");
    return runWorkflowManually(await getSql(), context.userId, data);
  });

export const setWorkspaceWorkflowErrorHandler = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; workflowId: string; errorWorkflowId: string | null }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { setWorkflowErrorWorkflow } = await import("../workflows/server");
    await setWorkflowErrorWorkflow(await getSql(), context.userId, data);
    return { ok: true as const };
  });

export const listWorkspaceWorkflowRuns = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; workflowId?: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { listWorkflowRuns } = await import("../workflows/server");
    return listWorkflowRuns(await getSql(), context.userId, data);
  });

export const listWorkspaceWorkflowNodeRuns = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; runId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { listWorkflowNodeRuns } = await import("../workflows/server");
    return listWorkflowNodeRuns(await getSql(), context.userId, data);
  });

export const replayWorkspaceWorkflowRun = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; runId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { replayWorkflowRun } = await import("../workflows/server");
    return replayWorkflowRun(await getSql(), context.userId, data);
  });

export const decideWorkspaceWorkflowApproval = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; approvalId: string; decision: "approved" | "rejected"; reason?: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { decideWorkflowApproval } = await import("../workflows/server");
    await decideWorkflowApproval(await getSql(), context.userId, data);
    return { ok: true as const };
  });


export const listMarketplaceProducts = createServerFn({ method: "GET" })
  .handler(async () => {
    const { getSql } = await import("@/lib/db");
    const { listMarketplaceProducts: list } = await import("@/lib/marketplace/server");
    return list(await getSql());
  });

export const getMarketplaceProduct = createServerFn({ method: "GET" })
  .validator((input: { productId: string }) => input)
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const { getMarketplaceProduct: get } = await import("@/lib/marketplace/server");
    return get(await getSql(), data.productId);
  });

export const listWorkspaceMarketplaceInstallations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { listMarketplaceInstallations } = await import("@/lib/marketplace/server");
    return listMarketplaceInstallations(await getSql(), context.userId, data.workspaceId);
  });

export const installWorkspaceMarketplaceProduct = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; productId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { installMarketplaceProduct } = await import("@/lib/marketplace/server");
    return installMarketplaceProduct(await getSql(), context.userId, data);
  });

export const updateWorkspaceMarketplaceCustomization = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; installationId: string; customizations: JsonObject }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { updateMarketplaceCustomization } = await import("@/lib/marketplace/server");
    await updateMarketplaceCustomization(await getSql(), context.userId, data);
    return { ok: true as const };
  });


export const getWorkspaceMarketplaceInstallation = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; installationId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { getMarketplaceInstallation } = await import("@/lib/marketplace/server");
    return getMarketplaceInstallation(await getSql(), context.userId, data);
  });

export const updateWorkspaceMarketplaceInstallation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; installationId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { updateMarketplaceInstallation } = await import("@/lib/marketplace/server");
    return updateMarketplaceInstallation(await getSql(), context.userId, data);
  });
export const rollbackWorkspaceMarketplaceInstallation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; installationId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { rollbackMarketplaceInstallation } = await import("@/lib/marketplace/server");
    return rollbackMarketplaceInstallation(await getSql(), context.userId, data);
  });

export const getWorkspaceMarketplaceInstallationUpdatePlan = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; installationId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { getMarketplaceInstallationUpdatePlan } = await import("@/lib/marketplace/server");
    return getMarketplaceInstallationUpdatePlan(await getSql(), context.userId, data);
  });

export const listWorkspaceMarketplaceInstallationRevisions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; installationId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { listMarketplaceInstallationRevisions } = await import("@/lib/marketplace/server");
    return listMarketplaceInstallationRevisions(await getSql(), context.userId, data);
  });

export const listWorkspaceMarketplaceInstallationOperationalSummaries = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { listMarketplaceInstallationOperationalSummaries } = await import("@/lib/marketplace/server");
    return listMarketplaceInstallationOperationalSummaries(await getSql(), context.userId, data.workspaceId);
  });

export const getWorkspaceMarketplaceInstallationOperationalSummary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; installationId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { getMarketplaceInstallationOperationalSummary } = await import("@/lib/marketplace/server");
    return getMarketplaceInstallationOperationalSummary(await getSql(), context.userId, data);
  });
export const listWorkspaceIntegrations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { listWorkspaceIntegrations: list } = await import("@/lib/integrations/server");
    return list(await getSql(), context.userId, data.workspaceId);
  });

export const configureWorkspaceCrm = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; pipelineName: string; defaultStage: string; captureFields: string[] }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { configureWorkspaceCrm: configure } = await import("@/lib/integrations/server");
    return configure(await getSql(), context.userId, data);
  });

export const disconnectWorkspaceCrm = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { disconnectWorkspaceCrm: disconnect } = await import("@/lib/integrations/server");
    await disconnect(await getSql(), context.userId, data.workspaceId);
    return { ok: true as const };
  });


export const createWorkspaceKnowledgeDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; title: string; content: string; sourceType?: "text" | "faq" | "markdown" | "url" | "file"; language?: string; sourceUri?: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { createKnowledgeDocument } = await import("@/lib/knowledge/server");
    return createKnowledgeDocument(await getSql(), context.userId, data);
  });

export const createWorkspaceKnowledgeSnapshot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; name: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { createKnowledgeSnapshot } = await import("@/lib/knowledge/server");
    return createKnowledgeSnapshot(await getSql(), context.userId, data);
  });

export const publishWorkspaceKnowledgeSnapshot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; snapshotId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { publishKnowledgeSnapshot } = await import("@/lib/knowledge/server");
    await publishKnowledgeSnapshot(await getSql(), context.userId, data);
    return { ok: true as const };
  });

export const searchWorkspaceKnowledge = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; query: string; limit?: number }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { requireWorkspaceAccess } = await import("./server");
    const { retrieveKnowledge } = await import("@/lib/knowledge/server");
    const sql = await getSql();
    await requireWorkspaceAccess(sql, context.userId, data.workspaceId, "read");
    return retrieveKnowledge(sql, data);
  });


export const createOrUpdateWorkspaceLead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; externalContactId: string; conversationId?: string; name?: string; email?: string; phone?: string; stage?: "new" | "engaged" | "qualifying" | "qualified" | "nurture" | "handoff_pending" | "human_active" | "converted" | "lost"; score?: number; intent?: string; source?: string; qualificationData?: JsonObject; idempotencyKey: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { executeLeadCreateOrUpdate } = await import("@/lib/crm/leads");
    return executeLeadCreateOrUpdate(await getSql(), context.userId, { ...data, requestedBy: "user" });
  });


export const updateWorkspaceLeadQualification = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; externalContactId: string; conversationId?: string; qualificationData: JsonObject; confirmedFields?: string[]; stage?: "new" | "engaged" | "qualifying" | "qualified" | "nurture" | "handoff_pending" | "human_active" | "converted" | "lost"; score?: number; idempotencyKey: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { executeLeadUpdateQualification } = await import("@/lib/crm/leads");
    return executeLeadUpdateQualification(await getSql(), context.userId, { ...data, requestedBy: "user" });
  });


export const createWorkspaceQualificationPolicy = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; productId?: string; name: string; minimumScore: number; criteria: import("@/lib/crm/qualification").QualificationCriterion[] }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { createQualificationPolicy } = await import("@/lib/crm/qualification");
    return createQualificationPolicy(await getSql(), context.userId, data);
  });

export const publishWorkspaceQualificationPolicy = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; policyId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { publishQualificationPolicy } = await import("@/lib/crm/qualification");
    await publishQualificationPolicy(await getSql(), context.userId, data);
    return { ok: true as const };
  });

export const evaluateWorkspaceLeadQualification = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; externalContactId: string; productId?: string; agentId?: string; conversationId?: string; traceId?: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { evaluateQualification } = await import("@/lib/crm/qualification");
    return evaluateQualification(await getSql(), context.userId, data);
  });


export const createWorkspaceAssignmentRule = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; productId?: string; name: string; mode?: "round_robin" | "least_loaded"; ownerIds?: string[] }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { createAssignmentRule } = await import("@/lib/crm/assignment");
    return createAssignmentRule(await getSql(), context.userId, data);
  });

export const publishWorkspaceAssignmentRule = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; ruleId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { publishAssignmentRule } = await import("@/lib/crm/assignment");
    await publishAssignmentRule(await getSql(), context.userId, data);
    return { ok: true as const };
  });

export const assignWorkspaceLeadOwner = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; externalContactId: string; conversationId?: string; ownerId?: string; productId?: string; idempotencyKey: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { executeLeadAssignOwner } = await import("@/lib/crm/assignment");
    return executeLeadAssignOwner(await getSql(), context.userId, { ...data, requestedBy: "user" });
  });


export const createWorkspaceLeadFollowUp = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; externalContactId: string; conversationId?: string; agentId: string; connectionId: string; cadenceId?: string; message: string; scheduledAt: string; stepNumber?: number; maxAttempts?: number; idempotencyKey: string; traceId?: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { executeLeadCreateFollowUp } = await import("@/lib/crm/follow-ups");
    return executeLeadCreateFollowUp(await getSql(), context.userId, { ...data, requestedBy: "user" });
  });


export const getWorkspaceLeadMetrics = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; from?: string; to?: string; agentId?: string; productId?: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { getLeadMetrics } = await import("@/lib/crm/metrics");
    return getLeadMetrics(await getSql(), context.userId, data);
  });

export const provisionWorkspaceAvailabilitySlots = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; slots: { startAt: string; endAt: string; resourceLabel?: string }[] }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { provisionAvailabilitySlots } = await import("@/lib/calendar/server");
    return { created: await provisionAvailabilitySlots(await getSql(), context.userId, data) };
  });

export const listWorkspaceAvailabilitySlots = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; from?: string; to?: string; status?: "available" | "booked" | "blocked"; limit?: number }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { listWorkspaceAvailabilitySlots: listSlots } = await import("@/lib/calendar/server");
    return listSlots(await getSql(), context.userId, data);
  });

export const blockWorkspaceAvailabilitySlot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; slotId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { blockAvailabilitySlot } = await import("@/lib/calendar/server");
    await blockAvailabilitySlot(await getSql(), context.userId, data);
    return { ok: true as const };
  });

export const bookWorkspaceAvailabilitySlot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; slotId: string; externalContactId: string; conversationId?: string; customerName?: string; notes?: string; idempotencyKey: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { bookAvailabilitySlot } = await import("@/lib/calendar/server");
    return bookAvailabilitySlot(await getSql(), context.userId, data);
  });


export const createWorkspaceImprovementCandidate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; caseId: string; candidateType?: "prompt" | "policy" | "manifest" | "cadence" }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { requireWorkspaceAccess } = await import("./server");
    const { createImprovementCandidate } = await import("@/lib/learning/lab");
    const sql = await getSql(); await requireWorkspaceAccess(sql, context.userId, data.workspaceId, "manage");
    return createImprovementCandidate(sql, { ...data, requestedBy: context.userId });
  });

export const listWorkspaceImprovementCandidates = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; status?: "draft" | "review" | "approved" | "rejected" | "applied" }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { listImprovementCandidates } = await import("@/lib/learning/lab");
    return listImprovementCandidates(await getSql(), context.userId, data);
  });

export const reviewWorkspaceImprovementCandidate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; candidateId: string; decision: "approved" | "rejected" }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { reviewImprovementCandidate } = await import("@/lib/learning/lab");
    await reviewImprovementCandidate(await getSql(), context.userId, data);
    return { ok: true as const };
  });


export const listWorkspaceTools = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { listWorkspaceTools } = await import("@/lib/connectors/tools-server");
    return listWorkspaceTools(await getSql(), context.userId, data.workspaceId);
  });

export const listWorkspaceAgentToolPermissions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; agentVersionId: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { listAgentToolPermissions } = await import("@/lib/connectors/tools-server");
    return listAgentToolPermissions(await getSql(), context.userId, data);
  });

export const setWorkspaceAgentToolPermission = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; agentVersionId: string; toolId: string; enabled: boolean; requireApproval?: boolean; allowedScopes?: JsonObject }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { setAgentToolPermission } = await import("@/lib/connectors/tools-server");
    return setAgentToolPermission(await getSql(), context.userId, data);
  });

export const requestWorkspaceToolExecutionApproval = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; toolExecutionId: string; reason?: string; expiresInMinutes?: number }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { requestToolExecutionApproval } = await import("@/lib/connectors/tools-server");
    return requestToolExecutionApproval(await getSql(), context.userId, data);
  });

export const decideWorkspaceToolExecutionApproval = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; approvalId: string; decision: "approved" | "rejected"; reason?: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { decideToolExecutionApproval } = await import("@/lib/connectors/tools-server");
    await decideToolExecutionApproval(await getSql(), context.userId, data);
    return { ok: true as const };
  });

export const listWorkspaceToolExecutionApprovals = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; status?: "pending" | "approved" | "rejected" | "expired" }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { listToolExecutionApprovals } = await import("@/lib/connectors/tools-server");
    return listToolExecutionApprovals(await getSql(), context.userId, data);
  });


export const chatNexoBot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; messages: { role: "user" | "assistant"; content: string }[] }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { chatNexoBot: runChat } = await import("@/lib/nexo-bot/server");
    return runChat(await getSql(), context.userId, data);
  });

export const executeNexoBotAction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; action: import("@/lib/nexo-bot/server").NexoBotAction }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { executeNexoBotAction: runAction } = await import("@/lib/nexo-bot/server");
    return runAction(await getSql(), context.userId, data);
  });


export const listNexoBotAuditEvents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; eventType?: import("@/lib/nexo-bot/audit").NexoBotAuditEventType; actionType?: string; status?: import("@/lib/nexo-bot/audit").NexoBotAuditStatus; from?: string; to?: string; limit?: number }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { listNexoBotAuditEvents: listEvents } = await import("@/lib/nexo-bot/audit");
    return listEvents(await getSql(), context.userId, data);
  });

export const getNexoBotAuditSummary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; from?: string; to?: string }) => input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { getNexoBotAuditSummary: getSummary } = await import("@/lib/nexo-bot/audit");
    return getSummary(await getSql(), context.userId, data);
  });
