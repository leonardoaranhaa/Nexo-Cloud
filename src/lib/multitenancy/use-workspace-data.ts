import { useCallback, useEffect, useState } from "react";
import { getWorkspaceContext, listWorkspaceAgents, listWorkspaceConnections } from "./api";
import { agentRecordToUi } from "./adapter";
import { connectionRecordToUi } from "./connection-adapter";
import { useNexo } from "@/lib/store";

export async function loadWorkspaceAgents(workspaceId: string) {
  const records = await listWorkspaceAgents({ data: { workspaceId } });
  return records.map(agentRecordToUi);
}

export async function loadWorkspaceConnections(workspaceId: string) {
  const records = await listWorkspaceConnections({ data: { workspaceId } });
  return records.map(connectionRecordToUi);
}

export function useWorkspaceData() {
  const setWorkspaceSnapshot = useNexo((s) => s.setWorkspaceSnapshot);
  const setConnectionSnapshot = useNexo((s) => s.setConnectionSnapshot);
  const workspaceId = useNexo((s) => s.workspaceId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async (targetWorkspaceId?: string) => {
    const id = targetWorkspaceId ?? useNexo.getState().workspaceId;
    if (!id) return;
    setLoading(true);
    try {
      const [agents, connections] = await Promise.all([
        loadWorkspaceAgents(id),
        loadWorkspaceConnections(id),
      ]);
      setWorkspaceSnapshot(id, agents);
      setConnectionSnapshot(connections);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error("Falha ao carregar workspace"));
    } finally {
      setLoading(false);
    }
  }, [setWorkspaceSnapshot, setConnectionSnapshot]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      setLoading(true);
      try {
        const context = await getWorkspaceContext();
        if (cancelled) return;
        const id = context.activeWorkspace.id;
        const [agents, connections] = await Promise.all([
          loadWorkspaceAgents(id),
          loadWorkspaceConnections(id),
        ]);
        if (cancelled) return;
        setWorkspaceSnapshot(id, agents);
        setConnectionSnapshot(connections);
        setError(null);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause : new Error("Falha ao carregar workspace"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [setWorkspaceSnapshot, setConnectionSnapshot]);

  return { loading, error, workspaceId, refresh };
}
