import { composeSystemPrompt } from "./prompt";
import type { Agent, Connection } from "./types";

function pyString(s: string) {
  return JSON.stringify(s);
}

export function pythonExport(agent: Agent, connection?: Connection | null) {
  const prompt = composeSystemPrompt(agent);
  const provider = connection?.provider ?? "meta";
  return `#!/usr/bin/env python3
"""
Nexo — ${agent.name}
Gerado pelo estúdio. WhatsApp + Grok (xAI) com memória por telefone.

Provedor sugerido: ${provider}
${connection?.provider === "evolution" ? "Evolution: POST /message/sendText/{instance}" : "Meta Cloud API: POST /{phone_number_id}/messages"}
"""
import os
import time
from collections import defaultdict, deque
from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

XAI_API_KEY = os.environ["XAI_API_KEY"]
XAI_MODEL = "grok-4.5"
WHATSAPP_TOKEN = os.environ.get("WHATSAPP_TOKEN", "")
PHONE_NUMBER_ID = os.environ.get("PHONE_NUMBER_ID", ${pyString(connection?.phoneNumberId ?? "")})
EVOLUTION_BASE = os.environ.get("EVOLUTION_BASE", ${pyString(connection?.baseUrl ?? "http://localhost:8080")})
EVOLUTION_INSTANCE = os.environ.get("EVOLUTION_INSTANCE", ${pyString(connection?.instance ?? "")})
EVOLUTION_KEY = os.environ.get("EVOLUTION_KEY", "")
PROVIDER = os.environ.get("PROVIDER", ${pyString(provider)})
VERIFY_TOKEN = os.environ.get("VERIFY_TOKEN", "nexo-verify")

SYSTEM_PROMPT = ${pyString(prompt)}
MEMORY_WINDOW = ${agent.memoryWindow}
MAX_TOKENS = ${agent.maxTokens}
TEMPERATURE = ${agent.temperature}
HANDOFF_KEYWORDS = [k.strip().lower() for k in ${pyString(agent.tools.handoffKeywords)}.split(",") if k.strip()]
HOURS = (${pyString(agent.tools.hoursStart)}, ${pyString(agent.tools.hoursEnd)})
HOURS_ENABLED = ${agent.tools.hoursEnabled ? "True" : "False"}

memory = defaultdict(lambda: deque(maxlen=MEMORY_WINDOW))


def within_hours():
    if not HOURS_ENABLED:
        return True
    now = time.localtime()
    cur = now.tm_hour * 60 + now.tm_min
    h1, m1 = map(int, HOURS[0].split(":"))
    h2, m2 = map(int, HOURS[1].split(":"))
    start, end = h1 * 60 + m1, h2 * 60 + m2
    if end <= start:
        return cur >= start or cur <= end
    return start <= cur <= end


def wants_human(text: str) -> bool:
    hay = text.lower()
    return any(k in hay for k in HANDOFF_KEYWORDS)


def grok_reply(user_phone: str, user_text: str) -> str:
    history = list(memory[user_phone])
    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + history + [
        {"role": "user", "content": user_text}
    ]
    r = requests.post(
        "https://api.x.ai/v1/chat/completions",
        headers={"Authorization": f"Bearer {XAI_API_KEY}", "Content-Type": "application/json"},
        json={"model": XAI_MODEL, "messages": messages, "max_tokens": MAX_TOKENS, "temperature": TEMPERATURE},
        timeout=45,
    )
    r.raise_for_status()
    text = r.json()["choices"][0]["message"]["content"]
    memory[user_phone].append({"role": "user", "content": user_text})
    memory[user_phone].append({"role": "assistant", "content": text})
    return text


def send_whatsapp(phone: str, text: str):
    if PROVIDER == "evolution":
        url = f"{EVOLUTION_BASE.rstrip('/')}/message/sendText/{EVOLUTION_INSTANCE}"
        headers = {"apikey": EVOLUTION_KEY, "Content-Type": "application/json"}
        payload = {"number": phone, "text": text}
    else:
        url = f"https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages"
        headers = {"Authorization": f"Bearer {WHATSAPP_TOKEN}", "Content-Type": "application/json"}
        payload = {
            "messaging_product": "whatsapp",
            "to": phone,
            "type": "text",
            "text": {"body": text},
        }
    requests.post(url, json=payload, headers=headers, timeout=20).raise_for_status()


@app.get("/webhook")
def verify():
    mode = request.args.get("hub.mode")
    token = request.args.get("hub.verify_token")
    challenge = request.args.get("hub.challenge")
    if mode == "subscribe" and token == VERIFY_TOKEN:
        return challenge or "", 200
    return "forbidden", 403


@app.post("/webhook")
def webhook():
    data = request.get_json(silent=True) or {}
    # Meta Cloud
    try:
        msg = data["entry"][0]["changes"][0]["value"]["messages"][0]
        phone = msg["from"]
        text = msg.get("text", {}).get("body") or ""
    except Exception:
        # Evolution / genérico
        phone = str(data.get("phone") or data.get("sender") or "")
        text = str(data.get("message") or data.get("text") or "")
        if not text and isinstance(data.get("data"), dict):
            text = str(data["data"].get("message", {}).get("conversation") or "")
            phone = phone or str(data["data"].get("key", {}).get("remoteJid") or "")

    if not phone or not text:
        return jsonify({"status": "ignored"}), 200

    if not within_hours():
        send_whatsapp(phone, "Estamos fora do horário. Respondemos no próximo expediente.")
        return jsonify({"status": "closed"}), 200

    if wants_human(text):
        send_whatsapp(phone, "Vou te passar para alguém do time. Um minuto.")
        return jsonify({"status": "handoff"}), 200

    reply = grok_reply(phone, text)
    send_whatsapp(phone, reply)
    return jsonify({"status": "ok"}), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
`;
}

export function n8nExport(agent: Agent, connection?: Connection | null) {
  const prompt = composeSystemPrompt(agent);
  const name = `Nexo — ${agent.name}`;
  const path = agent.id.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  const evoUrl =
    connection?.provider === "evolution"
      ? `${connection.baseUrl ?? "https://evolution.local"}/message/sendText/${connection.instance ?? "instance"}`
      : "https://graph.facebook.com/v21.0/PHONE_NUMBER_ID/messages";

  return JSON.stringify(
    {
      name,
      nodes: [
        {
          parameters: {
            httpMethod: "POST",
            path,
            responseMode: "onReceived",
            options: {},
          },
          id: "n_webhook",
          name: "Webhook WhatsApp",
          type: "n8n-nodes-base.webhook",
          typeVersion: 2,
          position: [0, 300],
          webhookId: path,
        },
        {
          parameters: {
            assignments: {
              assignments: [
                {
                  id: "a1",
                  name: "text",
                  value: "={{ $json.message ?? $json.text ?? $json.body }}",
                  type: "string",
                },
                {
                  id: "a2",
                  name: "phone",
                  value: "={{ $json.phone ?? $json.sender ?? $json.from }}",
                  type: "string",
                },
              ],
            },
          },
          id: "n_parse",
          name: "Extrair mensagem",
          type: "n8n-nodes-base.set",
          typeVersion: 3.4,
          position: [240, 300],
        },
        {
          parameters: {
            sessionIdType: "customKey",
            sessionKey: "={{ $json.phone }}",
            contextWindowLength: agent.memoryWindow,
          },
          id: "n_memory",
          name: "Memória",
          type: "@n8n/n8n-nodes-langchain.memoryBufferWindow",
          typeVersion: 1.3,
          position: [480, 480],
        },
        {
          parameters: {
            model: "grok-4.5",
            options: { temperature: agent.temperature, maxTokens: agent.maxTokens },
          },
          id: "n_model",
          name: "Grok (xAI)",
          type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
          typeVersion: 1.2,
          position: [480, 160],
          credentials: { openAiApi: { name: "xAI", id: "xai" } },
        },
        {
          parameters: {
            promptType: "define",
            text: "={{ $json.text }}",
            options: { systemMessage: prompt },
          },
          id: "n_agent",
          name: "Agente IA",
          type: "@n8n/n8n-nodes-langchain.agent",
          typeVersion: 1.7,
          position: [720, 300],
        },
        {
          parameters: {
            method: "POST",
            url: evoUrl,
            sendHeaders: true,
            headerParameters: {
              parameters: [
                { name: "Content-Type", value: "application/json" },
                { name: "Authorization", value: "Bearer {{$credentials.token}}" },
              ],
            },
            sendBody: true,
            specifyBody: "json",
            jsonBody:
              connection?.provider === "evolution"
                ? '={ "number": "{{ $json.phone }}", "text": "{{ $json.output }}" }'
                : '={ "messaging_product": "whatsapp", "to": "{{ $json.phone }}", "type": "text", "text": { "body": "{{ $json.output }}" } }',
          },
          id: "n_send",
          name: "Enviar WhatsApp",
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 4.2,
          position: [980, 300],
        },
      ],
      connections: {
        "Webhook WhatsApp": {
          main: [[{ node: "Extrair mensagem", type: "main", index: 0 }]],
        },
        "Extrair mensagem": {
          main: [[{ node: "Agente IA", type: "main", index: 0 }]],
        },
        "Grok (xAI)": {
          ai_languageModel: [[{ node: "Agente IA", type: "ai_languageModel", index: 0 }]],
        },
        Memória: {
          ai_memory: [[{ node: "Agente IA", type: "ai_memory", index: 0 }]],
        },
        "Agente IA": {
          main: [[{ node: "Enviar WhatsApp", type: "main", index: 0 }]],
        },
      },
      settings: { executionOrder: "v1" },
      meta: { nexoAgentId: agent.id, nexoTemplate: agent.template },
    },
    null,
    2,
  );
}
