import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Bot, Loader2, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({ component: LoginPage });

type Mode = "signIn" | "signUp";

function LoginPage() {
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<Mode>("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isPending && user) {
    return <main className="grid min-h-screen place-items-center bg-canvas px-4 text-ink"><Card className="w-full max-w-md p-8"><p className="text-sm text-muted">Você já está autenticado no Nexo Cloud.</p><Link to="/" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-accent">Abrir console <ArrowRight className="size-4" /></Link></Card></main>;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = mode === "signUp"
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password, callbackURL: "/" })
        : await authClient.signIn.email({ email: email.trim(), password, callbackURL: "/" });
      if (result.error) throw new Error(result.error.message ?? "Não foi possível autenticar");
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível autenticar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-canvas px-4 py-8 text-ink md:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
          <section className="hidden lg:block">
            <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
              <span className="grid size-9 place-items-center rounded-xl bg-ink text-canvas"><Bot className="size-4" /></span>
              Nexo Cloud
            </Link>
            <p className="mt-12 max-w-xl font-display text-5xl font-semibold leading-[1.02] tracking-tight">
              Construa agentes que podem ser operados com confiança.
            </p>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted">
              Entre no console para criar, testar, publicar e acompanhar agentes em um workspace seguro.
            </p>
            <div className="mt-8 flex items-center gap-2 text-sm text-muted"><ShieldCheck className="size-4 text-live" /> Dados e credenciais permanecem no servidor.</div>
          </section>

          <Card className="p-6 shadow-xl shadow-ink/5 md:p-8">
            <div className="lg:hidden"><Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-ink"><span className="grid size-8 place-items-center rounded-lg bg-ink text-canvas"><Bot className="size-4" /></span>Nexo Cloud</Link></div>
            <div className="mt-8 lg:mt-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">Console seguro</p>
              <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">{mode === "signUp" ? "Crie sua conta" : "Acesse seu console"}</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">{mode === "signUp" ? "Comece com um workspace pessoal e evolua seus primeiros agentes." : "Use seu e-mail e senha para continuar no Nexo Cloud."}</p>
            </div>

            <form onSubmit={submit} className="mt-7 space-y-4">
              {mode === "signUp" && <div className="space-y-2"><Label htmlFor="name">Nome</Label><Input id="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required /></div>}
              <div className="space-y-2"><Label htmlFor="email">E-mail</Label><Input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
              <div className="space-y-2"><Label htmlFor="password">Senha</Label><Input id="password" type="password" autoComplete={mode === "signUp" ? "new-password" : "current-password"} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
              {error && <p role="alert" className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}{busy ? "Aguarde…" : mode === "signUp" ? "Criar conta" : "Entrar"}</Button>
            </form>

            <div className="mt-6 border-t border-line pt-5 text-center text-sm text-muted">
              {mode === "signUp" ? "Já possui uma conta?" : "Ainda não possui uma conta?"}{" "}
              <button type="button" className="font-medium text-accent hover:underline" onClick={() => { setMode(mode === "signUp" ? "signIn" : "signUp"); setError(null); }}>{mode === "signUp" ? "Entrar" : "Criar conta"}</button>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
