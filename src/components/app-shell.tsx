import { useEffect, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, Bot, GitBranch, Inbox, LayoutGrid, Plug2, Waypoints } from "lucide-react";
import { NexoWordmark } from "./brand";
import { cn } from "@/lib/utils";
import { useNexo } from "@/lib/store";
import { useWorkspaceData } from "@/lib/multitenancy/use-workspace-data";

const NAV = [
  { to: "/", label: "Visão geral", icon: LayoutGrid },
  { to: "/connections", label: "Conexões", icon: Plug2 },
  { to: "/agents", label: "Agentes", icon: Bot },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/runs", label: "Execuções", icon: Activity },
  { to: "/workflows", label: "Workflows", icon: GitBranch },
  { to: "/guide", label: "Caminhos", icon: Waypoints },
] as const;

export function AppShell({
  children,
  title,
  action,
}: {
  children: ReactNode;
  title?: string;
  action?: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const setHydrated = useNexo((s) => s.setHydrated);
  useWorkspaceData();

  useEffect(() => {
    const unsub = useNexo.persist.onFinishHydration(() => setHydrated(true));
    void useNexo.persist.rehydrate();
    if (useNexo.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, [setHydrated]);

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-border bg-surface md:flex">
        <div className="px-4 py-5">
          <Link to="/" className="block">
            <NexoWordmark />
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-2">
          {NAV.map((item) => {
            const active =
              item.to === "/"
                ? pathname === "/"
                : pathname === item.to || pathname.startsWith(`${item.to}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex h-10 items-center gap-2.5 rounded-md px-3 text-sm transition-colors",
                  active ? "bg-elevated text-fg" : "text-muted hover:bg-elevated/60 hover:text-fg",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border px-4 py-4 text-xs text-subtle">
          Workspace local
          <div className="mt-1 text-muted">WhatsApp · Grok · n8n / Python</div>
        </div>
      </aside>

      <div className="md:pl-56">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-bg/90 px-4 backdrop-blur-sm md:px-8">
          <div className="md:hidden">
            <NexoWordmark compact />
          </div>
          <h1 className="hidden font-display text-sm font-semibold tracking-tight md:block">
            {title}
          </h1>
          <div className="ml-auto flex items-center gap-2">{action}</div>
        </header>
        <main className="px-4 pt-6 pb-24 md:px-8 md:pb-10">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-surface/95 backdrop-blur-sm md:hidden">
        {NAV.map((item) => {
          const active =
            item.to === "/"
              ? pathname === "/"
              : pathname === item.to || pathname.startsWith(`${item.to}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 text-[0.7rem]",
                active ? "text-fg" : "text-subtle",
              )}
            >
              <Icon className="size-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
