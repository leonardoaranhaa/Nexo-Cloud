import { useEffect, useRef, useState } from "react";
import { Mic, SendHorizontal, Trash2 } from "lucide-react";
import type { Agent, ChatMessage } from "@/lib/types";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

export function PhonePreview({
  agent,
  messages,
  busy,
  onSend,
  onClear,
}: {
  agent: Agent;
  messages: ChatMessage[];
  busy?: boolean;
  onSend: (text: string, kind?: ChatMessage["kind"]) => void;
  onClear: () => void;
}) {
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  function submit() {
    const v = text.trim();
    if (!v || busy) return;
    onSend(v);
    setText("");
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="rounded-2xl border border-border bg-bg p-2 shadow-[var(--shadow-soft)]">
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex items-center gap-3 border-b border-border bg-elevated px-3 py-2.5">
            <div className="flex size-8 items-center justify-center rounded-full bg-live/20 font-display text-xs text-live">
              {agent.name.slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{agent.name}</div>
              <div className="text-[0.65rem] text-live">online · canal de teste</div>
            </div>
            <button
              type="button"
              onClick={onClear}
              className="rounded-md p-1.5 text-subtle hover:bg-bg hover:text-fg"
              aria-label="Limpar conversa"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
          <div ref={scroller} className="flex h-96 flex-col gap-2 overflow-y-auto px-3 py-3">
            {messages.length === 0 && (
              <div className="mx-auto mt-6 max-w-[16rem] rounded-lg bg-elevated px-3 py-2 text-center text-xs text-muted">
                {agent.welcomeMessage}
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm leading-snug", {
                  "self-end bg-bubble-out text-fg": m.role === "assistant",
                  "self-start bg-bubble-in text-fg": m.role === "user",
                })}
              >
                {m.kind === "audio" && (
                  <div className="mb-1 text-[0.65rem] uppercase tracking-wide text-muted">
                    áudio transcrito
                  </div>
                )}
                {m.content}
              </div>
            ))}
            {busy && (
              <div className="self-end rounded-lg bg-bubble-out px-3 py-2 text-sm text-muted">
                digitando
              </div>
            )}
          </div>
          <form
            className="flex items-center gap-2 border-t border-border bg-elevated px-2 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <button
              type="button"
              className="flex size-10 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-fg"
              onClick={() => onSend("Cliente enviou um áudio perguntando sobre prazo de entrega.", "audio")}
              aria-label="Simular áudio"
              disabled={busy}
            >
              <Mic className="size-4" />
            </button>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Mensagem"
              className="h-10 flex-1 rounded-md border border-border bg-bg px-3 text-sm text-fg placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none"
            />
            <Button type="submit" size="icon" disabled={busy || !text.trim()} aria-label="Enviar">
              <SendHorizontal className="size-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
