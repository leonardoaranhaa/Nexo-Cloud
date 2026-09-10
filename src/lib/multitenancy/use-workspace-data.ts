import { useCallback, useEffect, useState } from "react";
import { getWorkspaceContext, listWorkspaceAgents, listWorkspaceConnections } from "./api";
import { agentRecordToUi } from "./adapter";
import { connectionRecordToUi } from "./connection-adapter";
import { useNexo, type WorkspaceContext } from "@/lib/store";

export async function loadWorkspaceAgents(workspaceId: string) { const records = await listWorkspaceAgents({ data: { workspaceId } }); return records.map(agentRecordToUi); }
export async function loadWorkspaceConnections(workspaceId: string) { const records = await listWorkspaceConnections({ data: { workspaceId } }); return records.map(connectionRecordToUi); }

export function useWorkspaceData() {
  const setWorkspaceSnapshot = useNexo((s) => s.setWorkspaceSnapshot); const setWorkspaceContext = useNexo((s) => s.setWorkspaceContext); const workspaceId = useNexo((s) => s.workspaceId); const [loading, setLoading] = useState(true); const [error, setError] = useState<Error | null>(null); const [contextLoaded, setContextLoaded] = useState(false);
  const load = useCallback(async (active: WorkspaceContext, workspaces: WorkspaceContext[]) => { const [agents, connections] = await Promise.all([loadWorkspaceAgents(active.id), loadWorkspaceConnections(active.id)]); setWorkspaceContext(active, workspaces); setWorkspaceSnapshot(active.id, agents); useNexo.getState().setConnectionSnapshot(connections); }, [setWorkspaceContext, setWorkspaceSnapshot]);
  const refresh = useCallback(async (targetWorkspaceId?: string) => { const context = await getWorkspaceContext(); const active = context.workspaces.find((item) => item.id === targetWorkspaceId) ?? context.workspaces.find((item) => item.id === useNexo.getState().workspaceId) ?? context.activeWorkspace; await load(active, context.workspaces); }, [load]);
  const selectWorkspace = useCallback(async (targetWorkspaceId: string) => { setLoading(true); try { await refresh(targetWorkspaceId); setError(null); } catch (cause) { setError(cause instanceof Error ? cause : new Error("Falha ao trocar workspace")); } finally { setLoading(false); } }, [refresh]);
  useEffect(() => { let cancelled = false; async function bootstrap() { setLoading(true); try { const context = await getWorkspaceContext(); if (cancelled) return; const persisted = useNexo.getState().workspaceId; const active = context.workspaces.find((item) => item.id === persisted) ?? context.activeWorkspace; await load(active, context.workspaces); if (!cancelled) { setContextLoaded(true); setError(null); } } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause : new Error("Falha ao carregar contexto")); } finally { if (!cancelled) setLoading(false); } } void bootstrap(); return () => { cancelled = true; }; }, [load]);
  return { loading, error, workspaceId, contextLoaded, workspaces: useNexo((s) => s.workspaces), activeWorkspace: useNexo((s) => s.workspaces.find((item) => item.id === s.workspaceId) ?? null), refresh, selectWorkspace };
}
