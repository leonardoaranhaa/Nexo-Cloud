import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Activity, AlertCircle, BarChart3, Bot, CheckCircle2, ChevronDown, GitBranch, Inbox, LayoutGrid, LoaderCircle, Menu, Plug2, Search, Settings2, X, Store } from "lucide-react";
import { NexoWordmark } from "./brand";
import { cn } from "@/lib/utils";
import { useNexo } from "@/lib/store";
import { useWorkspaceData } from "@/lib/multitenancy/use-workspace-data";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type RoutePath = "/" | "/connections" | "/agents" | "/inbox" | "/runs" | "/workflows" | "/metrics" | "/guide" | "/marketplace" | "/settings";
type NavItem = { to: RoutePath; label: string; icon: typeof Bot };
type NavGroup = { label: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  { label: "Início", items: [{ to: "/", label: "Visão geral", icon: LayoutGrid }] },
  { label: "Build", items: [
    { to: "/agents", label: "Agentes", icon: Bot },
    { to: "/marketplace", label: "Marketplace", icon: Store },
  ] },
  { label: "Integrate", items: [
    { to: "/connections", label: "Conectores", icon: Plug2 },
  ] },
  { label: "Run", items: [
    { to: "/workflows", label: "Workflows", icon: GitBranch },
  ] },
  { label: "Operate", items: [
    { to: "/inbox", label: "Inbox", icon: Inbox },
    { to: "/runs", label: "Execuções", icon: Activity },
    { to: "/metrics", label: "Métricas de conversão", icon: BarChart3 },
  ] },
  { label: "Govern", items: [{ to: "/settings", label: "Configurações", icon: Settings2 }] },
];

const SEARCH_ITEMS = GROUPS.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })));

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: () => void }) {
  const Icon = item.icon;
  const active = item.to === "/" ? pathname === "/" : pathname === item.to || pathname.startsWith(`${item.to}/`);
  return <Link to={item.to} onClick={onNavigate} className={cn("flex h-9 items-center gap-2.5 rounded-md px-3 text-sm transition-colors", active ? "bg-elevated font-medium text-fg" : "text-muted hover:bg-elevated/70 hover:text-fg")}><Icon className="size-4" /><span>{item.label}</span></Link>;
}

function ServiceNav({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return <nav className={cn("flex flex-col gap-4", mobile && "p-4")}>{GROUPS.map((group) => <section key={group.label}><div className="mb-1 px-3 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-subtle">{group.label}</div><div className="flex flex-col gap-0.5">{group.items.map((item) => <NavLink key={item.label} item={item} pathname={pathname} onNavigate={onNavigate} />)}</div></section>)}</nav>;
}

function ContextState({ loading, error, activeWorkspace }: { loading: boolean; error: Error | null; activeWorkspace: { organizationName: string; name: string; environment: string } | null }) {
  if (loading) return <div className="flex items-center gap-2 text-xs text-muted"><LoaderCircle className="size-3.5 animate-spin" />Carregando contexto</div>;
  if (error) return <div className="flex items-center gap-2 text-xs text-warn"><AlertCircle className="size-3.5" />Contexto indisponível</div>;
  if (!activeWorkspace) return <div className="flex items-center gap-2 text-xs text-warn"><AlertCircle className="size-3.5" />Nenhum workspace selecionado</div>;
  return <div className="flex min-w-0 items-center gap-2 text-xs text-live"><CheckCircle2 className="size-3.5 shrink-0" /><span className="truncate">{activeWorkspace.name} · {activeWorkspace.environment}</span></div>;
}

function ContextGate({ loading, error, activeWorkspace, children }: { loading: boolean; error: Error | null; activeWorkspace: { organizationName: string; name: string; environment: string } | null; children: ReactNode }) {
  if (!loading && !error && activeWorkspace) return <>{children}</>;
  const title = loading ? "Carregando o contexto do workspace" : error ? "Não foi possível carregar o workspace" : "Escolha onde deseja trabalhar";
  const description = loading ? "Aguardando organização, ambiente e recursos autorizados." : error ? "O console não exibirá recursos locais enquanto o control plane não estiver disponível." : "Workspace é o projeto ou operação onde vivem seus agentes, conexões, testes e publicações.";
  return <div className="mx-auto flex min-h-[min(28rem,60vh)] max-w-xl items-center justify-center"><div className="w-full rounded-xl border border-border bg-surface p-6 text-center shadow-[var(--shadow-soft)]"><div className="mx-auto flex size-10 items-center justify-center rounded-full bg-elevated text-accent">{loading ? <LoaderCircle className="size-5 animate-spin" /> : <AlertCircle className="size-5" />}</div><h1 className="mt-4 font-display text-xl font-semibold">{title}</h1><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{description}</p>{error && <p className="mt-4 text-xs text-warn">Tente atualizar o console ou verifique o acesso ao control plane.</p>}</div></div>;
}

export function AppShell({ children, title, action }: { children: ReactNode; title?: string; action?: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const setHydrated = useNexo((s) => s.setHydrated); const workspaceId = useNexo((s) => s.workspaceId); const [mobileOpen, setMobileOpen] = useState(false); const [searchOpen, setSearchOpen] = useState(false); const [query, setQuery] = useState("");
  const { workspaces, activeWorkspace, selectWorkspace, loading: contextLoading, error: contextError } = useWorkspaceData();
  const results = useMemo(() => { const normalized = query.trim().toLowerCase(); return SEARCH_ITEMS.filter((item) => !normalized || `${item.label} ${item.group}`.toLowerCase().includes(normalized)); }, [query]);
  useEffect(() => { const unsub = useNexo.persist.onFinishHydration(() => setHydrated(true)); void useNexo.persist.rehydrate(); if (useNexo.persist.hasHydrated()) setHydrated(true); return unsub; }, [setHydrated]);
  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); } if (event.key === "Escape") setSearchOpen(false); }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, []);
  function openSearch() { setQuery(""); setSearchOpen(true); }
  function go(path: RoutePath) { setSearchOpen(false); void navigate({ to: path }); }
  return <div className="min-h-dvh bg-bg text-fg">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface md:flex"><div className="border-b border-border px-5 py-5"><Link to="/" className="block"><NexoWordmark /></Link><div className="mt-3"><ContextState loading={contextLoading} error={contextError} activeWorkspace={activeWorkspace} /></div></div><div className="flex-1 overflow-y-auto px-2 py-5"><ServiceNav /></div><div className="border-t border-border px-4 py-4"><div className="text-xs text-subtle">Organização</div><div className="mt-1 truncate text-sm text-muted">{activeWorkspace?.organizationName ?? (contextLoading ? "Carregando…" : "Nenhuma selecionada")}</div><div className="mt-3 text-xs text-subtle">{workspaces.length > 1 ? "Projeto ou workspace" : "Workspace · ambiente"}</div><select aria-label="Selecionar workspace" value={workspaceId ?? ""} disabled={contextLoading || workspaces.length <= 1} onChange={(event) => void selectWorkspace(event.target.value)} className="mt-1 w-full rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-fg"><option value="" disabled>{contextLoading ? "Carregando workspaces…" : workspaces.length === 0 ? "Nenhum workspace disponível" : workspaces.length === 1 ? "Selecionado automaticamente" : "Escolher projeto ou ambiente"}</option>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.environment}</option>)}</select>{workspaces.length > 1 && <p className="mt-2 text-[11px] leading-relaxed text-subtle">Agentes, conexões, testes e publicações pertencem ao contexto selecionado.</p>}{workspaces.length === 1 && <p className="mt-2 text-[11px] leading-relaxed text-subtle">Este é o único contexto disponível e foi selecionado automaticamente.</p>}</div></aside>
    <div className="md:pl-64"><header className="sticky top-0 z-20 border-b border-border bg-bg/90 px-4 backdrop-blur-sm md:px-8"><div className="flex h-14 items-center gap-3"><button type="button" className="rounded-md p-2 text-muted hover:bg-elevated md:hidden" aria-label="Abrir menu" onClick={() => setMobileOpen(true)}><Menu className="size-5" /></button><div className="md:hidden"><NexoWordmark compact /></div><div className="hidden items-center gap-2 text-xs text-muted md:flex"><span>Console</span><span className="text-subtle">/</span><span className="font-medium text-fg">{title}</span></div><div className="ml-auto flex items-center gap-2"><ContextState loading={contextLoading} error={contextError} activeWorkspace={activeWorkspace} /><button type="button" onClick={openSearch} className="hidden h-8 items-center gap-2 rounded-md border border-border px-3 text-xs text-muted hover:bg-elevated sm:flex"><Search className="size-3.5" />Buscar serviços<span className="ml-2 rounded border border-border px-1.5 py-0.5 font-mono text-[10px]">⌘K</span></button><button type="button" onClick={openSearch} className="rounded-md p-2 text-muted hover:bg-elevated sm:hidden" aria-label="Buscar serviços"><Search className="size-4" /></button><select aria-label="Selecionar ambiente" value={activeWorkspace?.environment ?? "development"} disabled={!activeWorkspace} onChange={(event) => { const target = workspaces.find((item) => item.organizationId === activeWorkspace?.organizationId && item.environment === event.target.value); if (target) void selectWorkspace(target.id); }} className="hidden h-8 rounded-md border border-border bg-bg px-2 text-xs text-muted sm:block"><option value="development">Development</option><option value="staging">Staging</option><option value="production">Production</option></select>{action}</div></div></header><main className="px-4 pt-6 pb-24 md:px-8 md:pb-10"><ContextGate loading={contextLoading} error={contextError} activeWorkspace={activeWorkspace}>{children}</ContextGate></main></div>
    {mobileOpen && <div className="fixed inset-0 z-50 md:hidden"><button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} /><aside className="relative h-full w-[min(88vw,22rem)] overflow-y-auto border-r border-border bg-surface shadow-xl"><div className="flex h-14 items-center justify-between border-b border-border px-5"><NexoWordmark compact /><button type="button" className="rounded-md p-2 text-muted hover:bg-elevated" aria-label="Fechar menu" onClick={() => setMobileOpen(false)}><X className="size-5" /></button></div><ServiceNav mobile onNavigate={() => setMobileOpen(false)} /></aside></div>}
    <Dialog open={searchOpen} onOpenChange={setSearchOpen}><DialogContent title="Buscar no console" className="p-0"><div className="border-b border-border p-3"><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar agentes, conexões, métricas…" /></div><div className="max-h-[min(26rem,60vh)] overflow-y-auto p-2">{results.map((item) => { const Icon = item.icon; return <button key={item.to} type="button" onClick={() => go(item.to)} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-elevated"><Icon className="size-4 text-accent" /><span className="flex-1"><span className="block text-sm font-medium">{item.label}</span><span className="block text-xs text-muted">{item.group}</span></span><ChevronDown className="size-3 -rotate-90 text-subtle" /></button>; })}{results.length === 0 && <p className="p-4 text-sm text-muted">Nenhum serviço encontrado.</p>}</div><div className="border-t border-border px-4 py-2 text-[11px] text-muted">Use ↑ ↓ para navegar · Enter para abrir · Esc para fechar</div></DialogContent></Dialog>
  </div>;
}
