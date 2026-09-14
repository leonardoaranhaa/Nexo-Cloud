import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTrigger } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { provisionMetaConnectionCredential } from "@/lib/multitenancy/api";
import { useNexo } from "@/lib/store";
import { useWorkspaceData } from "@/lib/multitenancy/use-workspace-data";
import { PROVIDER_LABEL, type Connection } from "@/lib/types";

export function MetaCredentialDialog({ connection }: { connection: Connection }) {
  const workspaceId = useNexo((s) => s.workspaceId);
  const backendReady = useNexo((s) => s.backendReady);
  const { refresh } = useWorkspaceData();
  const [open, setOpen] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [accountId, setAccountId] = useState(connection.accountId ?? connection.phoneNumberId ?? "");
  const [graphVersion, setGraphVersion] = useState("v26.0");
  const [baseUrl, setBaseUrl] = useState(connection.provider === "instagram" ? "https://graph.instagram.com" : "https://graph.facebook.com");
  const [busy, setBusy] = useState(false);
  const social = connection.provider !== "meta";
  const subject = social ? (connection.provider === "instagram" ? "Instagram Professional" : "Página Messenger") : "WhatsApp Cloud API";

  async function submit() {
    if (!workspaceId || !accessToken.trim() || !appSecret.trim() || !verifyToken.trim() || !accountId.trim() || !graphVersion.trim()) {
      toast("Preencha todos os campos do canal Meta.");
      return;
    }
    setBusy(true);
    try {
      await provisionMetaConnectionCredential({ data: { workspaceId, connectionId: connection.id, accessToken, appSecret, verifyToken, ...(social ? { accountId } : { phoneNumberId: accountId }), graphVersion, baseUrl } });
      await refresh(workspaceId);
      setAccessToken(""); setAppSecret(""); setVerifyToken(""); setOpen(false);
      toast(`Credenciais ${PROVIDER_LABEL[connection.provider]} provisionadas no cofre.`);
    } catch {
      toast("Não foi possível provisionar as credenciais. Verifique o backend de secrets e as permissões Meta.");
    } finally { setBusy(false); }
  }

  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="ghost" className="w-full" disabled={!backendReady}>Configurar {PROVIDER_LABEL[connection.provider]}</Button></DialogTrigger><DialogContent title={`Onboarding ${subject}`}><p className="mt-1 mb-4 text-sm text-muted">O token, App Secret e Verify Token são enviados somente ao backend e armazenados no cofre. O canal precisa estar publicado e inscrito nos webhooks Meta para receber mensagens.</p><div className="flex flex-col gap-3"><div className="flex flex-col gap-1.5"><Label htmlFor="meta-token">Access Token</Label><Input id="meta-token" type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} autoComplete="new-password" /></div><div className="flex flex-col gap-1.5"><Label htmlFor="meta-app-secret">App Secret</Label><Input id="meta-app-secret" type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} autoComplete="new-password" /></div><div className="flex flex-col gap-1.5"><Label htmlFor="meta-verify">Verify Token</Label><Input id="meta-verify" type="password" value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} autoComplete="new-password" /></div><div className="flex flex-col gap-1.5"><Label htmlFor="meta-account">{social ? (connection.provider === "instagram" ? "Instagram Professional account ID" : "Facebook Page ID") : "Phone Number ID"}</Label><Input id="meta-account" value={accountId} onChange={(e) => setAccountId(e.target.value)} /></div><div className="flex flex-col gap-1.5"><Label htmlFor="meta-version">Graph API version</Label><Input id="meta-version" value={graphVersion} onChange={(e) => setGraphVersion(e.target.value)} placeholder="v26.0" /></div><div className="flex flex-col gap-1.5"><Label htmlFor="meta-base">Graph API base URL</Label><Input id="meta-base" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} /></div></div><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={() => void submit()} disabled={busy}>{busy ? "Provisionando…" : "Salvar no cofre"}</Button></div></DialogContent></Dialog>;
}
