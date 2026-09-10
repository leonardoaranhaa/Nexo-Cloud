import type { AgentStatus, ConnectionStatus, Provider } from "./types";

export const CONNECTION_STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: "Conectado",
  qr: "Aguardando QR",
  disconnected: "Desconectado",
  error: "Erro",
};

export const AGENT_STATUS_LABEL: Record<AgentStatus, string> = {
  draft: "Rascunho",
  live: "No ar",
  paused: "Pausado",
};

export const TEMPLATE_LABEL: Record<string, string> = {
  support: "Atendimento",
  sales: "Vendas",
  booking: "Agendamento",
  faq: "FAQ / RAG",
  blank: "Em branco",
};

export const LANGUAGE_LABEL: Record<"pt" | "en" | "es", string> = {
  pt: "Português",
  en: "English",
  es: "Español",
};

export function providerShort(p: Provider) {
  if (p === "evolution") return "Evolution";
  if (p === "meta") return "Meta Cloud";
  return "Z-API";
}
