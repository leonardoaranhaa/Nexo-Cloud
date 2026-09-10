import { useEffect, useMemo, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Copy, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CreateConnectionDialog } from "@/components/create-connection-dialog";
import { QrPanel } from "@/components/qr-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusDot } from "@/components/status-dot";
import { CONNECTION_STATUS_LABEL } from "@/lib/labels";
import { useNexo } from "@/lib/store";
import { PROVIDER_HINT, PROVIDER_LABEL } from "@/lib/types";
import { copyText, formatPhone, formatRelative } from "@/lib/utils";
import { simulatedPhone, webhookUrl } from "@/lib/webhooks";

type Search = { focus?: string };

export const Route = createFileRoute("/connections")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    focus: typeof s.focus === "string" ? s.focus : undefined,
  }),
  component: ConnectionsPage,
});

function ConnectionsPage() {
  const { focus } = Route.useSearch();
  const connections = useNexo((s) => s.connections);
  const agents = useNexo((s) => s.agents);
  const updateConnection = useNexo((s) => s.updateConnection);
  const removeConnection = useNexo((s) => s.removeConnection);
  const log = useNexo((s) => s.log);
  const selected = connections.find((c) => c.id === focus) ?? connections[0];
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!focus) return;
    cardRefs.current[focus]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focus]);

  const bound = useMemo(
    () => agents.filter((a) => a.connectionId === selected?.id),
    [agents, selected?.id],
  );

  return (
    <AppShell title="Conexões" action={<CreateConnectionDialog />}>
      <p className="mb-6 max-w-2xl text-sm leading-relaxed text-muted">
        Três jeitos de virar API: Evolution (QR, auto-hospedada), Meta Cloud (oficial, por
        conversa) e Z-API (instância pronta). O agente nasce no estúdio e só entra no ar quando
        o canal está pareado.
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex flex-col gap-3">
          {connections.length === 0 && (
            <Card className="p-6 text-sm text-muted">Nenhuma conexão ainda.</Card>
          )}
          {connections.map((c) => {
            const used = agents.filter((a) => a.connectionId === c.id).length;
            const active = selected?.id === c.id;
            return (
              <div
                key={c.id}
                ref={(el) => {
                  cardRefs.current[c.id] = el;
                }}
              >
                <Link
                  to="/connections"
                  search={{ focus: c.id }}
                  className="block"
                >
                  <Card
                    className={
                      active
                        ? "border-accent bg-elevated p-4"
                        : "p-4 hover:bg-elevated/50"
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{c.name}</span>
                          <StatusDot status={c.status} />
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          {PROVIDER_LABEL[c.provider]} · {PROVIDER_HINT[c.provider]}
                        </div>
                      </div>
                      <Badge
                        tone={
                          c.status === "connected" ? "live" : c.status === "qr" ? "warn" : "neutral"
                        }
                      >
                        {CONNECTION_STATUS_LABEL[c.status]}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      {c.phone && <span>{formatPhone(c.phone)}</span>}
                      {c.instance && <span className="font-mono">{c.instance}</span>}
                      <span>
                        {used} {used === 1 ? "agente" : "agentes"}
                      </span>
                      {c.lastEventAt && <span>último evento {formatRelative(c.lastEventAt)}</span>}
                    </div>
                  </Card>
                </Link>
              </div>
            );
          })}
        </div>

        {selected && (
          <Card className="h-fit p-4">
            <div className="font-display text-sm font-semibold">{selected.name}</div>
            <p className="mt-1 text-xs text-muted">{PROVIDER_HINT[selected.provider]}</p>

            <div className="mt-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sel-name">Nome</Label>
                <Input
                  id="sel-name"
                  value={selected.name}
                  onChange={(e) => updateConnection(selected.id, { name: e.target.value })}
                />
              </div>
              {selected.provider !== "meta" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sel-inst">Instância</Label>
                  <Input
                    id="sel-inst"
                    value={selected.instance ?? ""}
                    onChange={(e) => updateConnection(selected.id, { instance: e.target.value })}
                  />
                </div>
              )}
              {selected.provider === "meta" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sel-pn">Phone number ID</Label>
                  <Input
                    id="sel-pn"
                    value={selected.phoneNumberId ?? ""}
                    onChange={(e) =>
                      updateConnection(selected.id, { phoneNumberId: e.target.value })
                    }
                  />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label>Webhook</Label>
                <button
                  type="button"
                  className="rounded-md border border-border bg-bg px-3 py-2 text-left font-mono text-xs break-all text-muted hover:text-fg"
                  onClick={() => {
                    void copyText(webhookUrl(selected)).then(() => toast("Webhook copiado"));
                  }}
                >
                  <Copy className="mr-1 inline size-3" />
                  {webhookUrl(selected)}
                </button>
              </div>
            </div>

            {(selected.status === "qr" || selected.status === "disconnected") &&
              selected.provider !== "meta" && (
                <div className="mt-5">
                  <QrPanel
                    seed={selected.id + (selected.instance ?? "")}
                    onConfirm={() => {
                      const phone = simulatedPhone(selected.id);
                      updateConnection(selected.id, {
                        status: "connected",
                        phone,
                        lastEventAt: Date.now(),
                      });
                      log("connection", `${selected.name} pareada via QR`);
                      toast("Número pareado no preview");
                    }}
                  />
                </div>
              )}

            {selected.provider === "meta" && selected.status !== "connected" && (
              <Button
                className="mt-4 w-full"
                variant="live"
                onClick={() => {
                  if (!selected.phoneNumberId) {
                    toast("Informe o Phone number ID");
                    return;
                  }
                  updateConnection(selected.id, {
                    status: "connected",
                    lastEventAt: Date.now(),
                  });
                  log("connection", `${selected.name} ligada à Cloud API`);
                  toast("Meta Cloud conectada no preview");
                }}
              >
                Confirmar Cloud API
              </Button>
            )}

            {selected.status === "connected" && selected.phone && (
              <p className="mt-4 text-sm text-live">Pareado · {formatPhone(selected.phone)}</p>
            )}

            {bound.length > 0 && (
              <div className="mt-5">
                <div className="mb-2 text-xs tracking-wide text-subtle uppercase">Agentes</div>
                <div className="flex flex-col gap-1">
                  {bound.map((a) => (
                    <Link
                      key={a.id}
                      to="/agents/$id"
                      params={{ id: a.id }}
                      search={{ tab: "test" }}
                      className="rounded-md px-2 py-1.5 text-sm hover:bg-elevated"
                    >
                      {a.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <Button
              variant="ghost"
              className="mt-4 text-danger hover:text-danger"
              onClick={() => {
                removeConnection(selected.id);
                toast("Conexão removida");
              }}
            >
              <Trash2 className="size-3.5" />
              Remover
            </Button>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
