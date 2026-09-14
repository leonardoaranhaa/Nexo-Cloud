export type ConnectorProvider = "evolution" | "meta" | "instagram" | "messenger" | "zapi";

export type ConnectorDefinition = {
  id: string;
  key: string;
  name: string;
  provider: ConnectorProvider;
  capabilities: readonly string[];
  requiresSecret: boolean;
};

export const CONNECTOR_DEFINITIONS: readonly ConnectorDefinition[] = [
  {
    id: "connector_def_evolution",
    key: "whatsapp_evolution",
    name: "WhatsApp · Evolution API",
    provider: "evolution",
    capabilities: ["healthcheck", "webhook", "qr"],
    requiresSecret: true,
  },
  {
    id: "connector_def_meta",
    key: "whatsapp_meta",
    name: "WhatsApp · Meta Cloud API",
    provider: "meta",
    capabilities: ["healthcheck", "webhook", "templates"],
    requiresSecret: true,
  },
  {
    id: "connector_def_zapi",
    key: "whatsapp_zapi",
    name: "WhatsApp · Z-API",
    provider: "zapi",
    capabilities: ["healthcheck", "webhook", "qr"],
    requiresSecret: true,
  },
  {
    id: "connector_def_instagram",
    key: "instagram_messaging",
    name: "Instagram · Messaging API",
    provider: "instagram",
    capabilities: ["healthcheck", "webhook", "messaging", "handoff"],
    requiresSecret: true,
  },
  {
    id: "connector_def_messenger",
    key: "messenger_platform",
    name: "Messenger · Platform API",
    provider: "messenger",
    capabilities: ["healthcheck", "webhook", "messaging", "handoff"],
    requiresSecret: true,
  },
];

export function connectorDefinitionForProvider(provider: string): ConnectorDefinition | null {
  return CONNECTOR_DEFINITIONS.find((definition) => definition.provider === provider) ?? null;
}

export function connectorDefinitionForKey(key: string): ConnectorDefinition | null {
  return CONNECTOR_DEFINITIONS.find((definition) => definition.key === key) ?? null;
}
