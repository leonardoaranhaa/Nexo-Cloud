import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { getWorkspaceEvolutionConnectionState, getWorkspaceMetaConnectionState } from "./api";
import { useNexo } from "@/lib/store";

const POLL_INTERVAL_MS = 15_000;

type MonitorStatus = "connected" | "disconnected" | "error";

function channelLabel(provider: string): string {
  if (provider === "evolution") return "WhatsApp";
  if (provider === "instagram") return "Instagram";
  if (provider === "messenger") return "Messenger";
  return "Meta Cloud";
}

export function useConnectionMonitor(): void {
  const workspaceId = useNexo((state) => state.workspaceId);
  const backendReady = useNexo((state) => state.backendReady);
  const connections = useNexo((state) => state.connections);
  const updateConnection = useNexo((state) => state.updateConnection);
  const previous = useRef<Record<string, MonitorStatus>>({});

  useEffect(() => {
    if (!backendReady || !workspaceId) return;
    const activeWorkspaceId = workspaceId;
    let cancelled = false;
    let running = false;

    async function poll() {
      if (cancelled || running) return;
      running = true;
      try {
        const monitoredConnections = useNexo.getState().connections.filter((connection) => ["evolution", "meta", "instagram", "messenger"].includes(connection.provider));
        await Promise.all(monitoredConnections.map(async (connection) => {
          try {
            const result = connection.provider === "evolution"
              ? await getWorkspaceEvolutionConnectionState({ data: { workspaceId: activeWorkspaceId, connectionId: connection.id } })
              : await getWorkspaceMetaConnectionState({ data: { workspaceId: activeWorkspaceId, connectionId: connection.id } });
            if (cancelled) return;
            const status: MonitorStatus = result.status === "connected" ? "connected" : result.status === "error" ? "error" : "disconnected";
            const before = previous.current[connection.id];
            previous.current[connection.id] = status;
            updateConnection(connection.id, { status, ...(status === "connected" ? { lastEventAt: Date.now() } : {}) });
            if (status !== "connected" && before !== status) {
              toast.error(`${channelLabel(connection.provider)} desconectado: ${connection.name}`, { description: result.message });
            }
            if (status === "connected" && before && before !== status) {
              toast.success(`${channelLabel(connection.provider)} reconectado: ${connection.name}`);
            }
          } catch {
            if (!cancelled) previous.current[connection.id] = "error";
          }
        }));
      } finally {
        running = false;
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [backendReady, updateConnection, workspaceId]);

  useEffect(() => {
    const ids = new Set(connections.map((connection) => connection.id));
    for (const id of Object.keys(previous.current)) if (!ids.has(id)) delete previous.current[id];
  }, [connections]);
}
