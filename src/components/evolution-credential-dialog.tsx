import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTrigger } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { provisionEvolutionConnectionCredential } from "@/lib/multitenancy/api";
import { useNexo } from "@/lib/store";
import { useWorkspaceData } from "@/lib/multitenancy/use-workspace-data";
import type { Connection } from "@/lib/types";

export function EvolutionCredentialDialog({ connection }: { connection: Connection }) {
  const workspaceId = useNexo((s) => s.workspaceId);
  const backendReady = useNexo((s) => s.backendReady);
  const { refresh } = useWorkspaceData();
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(connection.baseUrl ?? "");
  const [instance, setInstance] = useState(connection.instance ?? "");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!workspaceId || !apiKey.trim() || !baseUrl.trim() || !instance.trim()) {
      toast("Preencha API key, URL base e instância.");
      return;
    }
    setBusy(true);
    try {
      const result = await provisionEvolutionConnectionCredential({
        data: {
          workspaceId,
          connectionId: connection.id,
          apiKey,
          baseUrl,
          instance,
        },
      });
      if (!result.ok) throw new Error(result.code);
      await refresh(workspaceId);
      setApiKey("");
      setOpen(false);
      toast("Credencial Evolution provisionada no cofre.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("WORKSPACE_PERMISSION_DENIED") || message.includes("Workspace permission denied")) {
        toast("Sua conta precisa ser administradora deste workspace para gravar credenciais.");
      } else if (message.includes("SECRET_PROVIDER_UNAVAILABLE")) {
        toast("O cofre server-side ainda não está configurado neste ambiente.");
      } else if (message.includes("base_url_insecure") || message.includes("must use HTTPS")) {
        toast("A URL Evolution precisa usar HTTPS. Ex.: https://seu-host.up.railway.app");
      } else if (message.includes("base_url_invalid") || message.includes("absolute URL")) {
        toast("Informe o host da Evolution. O protocolo HTTPS será acrescentado automaticamente se faltar.");
      } else if (message.includes("instance_invalid")) {
        toast("O nome da instância só pode conter letras, números, ponto, hífen ou sublinhado.");
      } else if (message.includes("api_key_invalid")) {
        toast("A API key Evolution parece inválida. Confira se foi copiada sem espaços.");
      } else {
        toast("Não foi possível provisionar. Confira a URL, a instância e o acesso administrativo do workspace.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="w-full" disabled={!backendReady}>
          Configurar credencial Evolution
        </Button>
      </DialogTrigger>
      <DialogContent title="Credencial Evolution API">
        <p className="mt-1 mb-4 text-sm text-muted">
          A API key é enviada uma vez ao backend e armazenada no cofre server-side cifrado. Ela não fica no navegador nem é retornada pela API.
        </p>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="evo-key">API key</Label>
            <Input id="evo-key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="new-password" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="evo-url">URL base</Label>
            <Input id="evo-url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://evolution.exemplo.com" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="evo-instance">Nome da instância</Label>
            <Input id="evo-instance" value={instance} onChange={(event) => setInstance(event.target.value)} placeholder="minha-instancia" />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => void submit()} disabled={busy}>{busy ? "Provisionando…" : "Salvar no cofre"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
