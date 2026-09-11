import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Bot, CalendarDays, CircleHelp, Send, Sparkles, Store } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Action = { label: string; to: "/agents" | "/connections" | "/calendar" | "/marketplace" | "/settings" };
type Message = { id: number; role: "bot" | "user"; text: string; actions?: Action[] };

const STARTER_ACTIONS: Action[] = [
  { label: "Criar um agente", to: "/agents" },
  { label: "Explorar agentes prontos", to: "/marketplace" },
  { label: "Conectar um canal", to: "/connections" },
];

function replyFor(text: string): { text: string; actions?: Action[] } {
  const value = text.toLowerCase();
  if (value.includes("agente") || value.includes("criar") || value.includes("vender") || value.includes("atender")) {
    return { text: "Posso te levar para criar um agente do zero ou para instalar um agente pronto e personalizá-lo no workspace.", actions: [{ label: "Criar um agente", to: "/agents" }, { label: "Ver agentes prontos", to: "/marketplace" }] };
  }
  if (value.includes("conectar") || value.includes("whatsapp") || value.includes("meta") || value.includes("canal")) {
    return { text: "Os canais são configurados em Conectores. Depois de conectar, você pode vincular o canal a um agente e testar o atendimento.", actions: [{ label: "Abrir Conectores", to: "/connections" }] };
  }
  if (value.includes("agenda") || value.includes("horário") || value.includes("horario") || value.includes("reserv")) {
    return { text: "A Agenda permite disponibilizar horários, bloquear períodos e reservar um slot para um contato. Posso abrir essa área para você.", actions: [{ label: "Abrir Agenda", to: "/calendar" }] };
  }
  if (value.includes("config") || value.includes("workspace") || value.includes("ambiente")) {
    return { text: "As Configurações concentram preferências do console, ambiente padrão, notificações e políticas operacionais.", actions: [{ label: "Abrir Configurações", to: "/settings" }] };
  }
  return { text: "Posso te orientar na criação de agentes, conexão de canais, uso da Agenda, instalação de agentes prontos ou configuração do workspace. O que você precisa fazer agora?", actions: STARTER_ACTIONS };
}

export function NexoBot() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: "bot", text: "Olá, eu sou o Nexo Bot. Posso te ajudar a encontrar uma função ou iniciar uma ação no console. Precisa de ajuda?", actions: STARTER_ACTIONS },
  ]);

  function sendMessage(value = input) {
    const text = value.trim();
    if (!text) return;
    const response = replyFor(text);
    setMessages((current) => [...current, { id: Date.now(), role: "user", text }, { id: Date.now() + 1, role: "bot", text: response.text, actions: response.actions }]);
    setInput("");
  }

  function runAction(action: Action) {
    setOpen(false);
    void navigate({ to: action.to });
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
        <div className="border-b border-border bg-surface px-5 py-4"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-fg"><Bot className="size-5" /></span><div><div className="flex items-center gap-2"><span className="rounded-full bg-live/15 px-2 py-0.5 text-[10px] font-medium text-live">Assistente do console</span></div><p className="mt-1 text-xs text-muted">Orientação rápida e ações guiadas no workspace.</p></div></div></div>
        <div className="max-h-[min(28rem,55vh)] space-y-4 overflow-y-auto bg-bg p-4">
          {messages.map((message) => <div key={message.id} className={message.role === "user" ? "ml-8" : "mr-4"}><div className={message.role === "user" ? "rounded-2xl rounded-br-md bg-accent px-3 py-2 text-sm text-accent-fg" : "rounded-2xl rounded-bl-md border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-fg"}>{message.role === "bot" && <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-accent"><Sparkles className="size-3" /> Nexo Bot</div>}{message.text}</div>{message.actions && <div className="mt-2 flex flex-wrap gap-2">{message.actions.map((action) => <button key={action.to} type="button" onClick={() => runAction(action)} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:text-fg"><ActionIcon to={action.to} />{action.label}<ArrowRight className="size-3" /></button>)}</div>}</div>)}
        </div>
        <form onSubmit={(event) => { event.preventDefault(); sendMessage(); }} className="flex gap-2 border-t border-border bg-surface p-3"><Input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Descreva o que você quer fazer…" aria-label="Mensagem para o Nexo Bot" autoComplete="off" /><Button type="submit" size="icon-sm" aria-label="Enviar mensagem" disabled={!input.trim()}><Send className="size-4" /></Button></form>
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] text-subtle"><span><CircleHelp className="mr-1 inline size-3" />Protótipo guiado</span><button type="button" onClick={() => setMessages([{ id: Date.now(), role: "bot", text: "Olá, eu sou o Nexo Bot. Posso te ajudar a encontrar uma função ou iniciar uma ação no console. Precisa de ajuda?", actions: STARTER_ACTIONS }])} className="hover:text-muted">Reiniciar conversa</button></div>
      </DialogContent>
    </Dialog>
  </>;
}

function ActionIcon({ to }: { to: Action["to"] }) {
  if (to === "/marketplace") return <Store className="size-3.5 text-accent" />;
  if (to === "/calendar") return <CalendarDays className="size-3.5 text-accent" />;
  return <Bot className="size-3.5 text-accent" />;
}
