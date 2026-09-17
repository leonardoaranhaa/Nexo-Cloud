import type { Connection, Provider } from "./types";

export function webhookUrl(connection: Connection) {
  if (connection.provider === "evolution") {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:8081";
    return `${origin}/api/webhooks/evolution/${encodeURIComponent(connection.instance || "instance")}`;
  }
  if (connection.provider === "zapi") {
    return `https://api.z-api.io/instances/${connection.instance || "sandbox"}/token/webhook`;
  }
  if (connection.provider === "meta") {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:8081";
    return `${origin}/api/webhooks/meta/${connection.id}`;
  }
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:8081";
  return `${origin}/webhook`;
}

export function inboundPayload(provider: Provider, phone: string, text: string) {
  if (provider === "meta") {
    return {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: phone,
                    type: "text",
                    text: { body: text },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
  }
  if (provider === "evolution") {
    return {
      event: "messages.upsert",
      data: {
        key: { remoteJid: `${phone}@s.whatsapp.net` },
        message: { conversation: text },
      },
    };
  }
  return { phone, message: text };
}

export function simulatedPhone(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const tail = String(10000000 + (h % 89999999));
  return `55119${tail.slice(0, 8)}`;
}
