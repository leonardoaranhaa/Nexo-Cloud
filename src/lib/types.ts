export type Provider = "evolution" | "meta" | "zapi";

export type ConnectionStatus = "connected" | "qr" | "disconnected" | "error";

export type AgentStatus = "draft" | "live" | "paused";

export type Connection = {
  id: string;
  name: string;
  provider: Provider;
  status: ConnectionStatus;
  phone?: string;
  instance?: string;
  phoneNumberId?: string;
  baseUrl?: string;
  createdAt: number;
  lastEventAt?: number;
};

export type Faq = {
  id: string;
  q: string;
  a: string;
};

export type Agent = {
  id: string;
  name: string;
  persona: string;
  welcomeMessage: string;
  systemPrompt: string;
  language: "pt" | "en" | "es";
  connectionId: string | null;
  status: AgentStatus;
  temperature: number;
  maxTokens: number;
  memoryWindow: number;
  template: string;
  knowledge: {
    faqs: Faq[];
    notes: string;
  };
  tools: {
    handoff: boolean;
    handoffKeywords: string;
    hoursEnabled: boolean;
    hoursStart: string;
    hoursEnd: string;
    catalog: boolean;
    audio: boolean;
  };
  createdAt: number;
  updatedAt: number;
};

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  at: number;
  kind?: "text" | "audio" | "handoff" | "closed";
};

export type TraceStatus = "idle" | "running" | "ok" | "skip" | "block";

export type TraceStep = {
  nodeId: string;
  status: TraceStatus;
  detail: string;
};

export type StudioEvent = {
  id: string;
  at: number;
  kind: "agent" | "connection" | "test" | "publish";
  text: string;
};

export type FlowNodeId =
  | "inbound"
  | "hours"
  | "memory"
  | "knowledge"
  | "agent"
  | "handoff"
  | "outbound";

export const PROVIDER_LABEL: Record<Provider, string> = {
  evolution: "Evolution API",
  meta: "Meta Cloud API",
  zapi: "Z-API",
};

export const PROVIDER_HINT: Record<Provider, string> = {
  evolution: "QR Code · auto-hospedada · Baileys",
  meta: "Oficial · por conversa · verificação Meta",
  zapi: "Instância pronta · token HTTP",
};
