import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Bot, CalendarDays, CheckCircle2, CircleHelp, LoaderCircle, Send, Sparkles, Store } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { chatNexoBot, executeNexoBotAction } from "@/lib/multitenancy/api";
import type { NexoBotAction } from "@/lib/nexo-bot/server";
import { useNexo } from "@/lib/store";

type Message = { id: string; role: "bot" | "user"; text: string; action?: NexoBotAction; actionState?: "pending" | "executing" | "completed" | "failed" };

const STARTER_ACTIONS: NexoBotAction[] = [
  { id: "starter-agents", type: "navigate", label: "Criar um agente", summary: "Abrir Agentes.", requiresConfirmation: false, route: "/agents" },
  { id: "starter-marketplace", type: "navigate", label: "Explorar agentes prontos", summary: "Abrir Marketplace.", requiresConfirmation: false, route: "/marketplace" },
  { id: "starter-connections", type: "navigate", label: "Conectar um canal", summary: "Abrir Conectores.", requiresConfirmation: false, route: "/connections" },
];

const INITIAL_MESSAGE: Message = { id: "welcome", role: "bot", text: "Olá, eu sou o Nexo Bot. Agora posso consultar o modelo do Nexo Cloud, orientar você e propor ações no workspace. Precisa de ajuda?", actionState: "pending" };

export function NexoBot() {
  const navigate = useNavigate();
  const workspaceId = useNexo((state) => state.workspaceId);
  const backendReady = useNexo((state) => state.backendReady);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);

  async function sendMessage(value = input) {
    const content = value.trim();
    if (!content || loading) return;
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", text: content };
    const history = [...messages, userMessage].map((message) => ({ role: message.role === "bot" ? "assistant" as const : "user" as const, content: message.text }));
    setMessages((current) => [...current, userMessage]);
    setInput("");
    if (!workspaceId || !backendReady) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "bot", text: "O workspace ainda está carregando. Tente novamente em instantes." }]);
      return;
    }
    setLoading(true);
    try {
      const result = await chatNexoBot({ data: { workspaceId, messages: history } });
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "bot", text: result.ok ? result.text : result.message, ...(result.ok && result.action ? { action: result.action, actionState: "pending" as const } : {}) }]);
    } catch {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "bot", text: "Não consegui consultar o Nexo Bot agora. Tente novamente." }]);
    } finally {
      setLoading(false);
    }
  }

  function runAction(action: NexoBotAction) {
    if (action.requiresConfirmation) return;
    setOpen(false);
    void navigate({ to: action.route });
  }

  async function confirmAction(messageId: string, action: NexoBotAction) {
    if (!workspaceId || !backendReady || !action.requiresConfirmation || loading) return;
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, actionState: "executing" } : message));
    setLoading(true);
    try {
      const result = await executeNexoBotAction({ data: { workspaceId, action } });
      setMessages((current) => [...current.map((message) => message.id === messageId ? { ...message, actionState: result.ok ? "completed" as const : "failed" as const } : message), { id: crypto.randomUUID(), role: "bot", text: result.ok ? result.message : result.message }]);
    } catch {
      setMessages((current) => [...current.map((message) => message.id === messageId ? { ...message, actionState: "failed" as const } : message), { id: crypto.randomUUID(), role: "bot", text: "A ação não pôde ser concluída. Nenhuma alteração adicional foi executada." }]);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setMessages([INITIAL_MESSAGE]);
    setInput("");
  }

  return <>
    <div className="fixed bottom-5 right-5 z-40">
      <button type="button" onClick={() => setOpen(true)} aria-label="Abrir Nexo Bot" className="group flex items-center gap-2 rounded-full border border-accent/30 bg-surface px-3 py-2 text-left shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
        <span className="flex size-8 items-center justify-center rounded-full bg-accent text-accent-fg"><Bot className="size-4" /></span>
        <span className="hidden pr-1 sm:block"><span className="block text-xs font-semibold">Nexo Bot</span><span className="block text-[11px] text-muted">Precisa de ajuda?</span></span>
      </button>
    </div>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="Nexo Bot" className="max-w-md overflow-hidden p-0">
        <div className="border-b border-border bg-surface px-5 py-4"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-fg"><Bot className="size-5" /></span><div><span className="rounded-full bg-live/15 px-2 py-0.5 text-[10px] font-medium text-live">LLM conectado</span><p className="mt-1 text-xs text-muted">Assistência avançada e ações guiadas no workspace.</p></div></div></div>
        <div className="max-h-[min(28rem,55vh)] space-y-4 overflow-y-auto bg-bg p-4">
          {messages.map((message) => <div key={message.id} className={message.role === "user" ? "ml-8" : "mr-4"}><div className={message.role === "user" ? "rounded-2xl rounded-br-md bg-accent px-3 py-2 text-sm text-accent-fg" : "rounded-2xl rounded-bl-md border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-fg"}>{message.role === "bot" && <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-accent"><Sparkles className="size-3" /> Nexo Bot</div>}{message.text}</div>{message.id === "welcome" && <ActionList actions={STARTER_ACTIONS} onAction={runAction} />}{message.action && <ActionList messageId={message.id} actionState={message.actionState} actions={[message.action]} onAction={runAction} onConfirm={confirmAction} />}</div>)}
          {loading && <div className="mr-4 flex items-center gap-2 rounded-2xl rounded-bl-md border border-border bg-surface px-3 py-2 text-xs text-muted"><LoaderCircle className="size-3.5 animate-spin" />Consultando o Nexo Bot…</div>}
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void sendMessage(); }} className="flex gap-2 border-t border-border bg-surface p-3"><Input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Descreva o que você quer fazer…" aria-label="Mensagem para o Nexo Bot" autoComplete="off" /><Button type="submit" size="icon-sm" aria-label="Enviar mensagem" disabled={!input.trim() || loading}><Send className="size-4" /></Button></form>
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] text-subtle"><span><CircleHelp className="mr-1 inline size-3" />Modelo server-side · ações confirmadas</span><button type="button" onClick={reset} className="hover:text-muted">Reiniciar conversa</button></div>
      </DialogContent>
    </Dialog>
  </>;
}

function ActionList({ actions, onAction, onConfirm, messageId, actionState }: { actions: NexoBotAction[]; onAction: (action: NexoBotAction) => void; onConfirm?: (messageId: string, action: NexoBotAction) => void; messageId?: string; actionState?: Message["actionState"] }) {
  return <div className="mt-2 flex flex-wrap gap-2">{actions.map((action) => action.requiresConfirmation ? <div key={action.id} className="w-full rounded-lg border border-accent/30 bg-surface p-3"><div className="flex items-start gap-2"><ActionIcon action={action} /><div className="min-w-0 flex-1"><p className="text-xs font-semibold">Ação proposta: {action.label}</p><p className="mt-1 text-xs leading-relaxed text-muted">{action.summary}</p></div></div>{actionState === "completed" ? <p className="mt-2 flex items-center gap-1 text-xs text-live"><CheckCircle2 className="size-3.5" />Concluída</p> : actionState === "executing" ? <p className="mt-2 flex items-center gap-1 text-xs text-muted"><LoaderCircle className="size-3.5 animate-spin" />Executando com sua autorização…</p> : <Button className="mt-3" size="sm" onClick={() => { if (messageId && onConfirm) void onConfirm(messageId, action); }} disabled={actionState === "failed"}><CheckCircle2 /> Confirmar ação</Button>}</div> : <button key={action.id} type="button" onClick={() => onAction(action)} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:text-fg"><ActionIcon action={action} />{action.label}<ArrowRight className="size-3" /></button>)}</div>;
}

function ActionIcon({ action }: { action: NexoBotAction }) {
  if (action.type === "provision_calendar_slot") return <CalendarDays className="size-3.5 text-accent" />;
  if (action.type === "navigate" && action.route === "/marketplace") return <Store className="size-3.5 text-accent" />;
  return <Bot className="size-3.5 text-accent" />;
}
