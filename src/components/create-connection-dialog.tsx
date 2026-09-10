import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogTrigger } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { PROVIDER_HINT, PROVIDER_LABEL, type Provider } from "@/lib/types";
import { useNexo } from "@/lib/store";
import { cn } from "@/lib/utils";
import { createWorkspaceConnection } from "@/lib/multitenancy/api";
import { useWorkspaceData } from "@/lib/multitenancy/use-workspace-data";

export function CreateConnectionDialog({
  triggerLabel = "Nova conexão",
  onCreated,
}: {
  triggerLabel?: string;
  onCreated?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<Provider>("evolution");
  const [name, setName] = useState("");
  const [instance, setInstance] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const addConnection = useNexo((s) => s.addConnection);
  const workspaceId = useNexo((s) => s.workspaceId);
  const backendReady = useNexo((s) => s.backendReady);
  const navigate = useNavigate();
  const { refresh } = useWorkspaceData();
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const data = {
        name: name.trim() || PROVIDER_LABEL[provider],
        provider,
        instance: instance.trim() || undefined,
        phoneNumberId: phoneNumberId.trim() || undefined,
        baseUrl: provider === "evolution" ? "https://evo.nexo.local" : undefined,
      };
      const id = backendReady && workspaceId
        ? (await createWorkspaceConnection({ data: { workspaceId, ...data } })).id
        : addConnection({ ...data, status: provider === "meta" ? "disconnected" : "qr" });
      if (backendReady && workspaceId) await refresh(workspaceId);
      setOpen(false);
      setName("");
      setInstance("");
      setPhoneNumberId("");
      if (onCreated) {
        onCreated(id);
        return;
      }
      void navigate({ to: "/connections", search: { focus: id } });
    } catch {
      // Keep the dialog open so the user can correct the connection data.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent title="Nova conexão">
        <p className="mt-1 mb-4 text-sm text-muted">
          O middleware que transforma o WhatsApp em API. Evolution lê QR; Meta é a via oficial.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(["evolution", "meta", "zapi"] as Provider[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProvider(p)}
              className={cn(
                "rounded-lg border px-2 py-3 text-left",
                provider === p ? "border-accent bg-elevated" : "border-border bg-bg",
              )}
            >
              <div className="text-xs font-medium">{PROVIDER_LABEL[p]}</div>
              <div className="mt-1 text-[0.65rem] leading-snug text-muted">{PROVIDER_HINT[p]}</div>
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="conn-name">Nome</Label>
            <Input
              id="conn-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Loja Centro"
            />
          </div>
          {provider !== "meta" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="conn-instance">Instância</Label>
              <Input
                id="conn-instance"
                value={instance}
                onChange={(e) => setInstance(e.target.value)}
                placeholder="aurora-loja"
              />
            </div>
          )}
          {provider === "meta" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="conn-pnid">Phone number ID</Label>
              <Input
                id="conn-pnid"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                placeholder="10987…"
              />
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>{busy ? "Salvando…" : "Criar"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
