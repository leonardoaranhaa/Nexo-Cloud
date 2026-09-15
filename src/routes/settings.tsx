import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Bell, Bot, Boxes, ChevronRight, Database, KeyRound, LogOut, Monitor, Save, ShieldCheck, SlidersHorizontal, Workflow } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useNexo, type PlatformSettings } from "@/lib/store";
import { authClient, authEnabled, signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  getCurrentUserAccount,
  updateCurrentUserPreferences,
  updateCurrentUserProfile,
} from "@/lib/multitenancy/api";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

type ToggleKey = "compactNavigation" | "reduceMotion" | "notifyHandoffs" | "notifyFailures" | "notifyDeployments" | "confirmHighRiskTools" | "allowLocalFallback";

type Notice = { tone: "success" | "error"; text: string } | null;

function SettingsPage() {
  const settings = useNexo((s) => s.settings);
  const updateSettings = useNexo((s) => s.updateSettings);
  const workspace = useNexo((s) => s.workspaces.find((item) => item.id === s.workspaceId));
  const { user } = useCurrentUserState();
  const [accountName, setAccountName] = useState(user?.displayName ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    setAccountName(user?.displayName ?? "");
  }, [user?.displayName]);

  useEffect(() => {
    let active = true;
    void getCurrentUserAccount()
      .then((account) => {
        if (!active) return;
        updateSettings(account.preferences);
      })
      .catch(() => {
        if (active) setNotice({ tone: "error", text: "Não foi possível carregar as preferências persistentes." });
      })
      .finally(() => {
        if (active) setAccountLoading(false);
      });
    return () => { active = false; };
  }, [updateSettings]);

  const persistSettings = (patch: Partial<PlatformSettings>) => {
    updateSettings(patch);
    void updateCurrentUserPreferences({ data: patch }).then((saved) => updateSettings(saved)).catch(() => {
      setNotice({ tone: "error", text: "A preferência foi aplicada localmente, mas não foi persistida no servidor." });
    });
  };
  const toggle = (key: ToggleKey) => persistSettings({ [key]: !settings[key] } as Partial<PlatformSettings>);

  async function saveName() {
    if (!accountName.trim() || savingName) return;
    setSavingName(true);
    setNotice(null);
    try {
      await updateCurrentUserProfile({ data: { name: accountName.trim() } });
      await authClient.getSession();
      setNotice({ tone: "success", text: "Perfil atualizado com segurança." });
    } catch {
      setNotice({ tone: "error", text: "Não foi possível atualizar o perfil." });
    } finally {
      setSavingName(false);
    }
  }

  async function changePassword() {
    if (!currentPassword || newPassword.length < 8 || changingPassword) return;
    setChangingPassword(true);
    setNotice(null);
    const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
    if (result.error) setNotice({ tone: "error", text: result.error.message ?? "Não foi possível alterar a senha." });
    else {
      setCurrentPassword("");
      setNewPassword("");
      setNotice({ tone: "success", text: "Senha alterada. As outras sessões foram encerradas." });
    }
    setChangingPassword(false);
  }

  async function leaveConsole() {
    try {
      await signOut("/login");
    } catch {
      setNotice({ tone: "error", text: "Não foi possível encerrar a sessão. Tente novamente." });
    }
  }

  return <AppShell title="Configurações"><div className="max-w-5xl"><div className="flex flex-wrap items-start justify-between gap-4"><div><Badge tone="live">Control plane</Badge><h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">Configurações</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">Controle sua conta, preferências do console, governança dos agentes e o armazenamento seguro de credenciais por workspace.</p></div><Button variant="secondary" disabled={accountLoading}><Save className="size-4" />{accountLoading ? "Carregando…" : "Preferências sincronizadas"}</Button></div>

    {notice && <div className={`mt-5 rounded-lg border px-4 py-3 text-sm ${notice.tone === "success" ? "border-live/30 bg-live/10 text-live" : "border-danger/30 bg-danger/10 text-danger"}`}>{notice.text}</div>}

    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]"><div className="space-y-6">
      <SettingsSection icon={Boxes} title="Conta e acesso" description="Sua identidade controla o acesso aos workspaces e às operações administrativas."><div className="grid gap-4 sm:grid-cols-2"><Field label="Nome"><Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Seu nome" maxLength={120} /></Field><Field label="E-mail"><Input value={user?.primaryEmail ?? "Conta de desenvolvimento"} readOnly /></Field></div><div className="mt-4 flex flex-wrap items-center gap-3"><Button onClick={() => void saveName()} disabled={savingName || !accountName.trim()}><Save className="size-4" />{savingName ? "Salvando…" : "Salvar perfil"}</Button>{authEnabled && <Button variant="secondary" onClick={() => void leaveConsole()}><LogOut className="size-4" />Sair da conta</Button>}</div><p className="mt-3 text-xs text-muted">As permissões são sempre verificadas no servidor; o navegador não recebe credenciais de conectores.</p></SettingsSection>

      {authEnabled && <SettingsSection icon={ShieldCheck} title="Senha e sessões" description="Proteja o acesso ao console e encerre sessões antigas após uma troca de senha."><div className="grid gap-4 sm:grid-cols-2"><Field label="Senha atual"><Input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></Field><Field label="Nova senha"><Input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /><span className="mt-1 block text-xs text-muted">Use pelo menos 8 caracteres.</span></Field></div><Button className="mt-4" variant="secondary" onClick={() => void changePassword()} disabled={changingPassword || !currentPassword || newPassword.length < 8}>{changingPassword ? "Atualizando…" : "Alterar senha e encerrar outras sessões"}</Button></SettingsSection>}

      <SettingsSection icon={Monitor} title="Experiência do console" description="Ajuste a forma como você navega e acompanha a operação."><ToggleRow label="Navegação compacta" description="Use menos espaço vertical na barra lateral." checked={settings.compactNavigation} onChange={() => toggle("compactNavigation")} /><ToggleRow label="Reduzir movimento" description="Desative transições não essenciais da interface." checked={settings.reduceMotion} onChange={() => toggle("reduceMotion")} /><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Tema"><select value={settings.appearance} onChange={(e) => persistSettings({ appearance: e.target.value as PlatformSettings["appearance"] })} className="h-10 w-full rounded-md border border-border bg-bg px-3 text-sm"><option value="dark">Escuro</option><option value="light">Claro</option><option value="system">Sistema</option></select></Field><Field label="Atualização operacional"><select value={settings.autoRefreshSeconds} onChange={(e) => persistSettings({ autoRefreshSeconds: Number(e.target.value) as PlatformSettings["autoRefreshSeconds"] })} className="h-10 w-full rounded-md border border-border bg-bg px-3 text-sm"><option value="5">A cada 5 segundos</option><option value="15">A cada 15 segundos</option><option value="30">A cada 30 segundos</option><option value="60">A cada 60 segundos</option></select></Field></div></SettingsSection>

      <SettingsSection icon={Bot} title="Padrões para agentes" description="Valores iniciais usados ao criar novos agentes. Cada agente pode ser customizado depois."><div className="grid gap-4 sm:grid-cols-2"><Field label="Janela de memória"><Input type="number" min={2} max={100} value={settings.defaultMemoryWindow} onChange={(e) => persistSettings({ defaultMemoryWindow: Math.min(100, Math.max(2, Number(e.target.value) || 2)) })} /><span className="mt-1 block text-xs text-muted">Quantidade de mensagens consideradas no contexto.</span></Field><Field label="Temperatura padrão"><Input type="number" min={0} max={1} step={0.05} value={settings.defaultTemperature} onChange={(e) => persistSettings({ defaultTemperature: Math.min(1, Math.max(0, Number(e.target.value) || 0)) })} /><span className="mt-1 block text-xs text-muted">Menor valor gera respostas mais consistentes.</span></Field></div><ToggleRow label="Permitir fallback local" description="Mantenha o atendimento disponível quando o provedor de modelo estiver indisponível." checked={settings.allowLocalFallback} onChange={() => toggle("allowLocalFallback")} /></SettingsSection>

      <SettingsSection icon={Bell} title="Notificações operacionais" description="Escolha quais acontecimentos devem chamar a atenção da equipe."><ToggleRow label="Novos handoffs" description="Avise quando uma conversa precisar de atendimento humano." checked={settings.notifyHandoffs} onChange={() => toggle("notifyHandoffs")} /><ToggleRow label="Falhas de execução" description="Avise sobre jobs com erro, retries ou filas paradas." checked={settings.notifyFailures} onChange={() => toggle("notifyFailures")} /><ToggleRow label="Publicações e mudanças" description="Avise quando uma versão de agente for publicada ou revertida." checked={settings.notifyDeployments} onChange={() => toggle("notifyDeployments")} /></SettingsSection>

      <SettingsSection icon={ShieldCheck} title="Segurança e governança" description="Políticas de proteção para ações executadas pelos agentes."><ToggleRow label="Confirmar ferramentas de alto risco" description="Exija aprovação humana antes de ações potencialmente irreversíveis." checked={settings.confirmHighRiskTools} onChange={() => toggle("confirmHighRiskTools")} /><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Ambiente padrão"><select value={settings.defaultEnvironment} onChange={(e) => persistSettings({ defaultEnvironment: e.target.value as PlatformSettings["defaultEnvironment"] })} className="h-10 w-full rounded-md border border-border bg-bg px-3 text-sm"><option value="development">Development</option><option value="staging">Staging</option><option value="production">Production</option></select></Field><Field label="Workspace ativo"><Input value={workspace?.name ?? "Nenhum workspace selecionado"} readOnly /></Field></div></SettingsSection>
    </div><aside className="space-y-3"><QuickLink icon={Boxes} title="Conectores e canais" description="Credenciais, webhooks e adapters" href="/connections" /><QuickLink icon={Database} title="Conhecimento" description="Base usada pelos agentes" href="/agents" /><QuickLink icon={Workflow} title="Workflows" description="Gatilhos, filas e aprovações" href="/workflows" /><QuickLink icon={KeyRound} title="Execuções" description="Logs e rastreabilidade" href="/runs" /><Card className="mt-5 bg-elevated p-4"><SlidersHorizontal className="size-5 text-accent" /><h3 className="mt-3 font-display font-semibold">Configuração por ambiente</h3><p className="mt-2 text-xs leading-relaxed text-muted">Preferências ficam vinculadas à sua conta. Segredos, permissões e credenciais ficam vinculados ao workspace e permanecem somente no servidor.</p></Card></aside></div></div></AppShell>;
}

function SettingsSection({ icon: Icon, title, description, children }: { icon: ComponentType<{ className?: string }>; title: string; description: string; children: ReactNode }) { return <Card className="p-5"><div className="flex gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><Icon className="size-4" /></div><div className="min-w-0 flex-1"><h2 className="font-display text-lg font-semibold">{title}</h2><p className="mt-1 text-sm text-muted">{description}</p></div></div><div className="mt-5 divide-y divide-border">{children}</div></Card>; }
function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: () => void }) { return <div className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{label}</p><p className="mt-1 text-xs leading-relaxed text-muted">{description}</p></div><Switch checked={checked} onCheckedChange={onChange} aria-label={label} /></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-sm"><span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>{children}</label>; }
function QuickLink({ icon: Icon, title, description, href }: { icon: ComponentType<{ className?: string }>; title: string; description: string; href: "/connections" | "/agents" | "/workflows" | "/runs" }) { return <Link to={href} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:bg-elevated"><span className="flex size-8 items-center justify-center rounded-lg bg-elevated text-muted"><Icon className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{title}</span><span className="block truncate text-xs text-muted">{description}</span></span><ChevronRight className="size-4 text-subtle" /></Link>; }
