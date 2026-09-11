import { useState } from "react";
import { completeWorkspaceOnboarding } from "@/lib/multitenancy/api";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { cn } from "@/lib/utils";

type WorkspaceOnboardingDialogProps = {
  open: boolean;
  workspaceId: string;
  initialName: string;
  onCompleted: () => Promise<void>;
};

const GOALS = [
  { id: "support", title: "Atendimento ao cliente", description: "Responder dúvidas, políticas e solicitações." },
  { id: "sales", title: "Vendas e qualificação", description: "Qualificar oportunidades e encaminhar leads." },
  { id: "operations", title: "Operação interna", description: "Automatizar rotinas e apoiar a equipe." },
  { id: "other", title: "Ainda estou explorando", description: "Conhecer a plataforma antes de definir o caso." },
] as const;

const TEAM_SIZES = [
  { id: "solo", title: "Só eu" },
  { id: "small", title: "2 a 10 pessoas" },
  { id: "large", title: "Mais de 10 pessoas" },
] as const;

export function WorkspaceOnboardingDialog({ open, workspaceId, initialName, onCompleted }: WorkspaceOnboardingDialogProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName === "Desenvolvimento" ? "" : initialName);
  const [goal, setGoal] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [busy, setBusy] = useState(false);

  async function finish() {
    if (!name.trim() || !goal || !teamSize) return;
    setBusy(true);
    try {
      await completeWorkspaceOnboarding({ data: { workspaceId, name, goal, teamSize } });
      await onCompleted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent title="Vamos preparar seu workspace" className="max-h-[min(90dvh,720px)] overflow-y-auto">
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Workspace é o projeto ou operação onde seus agentes, conexões, testes e publicações ficam organizados.
        </p>
        <div className="mt-5 flex items-center gap-1.5" aria-label={`Etapa ${step + 1} de 3`}>
          {[0, 1, 2].map((item) => <div key={item} className={cn("h-1.5 flex-1 rounded-full", item <= step ? "bg-accent" : "bg-elevated")} />)}
        </div>
        {step === 0 && (
          <div className="mt-6 space-y-3">
            <div><h2 className="font-display text-base font-semibold">Como você quer chamar este projeto?</h2><p className="mt-1 text-xs text-muted">Use um nome que sua equipe reconheça.</p></div>
            <Label htmlFor="workspace-onboarding-name">Nome do workspace</Label>
            <Input id="workspace-onboarding-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Loja Aurora" autoFocus />
            <div className="flex justify-end"><Button onClick={() => setStep(1)} disabled={!name.trim()}>Continuar</Button></div>
          </div>
        )}
        {step === 1 && (
          <div className="mt-6 space-y-3">
            <div><h2 className="font-display text-base font-semibold">O que você pretende construir?</h2><p className="mt-1 text-xs text-muted">Isso orienta os próximos passos, não limita seu workspace.</p></div>
            <div className="grid gap-2">
              {GOALS.map((item) => <button key={item.id} type="button" onClick={() => setGoal(item.id)} className={cn("rounded-lg border px-3 py-3 text-left", goal === item.id ? "border-accent bg-elevated" : "border-border bg-bg hover:bg-elevated/60")}><div className="text-sm font-medium">{item.title}</div><div className="mt-0.5 text-xs text-muted">{item.description}</div></button>)}
            </div>
            <div className="flex justify-between"><Button variant="ghost" onClick={() => setStep(0)}>Voltar</Button><Button onClick={() => setStep(2)} disabled={!goal}>Continuar</Button></div>
          </div>
        )}
        {step === 2 && (
          <div className="mt-6 space-y-3">
            <div><h2 className="font-display text-base font-semibold">Quem vai trabalhar neste workspace?</h2><p className="mt-1 text-xs text-muted">Usaremos isso para sugerir organização e permissões no futuro.</p></div>
            <div className="grid gap-2">
              {TEAM_SIZES.map((item) => <button key={item.id} type="button" onClick={() => setTeamSize(item.id)} className={cn("rounded-lg border px-3 py-3 text-left text-sm", teamSize === item.id ? "border-accent bg-elevated" : "border-border bg-bg hover:bg-elevated/60")}>{item.title}</button>)}
            </div>
            <div className="flex justify-between"><Button variant="ghost" onClick={() => setStep(1)}>Voltar</Button><Button onClick={() => void finish()} disabled={!teamSize || busy}>{busy ? "Salvando…" : "Começar a construir"}</Button></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
