import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { McpRuntime } from "./mcp-runtime.ts";
import { memorySecretProvider } from "./secrets.ts";

test("MCP runtime initializes, lists and calls an allowlisted server tool", async () => {
  const previousLocalFlag = process.env.NEXO_MCP_ALLOW_LOCAL_ENDPOINTS;
  process.env.NEXO_MCP_ALLOW_LOCAL_ENDPOINTS = "true";
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    if (!body && request.method === "DELETE") { response.statusCode = 200; response.end(); return; }
    const message = JSON.parse(body) as { method: string; id?: number };
    response.setHeader("content-type", "application/json");
    if (message.method === "initialize") {
      response.setHeader("mcp-session-id", "session-test");
      response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "fixture", version: "1" } } }));
    } else if (message.method === "notifications/initialized") {
      response.statusCode = 202;
      response.end();
    } else if (message.method === "tools/list") {
      response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "calendar.lookup", description: "lookup", inputSchema: { type: "object" } }] } }));
    } else if (message.method === "tools/call") {
      response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: "ok" }] } }));
    } else {
      response.statusCode = 400;
      response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "not found" } }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const runtime = new McpRuntime({ url: `http://127.0.0.1:${address.port}/mcp`, secretRef: "", workspaceId: "workspace", connectionId: "connection", getSecret: async () => "", timeoutMs: 3000 }, memorySecretProvider(new Map()));
  try {
    assert.deepEqual((await runtime.listTools()).map((tool) => tool.name), ["calendar.lookup"]);
    assert.deepEqual(await runtime.callTool("calendar.lookup", { date: "today" }), { content: [{ type: "text", text: "ok" }] });
  } finally {
    await runtime.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previousLocalFlag === undefined) delete process.env.NEXO_MCP_ALLOW_LOCAL_ENDPOINTS;
    else process.env.NEXO_MCP_ALLOW_LOCAL_ENDPOINTS = previousLocalFlag;
  }
});

test("MCP runtime rejects non-HTTPS remote endpoints", async () => {
  const runtime = new McpRuntime({ url: "http://remote.example/mcp", secretRef: "", workspaceId: "workspace", connectionId: "connection", getSecret: async () => "" }, memorySecretProvider(new Map()));
  await assert.rejects(() => runtime.listTools(), /MCP_URL_REQUIRES_HTTPS/);
});

test("MCP runtime rejects private endpoints without an explicit development opt-in", async () => {
  const runtime = new McpRuntime({ url: "https://10.0.0.8/mcp", secretRef: "", workspaceId: "workspace", connectionId: "connection", getSecret: async () => "" }, memorySecretProvider(new Map()));
  await assert.rejects(() => runtime.listTools(), /MCP_URL_PRIVATE_HOST/);
});
