import type { Connection, Provider } from "./types";

export function webhookUrl(connection: Connection) {
  if (connection.provider === "evolution") {
    const base = connection.baseUrl?.replace(/\/$/, "") || "https://evo.nexo.local";
    return `${base}/webhook/${connection.instance || "instance"}`;
  }
  if (connection.provider === "zapi") {
    return `https://api.z-api.io/instances/${connection.instance || "sandbox"}/token/webhook`;
  }
  return "https://seu-dominio.com/webhook";
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
