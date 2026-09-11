import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, CalendarDays, CheckCircle2, Clock3, Plus, RefreshCw, TicketCheck } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { blockWorkspaceAvailabilitySlot, bookWorkspaceAvailabilitySlot, listWorkspaceAvailabilitySlots, provisionWorkspaceAvailabilitySlots } from "@/lib/multitenancy/api";
import { useNexo } from "@/lib/store";

export const Route = createFileRoute("/calendar")({ component: CalendarPage });
type Slot = Awaited<ReturnType<typeof listWorkspaceAvailabilitySlots>>[number];

type SlotStatus = "available" | "booked" | "blocked";

function dateValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function localDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function statusLabel(status: SlotStatus) {
  return ({ available: "Disponível", booked: "Reservado", blocked: "Bloqueado" } as Record<SlotStatus, string>)[status];
}

function statusTone(status: SlotStatus): "live" | "accent" | "neutral" {
  return status === "available" ? "live" : status === "booked" ? "accent" : "neutral";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function CalendarPage() {
  const workspaceId = useNexo((state) => state.workspaceId);
  const backendReady = useNexo((state) => state.backendReady);
  const today = new Date();
  const [from, setFrom] = useState(dateValue(today));
  const [to, setTo] = useState(dateValue(new Date(today.getTime() + 14 * 86400000)));
  const [status, setStatus] = useState<"" | SlotStatus>("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newStart, setNewStart] = useState(localDateTimeValue(new Date(Date.now() + 3600000)));
  const [newEnd, setNewEnd] = useState(localDateTimeValue(new Date(Date.now() + 5400000)));
  const [resourceLabel, setResourceLabel] = useState("");
  const [bookingSlot, setBookingSlot] = useState<Slot | null>(null);
  const [externalContactId, setExternalContactId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [bookingNotes, setBookingNotes] = useState("");

  const load = useCallback(async () => {
    if (!workspaceId || !backendReady) return;
    setLoading(true);
    try {
      const result = await listWorkspaceAvailabilitySlots({
        data: {
          workspaceId,
          from: new Date(`${from}T00:00:00`).toISOString(),
          to: new Date(`${to}T23:59:59.999`).toISOString(),
          status: status || undefined,
          limit: 300,
        },
      });
      setSlots(result);
    } catch {
      toast.error("Não foi possível carregar os horários da Agenda.");
    } finally {
      setLoading(false);
    }
  }, [backendReady, from, status, to, workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => ({
    available: slots.filter((slot) => slot.status === "available").length,
    booked: slots.filter((slot) => slot.status === "booked").length,
    blocked: slots.filter((slot) => slot.status === "blocked").length,
  }), [slots]);

  async function createSlot(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId) return;
    setSaving(true);
    try {
      const result = await provisionWorkspaceAvailabilitySlots({ data: { workspaceId, slots: [{ startAt: new Date(newStart).toISOString(), endAt: new Date(newEnd).toISOString(), resourceLabel: resourceLabel || undefined }] } });
      toast.success(result.created ? "Horário adicionado à Agenda." : "Esse horário já estava cadastrado.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error && error.message.includes("RANGE") ? "O fim precisa ser depois do início." : "Não foi possível adicionar o horário.");
    } finally {
      setSaving(false);
    }
  }

  async function blockSlot(slot: Slot) {
    if (!workspaceId) return;
    try {
      await blockWorkspaceAvailabilitySlot({ data: { workspaceId, slotId: slot.id } });
      toast.success("Horário bloqueado.");
      await load();
    } catch {
      toast.error("Esse horário não está mais disponível para bloqueio.");
    }
  }

  async function bookSlot(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !bookingSlot || !externalContactId.trim()) return;
    setSaving(true);
    try {
      await bookWorkspaceAvailabilitySlot({ data: { workspaceId, slotId: bookingSlot.id, externalContactId: externalContactId.trim(), customerName: customerName.trim() || undefined, notes: bookingNotes.trim() || undefined, idempotencyKey: `console:${workspaceId}:${bookingSlot.id}:${externalContactId.trim()}` } });
      toast.success("Horário reservado.");
      setBookingSlot(null);
      setExternalContactId("");
      setCustomerName("");
      setBookingNotes("");
      await load();
    } catch {
      toast.error("Não foi possível reservar esse horário. Ele pode já ter sido ocupado.");
    } finally {
      setSaving(false);
    }
  }

  if (!backendReady) return <AppShell title="Agenda"><Card className="p-6 text-sm text-muted">A Agenda depende do backend persistente e do workspace ativo.</Card></AppShell>;

  return <AppShell title="Agenda">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="flex items-center gap-2"><CalendarDays className="size-5 text-accent" /><h1 className="font-display text-2xl font-semibold">Agenda operacional</h1></div>
        <p className="mt-1 max-w-2xl text-sm text-muted">Disponibilize horários para os agentes consultarem e reservarem com segurança.</p>
      </div>
      <Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /> Atualizar</Button>
    </div>

    <div className="mb-5 grid gap-3 sm:grid-cols-3">
      <Card className="p-4"><p className="text-xs text-muted">Disponíveis</p><p className="mt-2 font-display text-2xl font-semibold text-live">{summary.available}</p><p className="mt-1 text-xs text-subtle">Prontos para agentes</p></Card>
      <Card className="p-4"><p className="text-xs text-muted">Reservados</p><p className="mt-2 font-display text-2xl font-semibold text-accent">{summary.booked}</p><p className="mt-1 text-xs text-subtle">Compromissos confirmados</p></Card>
      <Card className="p-4"><p className="text-xs text-muted">Bloqueados</p><p className="mt-2 font-display text-2xl font-semibold">{summary.blocked}</p><p className="mt-1 text-xs text-subtle">Fora da disponibilidade</p></Card>
    </div>

    <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
      <div className="space-y-5">
        <Card className="p-5">
          <div className="mb-4 flex items-start gap-3"><div className="rounded-lg bg-accent/10 p-2 text-accent"><Plus className="size-4" /></div><div><h2 className="font-display font-semibold">Adicionar disponibilidade</h2><p className="mt-1 text-xs leading-relaxed text-muted">Crie um horário que poderá ser consultado e reservado pelos agentes autorizados.</p></div></div>
          <form className="grid gap-3" onSubmit={createSlot}>
            <label className="grid gap-1 text-xs text-muted">Início<input required type="datetime-local" value={newStart} onChange={(event) => setNewStart(event.target.value)} className="h-9 rounded-md border border-border bg-bg px-2 text-sm text-fg" /></label>
            <label className="grid gap-1 text-xs text-muted">Fim<input required type="datetime-local" value={newEnd} onChange={(event) => setNewEnd(event.target.value)} className="h-9 rounded-md border border-border bg-bg px-2 text-sm text-fg" /></label>
            <label className="grid gap-1 text-xs text-muted">Recurso ou responsável <Input value={resourceLabel} onChange={(event) => setResourceLabel(event.target.value)} placeholder="Ex.: Consultor comercial" /></label>
            <Button type="submit" disabled={saving}><Plus /> Adicionar horário</Button>
          </form>
        </Card>

        {bookingSlot && <Card className="border-accent/30 p-5">
          <div className="mb-4 flex items-start gap-3"><div className="rounded-lg bg-accent/10 p-2 text-accent"><TicketCheck className="size-4" /></div><div><h2 className="font-display font-semibold">Reservar horário</h2><p className="mt-1 text-xs text-muted">{formatDate(bookingSlot.startAt)} · {bookingSlot.resourceLabel || "Agenda geral"}</p></div></div>
          <form className="grid gap-3" onSubmit={bookSlot}>
            <label className="grid gap-1 text-xs text-muted">Contato externo<input required value={externalContactId} onChange={(event) => setExternalContactId(event.target.value)} placeholder="Telefone, e-mail ou ID do contato" className="h-9 rounded-md border border-border bg-bg px-2 text-sm text-fg" /></label>
            <label className="grid gap-1 text-xs text-muted">Nome do cliente <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Opcional" /></label>
            <label className="grid gap-1 text-xs text-muted">Observações <textarea value={bookingNotes} onChange={(event) => setBookingNotes(event.target.value)} placeholder="Opcional" className="min-h-20 rounded-md border border-border bg-bg px-2 py-2 text-sm text-fg" /></label>
            <div className="flex gap-2"><Button type="submit" disabled={saving}><TicketCheck /> Confirmar reserva</Button><Button type="button" variant="ghost" onClick={() => setBookingSlot(null)}>Cancelar</Button></div>
          </form>
        </Card>}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border p-5"><div><h2 className="font-display font-semibold">Disponibilidade</h2><p className="mt-1 text-xs text-muted">Consulte e opere os horários do workspace.</p></div><div className="flex flex-wrap gap-2"><label className="grid gap-1 text-[11px] text-muted">De<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-8 rounded-md border border-border bg-bg px-2 text-xs text-fg" /></label><label className="grid gap-1 text-[11px] text-muted">Até<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-8 rounded-md border border-border bg-bg px-2 text-xs text-fg" /></label><label className="grid gap-1 text-[11px] text-muted">Status<select value={status} onChange={(event) => setStatus(event.target.value as "" | SlotStatus)} className="h-8 rounded-md border border-border bg-bg px-2 text-xs text-fg"><option value="">Todos</option><option value="available">Disponíveis</option><option value="booked">Reservados</option><option value="blocked">Bloqueados</option></select></label></div></div>
        <div className="divide-y divide-border">{slots.map((slot) => <div key={slot.id} className="flex flex-wrap items-center gap-3 p-4"><div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-elevated text-accent"><Clock3 className="size-4" /></div><div className="min-w-0 flex-1"><p className="text-sm font-medium">{formatDate(slot.startAt)} — {new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(new Date(slot.endAt))}</p><p className="mt-1 truncate text-xs text-muted">{slot.resourceLabel || "Agenda geral"}</p></div><Badge tone={statusTone(slot.status)}>{slot.status === "available" && <CheckCircle2 className="mr-1 size-3" />}{statusLabel(slot.status)}</Badge>{slot.status === "available" && <div className="flex gap-2"><Button size="sm" onClick={() => setBookingSlot(slot)}><TicketCheck /> Reservar</Button><Button size="sm" variant="ghost" aria-label="Bloquear horário" onClick={() => void blockSlot(slot)}><Ban /></Button></div>}</div>)}{!loading && slots.length === 0 && <div className="p-10 text-center"><CalendarDays className="mx-auto size-8 text-subtle" /><p className="mt-3 text-sm font-medium">Nenhum horário encontrado</p><p className="mt-1 text-xs text-muted">Adicione disponibilidade ou ajuste o período pesquisado.</p></div>}{loading && <div className="p-10 text-center text-sm text-muted">Carregando disponibilidade…</div>}</div>
      </Card>
    </div>
  </AppShell>;
}
