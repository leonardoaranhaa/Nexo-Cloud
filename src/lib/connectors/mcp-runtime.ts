import type { SecretProvider } from "./secrets.ts";

type Json = Record<string, unknown>;
type RpcResponse = { result?: Json; error?: { code?: number; message?: string } };

function object(value: unknown): Json { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function endpoint(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("MCP_URL_INVALID"); }
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !local) throw new Error("MCP_URL_REQUIRES_HTTPS");
  return url;
}
function timeout(value: unknown): number { const n = typeof value === "number" ? value : Number(value); return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 500), 30000) : 10000; }
function parseSse(value: string): RpcResponse | null {
  for (const block of value.split(/\n\n+/)) {
    const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
    if (data) { try { return object(JSON.parse(data)) as RpcResponse; } catch { /* continue */ } }
  }
  return null;
}

export type McpRuntimeContext = { url: string; secretRef: string; workspaceId: string; connectionId: string; getSecret: (name: string) => Promise<string>; timeoutMs?: number };
export type McpTool = { name: string; description?: string; inputSchema?: Json };

export class McpRuntime {
  private readonly context: McpRuntimeContext;
  private readonly secretProvider: SecretProvider;
  private sessionId: string | undefined;
  private requestId = 0;
  constructor(context: McpRuntimeContext, secretProvider: SecretProvider) { this.context = context; this.secretProvider = secretProvider; }

  private async request(method: string, params: Json, initialize = false): Promise<RpcResponse> {
    const id = ++this.requestId;
    const headers: Record<string, string> = { accept: "application/json, text/event-stream", "content-type": "application/json" };
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;
    if (this.context.secretRef) headers.authorization = `Bearer ${await this.secretProvider.resolve(this.context.secretRef, { workspaceId: this.context.workspaceId, connectionId: this.context.connectionId })}`;
    const response = await fetch(endpoint(this.context.url).toString(), { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }), signal: AbortSignal.timeout(timeout(this.context.timeoutMs)), redirect: "error" });
    if (!response.ok) throw new Error(`MCP_HTTP_${response.status}`);
    const session = response.headers.get("mcp-session-id");
    if (session && initialize) this.sessionId = session;
    const raw = await response.text();
    if (response.status === 202 || !raw.trim()) return {};
    const payload = response.headers.get("content-type")?.includes("text/event-stream") ? parseSse(raw) : object(JSON.parse(raw)) as RpcResponse;
    if (!payload) throw new Error("MCP_RESPONSE_INVALID");
    if (payload.error) throw new Error(`MCP_RPC_${payload.error.code ?? "ERROR"}:${String(payload.error.message ?? "request failed").slice(0, 200)}`);
    return payload;
  }

  async initialize(): Promise<void> {
    await this.request("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "nexo-cloud", version: "0.1.0" } }, true);
    await this.request("notifications/initialized", {});
  }

  async listTools(): Promise<McpTool[]> {
    await this.initialize();
    const result = object((await this.request("tools/list", {})).result);
    return Array.isArray(result.tools) ? result.tools.map((item) => { const tool = object(item); return { name: typeof tool.name === "string" ? tool.name.slice(0, 160) : "", description: typeof tool.description === "string" ? tool.description.slice(0, 1000) : undefined, inputSchema: object(tool.inputSchema) }; }).filter((tool) => tool.name) : [];
  }

  async callTool(name: string, argumentsValue: Json): Promise<Json> {
    if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(name)) throw new Error("MCP_TOOL_NAME_INVALID");
    await this.initialize();
    const result = object((await this.request("tools/call", { name, arguments: argumentsValue })).result);
    const serialized = JSON.stringify(result);
    if (serialized.length > 32000) throw new Error("MCP_RESULT_TOO_LARGE");
    return result;
  }

  async close(): Promise<void> {
    if (!this.sessionId) return;
    try { await fetch(endpoint(this.context.url).toString(), { method: "DELETE", headers: { "Mcp-Session-Id": this.sessionId }, signal: AbortSignal.timeout(3000) }); } finally { this.sessionId = undefined; }
  }
}
