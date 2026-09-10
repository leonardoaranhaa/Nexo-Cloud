import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle, RefreshCw, UserRound } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  listWorkspaceConversationMessages,
  listWorkspaceConversations,
  markWorkspaceConversationRead,
  sendWorkspaceConversationMessage,
  updateWorkspaceConversationHandoff,
} from "@/lib/multitenancy/api";
import { useNexo } from "@/lib/store";

export const Route = createFileRoute("/inbox")({ component: InboxPage });

type Conversation = Awaited<ReturnType<typeof listWorkspaceConversations>>[number];
type ConversationMessage = Awaited<ReturnType<typeof listWorkspaceConversationMessages>>[number];

type Filter = "open" | "pending" | "closed";

function messageText(message: ConversationMessage) {
  const content = message.content as { text?: string; caption?: string };
  return content.text ?? content.caption ?? "Mensagem sem texto";
}

function formatTime(value: string | null) {
  if (!value) return "Sem mensagens";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function statusLabel(status: Conversation["status"]) {
  return status === "pending" ? "Handoff" : status === "closed" ? "Encerrada" : "Aberta";
}

function InboxPage() {
  const workspaceId = useNexo((s) => s.workspaceId);
  const backendReady = useNexo((s) => s.backendReady);
  const [filter, setFilter] = useState<Filter>("open");
  const [search, setSearch] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);

  const selected = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const loadConversations = useCallback(async () => {
    if (!backendReady || !workspaceId) return;
    setLoading(true);
    try {
      const next = await listWorkspaceConversations({ data: { workspaceId, status: filter, search } });
      setConversations(next);
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? null);
    } catch {
      toast("Não foi possível carregar o inbox.");
    } finally {
      setLoading(false);
    }
  }, [backendReady, filter, search, workspaceId]);

  const loadMessages = useCallback(async () => {
    if (!backendReady || !workspaceId || !selectedId) {
      setMessages([]);
      return;
    }
    try {
      await markWorkspaceConversationRead({ data: { workspaceId, conversationId: selectedId } });
      setMessages(await listWorkspaceConversationMessages({ data: { workspaceId, conversationId: selectedId } }));
    } catch {
      toast("Não foi possível carregar a conversa.");
    }
  }, [backendReady, selectedId, workspaceId]);

  useEffect(() => { void loadConversations(); }, [loadConversations]);
  useEffect(() => { void loadMessages(); }, [loadMessages]);
  useEffect(() => {
    const timer = window.setInterval(() => { void loadConversations(); void loadMessages(); }, 5000);
    return () => window.clearInterval(timer);
  }, [loadConversations, loadMessages]);

  async function handoff(action: "assign" | "release" | "resume" | "close") {
    if (!workspaceId || !selected) return;
    try {
      await updateWorkspaceConversationHandoff({ data: { workspaceId, conversationId: selected.id, action } });
      await loadConversations();
      toast(action === "assign" ? "Conversa assumida pelo operador." : action === "close" ? "Conversa encerrada." : action === "resume" ? "Agente retomará a conversa." : "Conversa devolvida à fila.");
    } catch {
      toast("Não foi possível atualizar o handoff.");
    }
  }

  async function sendMessage() {
    const text = draft.trim();
    if (!workspaceId || !selected || !text) return;
    try {
      await sendWorkspaceConversationMessage({
        data: {
          workspaceId,
          conversationId: selected.id,
          text,
          idempotencyKey: `inbox:${selected.id}:${crypto.randomUUID()}`,
          traceId: crypto.randomUUID(),
        },
      });
      setDraft("");
      await loadMessages();
      await loadConversations();
    } catch {
      toast("Não foi possível enviar a mensagem. Verifique a conexão do canal.");
    }
  }

  if (!backendReady) {
    return <AppShell title="Inbox"><Card className="p-6 text-sm text-muted">O inbox operacional depende do backend persistente. O workspace local ainda está carregando.</Card></AppShell>;
  }

  return (
    <AppShell title="Inbox">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-lg font-semibold">Conversas</p>
          <p className="text-sm text-muted">Acompanhe mensagens e assuma atendimentos do Agent Runtime.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void loadConversations()} disabled={loading}>
          <RefreshCw className="size-3.5" /> Atualizar
        </Button>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
        <Card className="min-h-[34rem] overflow-hidden p-0">
          <div className="border-b border-border p-3">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar telefone" />
            <div className="mt-3 flex gap-1">
              {(["open", "pending", "closed"] as Filter[]).map((item) => (
                <Button key={item} size="sm" variant={filter === item ? "default" : "ghost"} onClick={() => setFilter(item)}>
                  {item === "pending" ? "Handoff" : item === "closed" ? "Encerradas" : "Abertas"}
                </Button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-border">
            {conversations.map((conversation) => (
              <button key={conversation.id} type="button" onClick={() => setSelectedId(conversation.id)} className={`w-full p-3 text-left hover:bg-elevated/60 ${selectedId === conversation.id ? "bg-elevated" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{conversation.externalContactId}</span>
                  <span className="text-xs text-muted">{formatTime(conversation.lastMessageAt)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                  <Badge tone={conversation.status === "pending" ? "warn" : conversation.status === "closed" ? "neutral" : "live"}>{statusLabel(conversation.status)}</Badge>
                  <span>{conversation.agentName}</span>
                  {conversation.unreadCount > 0 && <span className="ml-auto text-fg">{conversation.unreadCount} nova(s)</span>}
                </div>
                <p className="mt-2 truncate text-sm text-muted">{conversation.lastMessageText ?? "Sem mensagens"}</p>
              </button>
            ))}
            {conversations.length === 0 && <div className="p-6 text-sm text-muted">Nenhuma conversa nesta fila.</div>}
          </div>
        </Card>

        <Card className="flex min-h-[34rem] flex-col p-0">
          {selected ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                <div>
                  <div className="flex items-center gap-2 font-display font-semibold"><MessageCircle className="size-4" />{selected.externalContactId}</div>
                  <p className="mt-1 text-xs text-muted">{selected.connectionName} · {selected.agentName}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selected.status === "pending" ? <Button size="sm" onClick={() => void handoff("resume")}>Devolver ao agente</Button> : <Button size="sm" variant="secondary" onClick={() => void handoff("assign")}><UserRound className="size-3.5" /> Assumir</Button>}
                  {selected.status !== "closed" && <Button size="sm" variant="ghost" onClick={() => void handoff("close")}>Encerrar</Button>}
                </div>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${message.direction === "outbound" ? "bg-fg text-bg" : "bg-elevated"}`}>
                      <div>{messageText(message)}</div>
                      <div className={`mt-1 text-[10px] ${message.direction === "outbound" ? "text-bg/60" : "text-muted"}`}>{message.senderType} · {formatTime(message.createdAt)}</div>
                    </div>
                  </div>
                ))}
                {messages.length === 0 && <p className="text-sm text-muted">Nenhuma mensagem persistida.</p>}
              </div>
              <div className="border-t border-border p-3">
                <div className="flex gap-2">
                  <Input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder="Responder como operador" disabled={selected.status === "closed"} />
                  <Button onClick={() => void sendMessage()} disabled={selected.status === "closed" || !draft.trim()}>Enviar</Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted">Selecione uma conversa para operar.</div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
