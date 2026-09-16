import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bot, CheckCircle2, Inbox, Plug2, Workflow } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/guide")({ component: GuidePage });

const STEPS = [
  { title: "Defina o objetivo", body: "Escolha se o agente vai atender, vender, qualificar, agendar ou executar uma rotina.", icon: Bot, href: "/agents" as const, action: "Abrir agentes" },
  { title: "Conecte o contexto", body: "Adicione conhecimento aprovado, ferramentas e o canal que será usado pela operação.", icon: Plug2, href: "/connections" as const, action: "Abrir conectores" },
  { title: "Automatize o processo", body: "Use workflows para combinar eventos, condições, aprovações, esperas e retries.", icon: Workflow, href: "/workflows" as const, action: "Abrir workflows" },
  { title: "Acompanhe e melhore", body: "Observe conversas, handoffs, execuções e métricas para evoluir o agente com segurança.", icon: Inbox, href: "/inbox" as const, action: "Abrir Inbox" },
];

function GuidePage() {
  return <AppShell title="Como operar" allowAnonymous><div className="max-w-4xl"><div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">Orientação da plataforma</p><h1 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-5xl">Do primeiro agente à operação confiável.</h1><p className="mt-4 text-sm leading-relaxed text-muted md:text-base">O Nexo Cloud organiza construção, execução, operação e governança em um mesmo ambiente. Siga o fluxo abaixo para transformar uma intenção de negócio em uma operação acompanhável.</p></div><div className="mt-8 grid gap-3 md:grid-cols-2">{STEPS.map((step, index) => { const Icon = step.icon; return <Card key={step.title} className="group p-5 transition-colors hover:bg-elevated"><div className="flex items-start gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-accent/10 text-accent"><Icon className="size-4" /></span><span className="font-mono text-xs text-subtle">0{index + 1}</span></div><h2 className="mt-5 font-display text-lg font-semibold">{step.title}</h2><p className="mt-2 min-h-12 text-sm leading-relaxed text-muted">{step.body}</p><Link to={step.href} className="mt-5 inline-flex items-center gap-2 text-xs font-medium text-accent">{step.action}<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" /></Link></Card>; })}</div><Card className="mt-8 p-5"><h2 className="font-display text-lg font-semibold">Princípios de uma boa operação</h2><div className="mt-4 grid gap-3 sm:grid-cols-3">{["Responda com evidência", "Mantenha humano no circuito", "Meça antes de expandir"].map((item) => <div key={item} className="flex items-start gap-2 text-sm text-muted"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-live" />{item}</div>)}</div></Card></div></AppShell>;
}
