import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Agent, ChatMessage, Connection, StudioEvent, TraceStep } from "./types";
import { SEED_AGENTS, SEED_CONNECTIONS, SEED_EVENTS, SEED_INBOX } from "./templates";
import { createId } from "./utils";

type Inbox = Record<string, ChatMessage[]>;
export type PlatformSettings = {
  appearance: "system" | "light" | "dark";
  compactNavigation: boolean;
  reduceMotion: boolean;
  autoRefreshSeconds: 5 | 15 | 30 | 60;
  defaultMemoryWindow: number;
  defaultTemperature: number;
  notifyHandoffs: boolean;
  notifyFailures: boolean;
  notifyDeployments: boolean;
  confirmHighRiskTools: boolean;
  allowLocalFallback: boolean;
  defaultEnvironment: "development" | "staging" | "production";
};

const DEFAULT_SETTINGS: PlatformSettings = {
  appearance: "dark",
  compactNavigation: false,
  reduceMotion: false,
  autoRefreshSeconds: 15,
  defaultMemoryWindow: 12,
  defaultTemperature: 0.4,
  notifyHandoffs: true,
  notifyFailures: true,
  notifyDeployments: true,
  confirmHighRiskTools: true,
  allowLocalFallback: true,
  defaultEnvironment: "development",
};
export type WorkspaceContext = {
  id: string;
  organizationId: string;
  organizationName: string;
  name: string;
  slug: string;
  environment: "development" | "staging" | "production";
  role: string;
  onboardingCompleted: boolean;
  onboardingGoal: string | null;
  onboardingTeamSize: string | null;
};

type NexoState = {
  connections: Connection[];
  agents: Agent[];
  inbox: Inbox;
  events: StudioEvent[];
  activeTrace: { agentId: string; steps: TraceStep[] } | null;
  hydrated: boolean;
  workspaceId: string | null;
  organizationId: string | null;
  organizationName: string | null;
  environment: WorkspaceContext["environment"];
  workspaces: WorkspaceContext[];
  backendReady: boolean;
  settings: PlatformSettings;
  setHydrated: (v: boolean) => void;
  setWorkspaceSnapshot: (workspaceId: string, agents: Agent[]) => void;
  setWorkspaceContext: (active: WorkspaceContext, workspaces: WorkspaceContext[]) => void;
  setConnectionSnapshot: (connections: Connection[]) => void;
  setTrace: (agentId: string, steps: TraceStep[]) => void;
  clearTrace: () => void;
  addConnection: (c: Omit<Connection, "id" | "createdAt">) => string;
  updateConnection: (id: string, patch: Partial<Connection>) => void;
  removeConnection: (id: string) => void;
  addAgent: (a: Omit<Agent, "id" | "createdAt" | "updatedAt">) => string;
  updateAgent: (id: string, patch: Partial<Agent>) => void;
  removeAgent: (id: string) => void;
  duplicateAgent: (id: string) => string | null;
  pushMessage: (agentId: string, msg: Omit<ChatMessage, "id" | "at"> & { at?: number }) => void;
  clearInbox: (agentId: string) => void;
  log: (kind: StudioEvent["kind"], text: string) => void;
  resetDemo: () => void;
  updateSettings: (patch: Partial<PlatformSettings>) => void;
};

const seedInbox = (): Inbox => {
  const next: Inbox = {};
  for (const [id, msgs] of Object.entries(SEED_INBOX)) {
    next[id] = msgs.map((m) => ({ ...m, kind: "text" as const }));
  }
  return next;
};

const seed = () => ({
  connections: SEED_CONNECTIONS,
  agents: SEED_AGENTS,
  inbox: seedInbox(),
  events: SEED_EVENTS,
  activeTrace: null as { agentId: string; steps: TraceStep[] } | null,
});

export const useNexo = create<NexoState>()(
  persist(
    (set, get) => ({
      ...seed(),
      workspaceId: null,
      organizationId: null,
      organizationName: null,
      environment: "development",
      workspaces: [],
      backendReady: false,
      settings: DEFAULT_SETTINGS,
      hydrated: false,
      setHydrated: (v) => set({ hydrated: v }),
      setWorkspaceSnapshot: (workspaceId, agents) => set({ workspaceId, agents, backendReady: true }),
      setWorkspaceContext: (active, workspaces) => set((state) => ({
        workspaceId: active.id,
        organizationId: active.organizationId,
        organizationName: active.organizationName,
        environment: active.environment,
        workspaces,
        backendReady: true,
        ...(state.workspaceId === active.id ? {} : { inbox: {}, events: [], activeTrace: null }),
      })),
      setConnectionSnapshot: (connections) => set({ connections }),
      setTrace: (agentId, steps) => set({ activeTrace: { agentId, steps } }),
      clearTrace: () => set({ activeTrace: null }),
      addConnection: (c) => {
        const id = createId("conn");
        set((s) => ({
          connections: [{ ...c, id, createdAt: Date.now() }, ...s.connections],
        }));
        get().log("connection", `Conexão ${c.name} criada`);
        return id;
      },
      updateConnection: (id, patch) =>
        set((s) => ({
          connections: s.connections.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
      removeConnection: (id) =>
        set((s) => ({
          connections: s.connections.filter((c) => c.id !== id),
          agents: s.agents.map((a) => (a.connectionId === id ? { ...a, connectionId: null } : a)),
        })),
      addAgent: (a) => {
        const id = createId("agent");
        const t = Date.now();
        set((s) => ({
          agents: [{ ...a, id, createdAt: t, updatedAt: t }, ...s.agents],
        }));
        get().log("agent", `Agente ${a.name} criado`);
        return id;
      },
      updateAgent: (id, patch) =>
        set((s) => ({
          agents: s.agents.map((a) =>
            a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a,
          ),
        })),
      removeAgent: (id) =>
        set((s) => {
          const nextInbox = { ...s.inbox };
          delete nextInbox[id];
          return {
            agents: s.agents.filter((a) => a.id !== id),
            inbox: nextInbox,
          };
        }),
      duplicateAgent: (id) => {
        const src = get().agents.find((a) => a.id === id);
        if (!src) return null;
        return get().addAgent({
          ...src,
          name: `${src.name} (cópia)`,
          status: "draft",
        });
      },
      pushMessage: (agentId, msg) =>
        set((s) => {
          const list = s.inbox[agentId] ?? [];
          const next: ChatMessage = {
            id: createId("msg"),
            at: msg.at ?? Date.now(),
            role: msg.role,
            content: msg.content,
            kind: msg.kind ?? "text",
          };
          return { inbox: { ...s.inbox, [agentId]: [...list, next] } };
        }),
      clearInbox: (agentId) =>
        set((s) => ({ inbox: { ...s.inbox, [agentId]: [] } })),
      log: (kind, text) =>
        set((s) => ({
          events: [{ id: createId("ev"), at: Date.now(), kind, text }, ...s.events].slice(0, 24),
        })),
      resetDemo: () => set({ ...seed() }),
      updateSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
    }),
    {
      name: "nexo-studio-v1",
      skipHydration: true,
      partialize: (s) => ({
        connections: s.connections,
        agents: s.agents,
        inbox: s.inbox,
        events: s.events,
        workspaceId: s.workspaceId,
        organizationId: s.organizationId,
        organizationName: s.organizationName,
        environment: s.environment,
        workspaces: s.workspaces,
        settings: s.settings,
      }),
    },
  ),
);
