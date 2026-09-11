import { randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";
import { createAgent, requireWorkspaceAccess, type WorkspacePermission } from "../multitenancy/server.ts";
import { provisionAvailabilitySlots } from "../calendar/server.ts";
import { env } from "../env.server.ts";

export type NexoBotMessage = { role: "user" | "assistant"; content: string };
export type NexoBotRoute = "/agents" | "/connections" | "/calendar" | "/marketplace" | "/settings";

export type NexoBotAction =
  | { id: string; type: "navigate"; label: string; summary: string; requiresConfirmation: false; route: NexoBotRoute }
  | { id: string; type: "create_agent"; label: string; summary: string; requiresConfirmation: true; name: string; agentType: string; persona: string; welcomeMessage: string; systemPrompt: string }
  | { id: string; type: "provision_calendar_slot"; label: string; summary: string; requiresConfirmation: true; startAt: string; endAt: string; resourceLabel: string };

export type NexoBotChatResult =
  | { ok: true; text: string; action?: NexoBotAction }
  | { ok: false; error: "LLM_UNAVAILABLE" | "LLM_ERROR" | "ACTION_INVALID"; message: string };

type AnthropicResponse = {
  content?: Array<
    | { type: "text"; text?: string }
    | { type: "tool_use"; id?: string; name?: string; input?: Record<string, unknown> }
  >;
};

const ROUTES: Record<string, { route: NexoBotRoute; label: string }> = {
  agents: { route: "/agents", label: "Abrir Agentes" },
  connections: { route: "/connections", label: "Abrir Conectores" },
  calendar: { route: "/calendar", label: "Abrir Agenda" },
  marketplace: { route: "/marketplace", label: "Abrir Marketplace" },
  settings: { route: "/settings", label: "Abrir Configurações" },
};

function text(value: unknown, max: number, fallback = ""): string {
  return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}

function isoDate(value: unknown): string | null {
  const parsed = new Date(text(value, 80));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function formatActionDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function cleanAssistantText(value: string): string {
  return value
    .replace(/\\\*\\\*/g, "")
    .replace(/\*\*/g, "")
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/^\s*[-|]{3,}\s*$/gm, "")
    .replace(/\|/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, 3000);
}

export function normalizeNexoBotAction(input: Record<string, unknown>): NexoBotAction | null {
  const action = text(input.action, 40).toLowerCase();
  if (action === "navigate") {
    const target = ROUTES[text(input.target, 40).toLowerCase()];
    if (!target) return null;
    return { id: randomUUID(), type: "navigate", label: target.label, summary: `Navegar para ${target.route}.`, requiresConfirmation: false, route: target.route };
  }
  if (action === "create_agent") {
    const name = text(input.name, 120);
    if (!name) return null;
    const agentType = ["support", "sales", "marketing", "ads", "traffic", "operations", "custom"].includes(text(input.agentType, 30)) ? text(input.agentType, 30) : "custom";
    const persona = text(input.persona, 500);
    const welcomeMessage = text(input.welcomeMessage, 1000, "Olá! Como posso ajudar?");
    const systemPrompt = text(input.systemPrompt, 8000);
    if (!systemPrompt) return null;
    return { id: randomUUID(), type: "create_agent", label: "Criar agente", summary: `Criar o agente “${name}” como ${agentType}.`, requiresConfirmation: true, name, agentType, persona, welcomeMessage, systemPrompt };
  }
  if (action === "provision_calendar_slot") {
    const startAt = isoDate(input.startAt);
    const endAt = isoDate(input.endAt);
    if (!startAt || !endAt || new Date(endAt) <= new Date(startAt)) return null;
    const resourceLabel = text(input.resourceLabel, 120, "Agenda geral");
    return { id: randomUUID(), type: "provision_calendar_slot", label: "Adicionar horário", summary: `Adicionar horário de ${formatActionDate(startAt)} até ${formatActionDate(endAt)} para ${resourceLabel}.`, requiresConfirmation: true, startAt, endAt, resourceLabel };
  }
  return null;
}

function validateConfirmedAction(input: NexoBotAction): NexoBotAction | null {
  if (input.type === "navigate") {
    const target = Object.values(ROUTES).find((candidate) => candidate.route === input.route);
    if (!target || input.requiresConfirmation !== false) return null;
    return { id: input.id, type: "navigate", label: target.label, summary: `Navegar para ${target.route}.`, requiresConfirmation: false, route: target.route };
  }
  const candidate = input.type === "create_agent"
    ? { action: "create_agent", name: input.name, agentType: input.agentType, persona: input.persona, welcomeMessage: input.welcomeMessage, systemPrompt: input.systemPrompt }
    : { action: "provision_calendar_slot", startAt: input.startAt, endAt: input.endAt, resourceLabel: input.resourceLabel };
  const normalized = normalizeNexoBotAction(candidate);
  if (!normalized || normalized.type !== input.type || !normalized.requiresConfirmation || !input.requiresConfirmation) return null;
  return { ...normalized, id: input.id } as NexoBotAction;
}

async function loadWorkspaceContext(sql: Sql, userId: string, workspaceId: string) {
  await requireWorkspaceAccess(sql, userId, workspaceId, "read");
  const [workspace, agents, connections] = await Promise.all([
    sql<{ name: string; environment: string }>`select name, environment from workspaces where id = ${workspaceId} limit 1`,
    sql<{ count: string }>`select count(*)::text as count from agents where workspace_id = ${workspaceId} and deleted_at is null`,
    sql<{ count: string }>`select count(*)::text as count from connections where workspace_id = ${workspaceId} and deleted_at is null`,
  ]);
  return { name: workspace[0]?.name ?? "workspace atual", environment: workspace[0]?.environment ?? "development", agents: agents[0]?.count ?? "0", connections: connections[0]?.count ?? "0" };
}

async function callAnthropic(input: { system: string; messages: NexoBotMessage[] }): Promise<NexoBotChatResult> {
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) return { ok: false, error: "LLM_UNAVAILABLE", message: "O LLM do Nexo Bot não está configurado neste ambiente." };
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 900,
        system: input.system,
        messages: input.messages.slice(-12).map((message) => ({ role: message.role, content: message.content.slice(0, 3000) })),
        tools: [{
          name: "propose_action",
          description: "Propõe uma ação do console. Nunca use para executar a ação. Use somente quando a intenção e os parâmetros forem claros.",
          input_schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              action: { type: "string", enum: ["navigate", "create_agent", "provision_calendar_slot"] },
              target: { type: "string", enum: ["agents", "connections", "calendar", "marketplace", "settings"] },
              name: { type: "string" },
              agentType: { type: "string", enum: ["support", "sales", "marketing", "ads", "traffic", "operations", "custom"] },
              persona: { type: "string" },
              welcomeMessage: { type: "string" },
              systemPrompt: { type: "string" },
              startAt: { type: "string" },
              endAt: { type: "string" },
              resourceLabel: { type: "string" },
            },
            required: ["action"],
          },
        }],
        tool_choice: { type: "auto" },
      }),
    });
    if (!response.ok) return { ok: false, error: "LLM_ERROR", message: "O Nexo Bot não conseguiu consultar o modelo agora. Tente novamente." };
    const body = (await response.json()) as AnthropicResponse;
    const blocks = body.content ?? [];
    const responseText = cleanAssistantText(blocks.filter((block): block is { type: "text"; text?: string } => block.type === "text").map((block) => block.text ?? "").join(" "));
    const tool = blocks.find((block): block is { type: "tool_use"; id?: string; name?: string; input?: Record<string, unknown> } => block.type === "tool_use");
    const action = tool?.name === "propose_action" && tool.input ? normalizeNexoBotAction(tool.input) : null;
    if (tool?.name === "propose_action" && !action) return { ok: false, error: "ACTION_INVALID", message: "O Nexo Bot identificou uma ação, mas os parâmetros precisam ser esclarecidos." };
    return { ok: true, text: responseText || "Posso ajudar com essa tarefa. Diga-me o que deseja fazer no console.", ...(action ? { action } : {}) };
  } catch {
    return { ok: false, error: "LLM_ERROR", message: "Não foi possível conectar o Nexo Bot ao modelo agora." };
  }
}

export async function chatNexoBot(sql: Sql, userId: string, input: { workspaceId: string; messages: NexoBotMessage[] }): Promise<NexoBotChatResult> {
  const context = await loadWorkspaceContext(sql, userId, input.workspaceId);
  const safeMessages = input.messages.filter((message) => message && (message.role === "user" || message.role === "assistant") && typeof message.content === "string").slice(-12);
  return callAnthropic({
    system: `Você é o Nexo Bot, assistente operacional do Nexo Cloud, uma plataforma de infraestrutura para agentes de IA. Responda em português brasileiro com clareza e concisão. Use texto simples, sem Markdown, tabelas, hashtags, emojis ou asteriscos. Ajude a pessoa a entender o produto e concluir tarefas no console. Nunca invente dados, integrações, preços ou estados. Nunca diga que executou uma ação: apenas proponha uma ação usando propose_action. Para escritas, peça confirmação por meio da proposta. Não proponha exclusão, alteração de permissões, publicação, credenciais, chamadas externas ou ações financeiras. Contexto não sensível do workspace: nome=${context.name}; ambiente=${context.environment}; agentes=${context.agents}; conexões=${context.connections}.`,
    messages: safeMessages.length > 0 ? safeMessages : [{ role: "user", content: "Apresente-se e pergunte como pode ajudar." }],
  });
}

export async function executeNexoBotAction(sql: Sql, userId: string, input: { workspaceId: string; action: NexoBotAction }): Promise<{ ok: true; message: string; resourceId?: string } | { ok: false; message: string }> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  const action = validateConfirmedAction(input.action);
  if (!action) return { ok: false, message: "A ação não passou pela validação do servidor." };
  if (action.type === "navigate") return { ok: true, message: `Ação pronta: ${action.route}.` };
  if (action.type === "create_agent") {
    await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
    const result = await createAgent(sql, userId, { workspaceId: input.workspaceId, name: action.name, agentType: action.agentType, persona: action.persona, welcomeMessage: action.welcomeMessage, systemPrompt: action.systemPrompt });
    return { ok: true, message: `Agente “${action.name}” criado como rascunho.`, resourceId: result.id };
  }
  const permission: WorkspacePermission = "manage";
  await requireWorkspaceAccess(sql, userId, input.workspaceId, permission);
  const created = await provisionAvailabilitySlots(sql, userId, { workspaceId: input.workspaceId, slots: [{ startAt: action.startAt, endAt: action.endAt, resourceLabel: action.resourceLabel }] });
  return { ok: true, message: created > 0 ? "Horário adicionado à Agenda." : "Esse horário já estava cadastrado." };
}
