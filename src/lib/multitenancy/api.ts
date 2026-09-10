import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

export const getWorkspaceContext = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const { ensureDefaultWorkspace, listWorkspaces } = await import("./server");
    const sql = await getSql();
    const workspaces = await listWorkspaces(sql, context.userId);
    if (workspaces.length > 0) return { workspaces, activeWorkspace: workspaces[0] };
    const activeWorkspace = await ensureDefaultWorkspace(sql, context.userId);
    return { workspaces: [activeWorkspace], activeWorkspace };
  });

export const listWorkspaceAgents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ context, data }) => {
    const workspaceId = data.workspaceId.trim();
    if (!workspaceId) throw new Error("workspaceId is required");
    const { getSql } = await import("@/lib/db");
    const { listAgents } = await import("./server");
    return listAgents(await getSql(), context.userId, workspaceId);
  });

export const createWorkspaceAgent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      workspaceId: string;
      name: string;
      persona?: string;
      welcomeMessage?: string;
      systemPrompt?: string;
      agentType?: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { createAgent } = await import("./server");
    return createAgent(await getSql(), context.userId, data);
  });
