import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { getWorkspaceEvolutionConnectionState, startWorkspaceEvolutionQr } from "@/lib/multitenancy/api";
import { useNexo } from "@/lib/store";
import { useWorkspaceData } from "@/lib/multitenancy/use-workspace-data";
import type { Connection } from "@/lib/types";

function qrImageSource(value: string): string {
  if (value.startsWith("data:image/")) return value;
  return `data:image/png;base64,${value}`;
}

export function EvolutionQrConnect({ connection }: { connection: Connection }) {
  const workspaceId = useNexo((state) => state.workspaceId);
  const updateConnection = useNexo((state) => state.updateConnection);
  const { refresh } = useWorkspaceData();
  const [qr, setQr] = useState<string | null>(null);
  const [message, setMessage] = useState("Clique para gerar um QR Code seguro.");
  const [busy, setBusy] = useState(false);

  async function start() {
    if (!workspaceId) return;
    setBusy(true);
    try {
      const result = await startWorkspaceEvolutionQr({ data: { workspaceId, connectionId: connection.id } });
      setQr(result.qr ?? null);
      setMessage(result.message);
      if (result.status === "connected") {
        updateConnection(connection.id, { status: "connected", lastEventAt: Date.now() });
        await refresh(workspaceId);
      }
      if (result.status === "error") toast(result.message);
    } catch {
      setMessage("Configure primeiro a credencial Evolution e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!workspaceId || !qr) return;
    const timer = window.setInterval(() => {
      void getWorkspaceEvolutionConnectionState({ data: { workspaceId, connectionId: connection.id } }).then((result) => {
        setMessage(result.message);
        if (result.status === "connected") {
          setQr(null);
          updateConnection(connection.id, { status: "connected", lastEventAt: Date.now() });
          void refresh(workspaceId);
        }
      }).catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [connection.id, qr, refresh, updateConnection, workspaceId]);

  return (
    <Card className="mt-5 border-accent/40 bg-elevated p-4">
      <div className="font-display text-sm font-semibold">Conectar WhatsApp por QR Code</div>
      <p className="mt-1 text-xs leading-relaxed text-muted">Abra o WhatsApp no celular, entre em Dispositivos conectados e escaneie o código. A API key permanece no servidor.</p>
      <div className="mt-3 rounded-md border border-border bg-bg px-3 py-2 text-[0.7rem] leading-relaxed text-muted">
        Proteções ativas: intervalo mínimo de 3s, até 20 mensagens por janela de 5min, 200 por dia e pausa de 30min após handoff humano.
      </div>
      {qr ? <img src={qrImageSource(qr)} alt="QR Code para conectar o WhatsApp" className="mx-auto mt-4 size-56 rounded-lg bg-white p-3" /> : null}
      <p className="mt-3 text-center text-xs text-muted">{message}</p>
      <Button className="mt-4 w-full" variant={qr ? "ghost" : "live"} onClick={() => void start()} disabled={busy}>
        {busy ? "Gerando QR…" : qr ? "Gerar novo QR Code" : "Conectar meu WhatsApp"}
      </Button>
    </Card>
  );
}
