import crypto from "node:crypto";

const graphVersion = process.env.META_GRAPH_VERSION || "v26.0";
const token = process.env.META_ACCESS_TOKEN;
const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
const wabaId = process.env.META_WABA_ID;
const appSecret = process.env.META_APP_SECRET;
const verifyToken = process.env.META_VERIFY_TOKEN;
const callback = process.env.META_WEBHOOK_URL || "https://8080-idiou4gtqc0gfj1eyqhpl-f734547d.us4.manus.computer/api/webhooks/meta/meta-test";
const recipient = process.env.META_TEST_RECIPIENT;

function requireValue(value, name) {
  if (!value?.trim()) throw new Error(`${name}_MISSING`);
  return value.trim();
}
function result(name, ok, detail) { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); }
async function api(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { response, body };
}

const errors = [];
try {
  requireValue(token, "META_ACCESS_TOKEN");
  requireValue(phoneNumberId, "META_PHONE_NUMBER_ID");
  requireValue(wabaId, "META_WABA_ID");
  requireValue(appSecret, "META_APP_SECRET");
  requireValue(verifyToken, "META_VERIFY_TOKEN");
  result("configuração", true, "segredos presentes");
} catch (error) {
  result("configuração", false, error.message);
  process.exitCode = 1;
  process.exit();
}

const phone = await api(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating`, { headers: { Authorization: `Bearer ${token}` } });
if (phone.response.ok && phone.body?.id === phoneNumberId) result("Graph API / phone number", true, `${phone.body.verified_name || "número"} ${phone.body.display_phone_number || ""}`.trim());
else { result("Graph API / phone number", false, `HTTP ${phone.response.status}`); errors.push("phone"); }

const subscribed = await api(`https://graph.facebook.com/${graphVersion}/${wabaId}/subscribed_apps`, { headers: { Authorization: `Bearer ${token}` } });
if (subscribed.response.ok && Array.isArray(subscribed.body?.data)) result("WABA subscriptions", true, `${subscribed.body.data.length} app(s) inscrita(s)`);
else { result("WABA subscriptions", false, `HTTP ${subscribed.response.status}`); errors.push("subscription"); }

const verificationUrl = new URL(callback);
verificationUrl.searchParams.set("hub.mode", "subscribe");
verificationUrl.searchParams.set("hub.verify_token", verifyToken);
verificationUrl.searchParams.set("hub.challenge", "nexo-autonomous-check");
const verification = await fetch(verificationUrl);
const verificationBody = await verification.text();
if (verification.ok && verificationBody === "nexo-autonomous-check") result("webhook handshake", true, "HTTP 200 + challenge correto");
else { result("webhook handshake", false, `HTTP ${verification.status}: ${verificationBody.slice(0, 120)}`); errors.push("handshake"); }

const synthetic = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: wabaId, changes: [{ field: "messages", value: { metadata: { phone_number_id: phoneNumberId }, messages: [{ from: "5511999999999", id: `wamid.nexo.autonomous.${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "Teste autônomo do webhook Nexo Cloud" } }] } }] }] });
const signature = crypto.createHmac("sha256", appSecret).update(synthetic).digest("hex");
const syntheticResponse = await fetch(callback, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${signature}` }, body: synthetic });
const syntheticBody = await syntheticResponse.text();
if (syntheticResponse.ok) result("webhook POST assinado", true, syntheticBody.slice(0, 180));
else { result("webhook POST assinado", false, `HTTP ${syntheticResponse.status}: ${syntheticBody.slice(0, 180)}`); errors.push("post"); }

if (recipient) {
  const send = await api(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: recipient, type: "text", text: { preview_url: false, body: "Teste autônomo do Nexo Cloud — responda com OK para validar o recebimento." } }) });
  if (send.response.ok && send.body?.messages?.[0]?.id) result("envio WhatsApp real", true, "mensagem aceita pela Meta");
  else { result("envio WhatsApp real", false, `HTTP ${send.response.status}`); errors.push("send"); }
} else result("envio WhatsApp real", false, "META_TEST_RECIPIENT não configurado; etapa pulada");

console.log(`SUMMARY ${errors.length ? "FAIL" : "PASS"} — ${errors.length ? errors.join(",") : "todos os testes concluídos"}`);
process.exitCode = errors.length ? 1 : 0;
