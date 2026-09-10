import type { Agent, Faq } from "@/lib/types";
import type { AgentRecord, JsonObject } from "./server";

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asFaqs(value: unknown): Faq[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry, index) => {
      const row = entry as Record<string, unknown>;
      return {
        id: asText(row.id) || `faq_${index + 1}`,
        q: asText(row.q),
        a: asText(row.a),
      };
    })
    .filter((faq) => faq.q || faq.a);
}

function epoch(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function agentRecordToUi(record: AgentRecord): Agent {
  const knowledge = record.knowledge ?? {};
  const tools = record.tools ?? {};
  const metadata = record.metadata ?? {};
  const status: Agent["status"] = record.status === "active" ? "live" : record.status === "archived" ? "paused" : record.status;

  return {
    id: record.id,
    name: record.name,
    persona: record.persona,
    welcomeMessage: record.welcomeMessage,
    systemPrompt: record.systemPrompt,
    language: record.language,
    connectionId: record.connectionId,
    status,
    temperature: record.temperature,
    maxTokens: record.maxTokens,
    memoryWindow: record.memoryWindow,
    template: asText(metadata.template) || record.agentType,
    knowledge: {
      faqs: asFaqs(knowledge.faqs),
      notes: asText(knowledge.notes),
    },
    tools: {
      handoff: asBoolean(tools.handoff),
      handoffKeywords: asText(tools.handoffKeywords),
      hoursEnabled: asBoolean(tools.hoursEnabled),
      hoursStart: asText(tools.hoursStart) || "08:00",
      hoursEnd: asText(tools.hoursEnd) || "18:00",
      catalog: asBoolean(tools.catalog),
      audio: asBoolean(tools.audio),
    },
    createdAt: epoch(record.createdAt),
    updatedAt: epoch(record.updatedAt),
  };
}

export function uiAgentToPersisted(agent: Agent): {
  name: string;
  persona: string;
  welcomeMessage: string;
  systemPrompt: string;
  language: Agent["language"];
  status: Agent["status"];
  temperature: number;
  maxTokens: number;
  memoryWindow: number;
  knowledge: JsonObject;
  tools: JsonObject;
  metadata: JsonObject;
} {
  return {
    name: agent.name,
    persona: agent.persona,
    welcomeMessage: agent.welcomeMessage,
    systemPrompt: agent.systemPrompt,
    language: agent.language,
    status: agent.status,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
    memoryWindow: agent.memoryWindow,
    knowledge: {
      notes: agent.knowledge.notes,
      faqs: agent.knowledge.faqs.map((faq) => ({ id: faq.id, q: faq.q, a: faq.a })),
    },
    tools: { ...agent.tools },
    metadata: { template: agent.template },
  };
}
