import { useCallback, useEffect, useState } from "react";
import { getWorkspaceContext, listWorkspaceAgents } from "./api";
import { agentRecordToUi } from "./adapter";
import { useNexo } from "@/lib/store";

export async function loadWorkspaceAgents(workspaceId: string) {
  const records = await listWorkspaceAgents({ data: { workspaceId } });
  return records.map(agentRecordToUi);
}

export function useWorkspaceData() {
  const setWorkspaceSnapshot = useNexo((s) => s.setWorkspaceSnapshot);
  const workspaceId = useNexo((s) => s.workspaceId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async (targetWorkspaceId?: string) => {
    const id = targetWorkspaceId ?? useNexo.getState().workspaceId;
    if (!id) return;
    setLoading(true);
    try {
      const agents = await loadWorkspaceAgents(id);
      setWorkspaceSnapshot(id, agents);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error("Falha ao carregar workspace"));
    } finally {
      setLoading(false);
    }
  }, [setWorkspaceSnapshot]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      setLoading(true);
      try {
        const context = await getWorkspaceContext();
        if (cancelled) return;
        const id = context.activeWorkspace.id;
        const agents = await loadWorkspaceAgents(id);
        if (cancelled) return;
        setWorkspaceSnapshot(id, agents);
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
  }, [setWorkspaceSnapshot]);

  return { loading, error, workspaceId, refresh };
}
