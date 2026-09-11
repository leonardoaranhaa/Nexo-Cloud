import type { AgentTemplateId } from "./templates";

export type WorkspaceGoal = "support" | "sales" | "operations" | "other" | null;

export type WorkspaceGoalGuidance = {
  title: string;
  description: string;
  recommendedTemplate: AgentTemplateId;
  nextSteps: string[];
  briefs: string[];
};

const GUIDANCE: Record<Exclude<WorkspaceGoal, null>, WorkspaceGoalGuidance> = {
  support: {
    title: "Atendimento ao cliente",
    description: "Comece com um agente que responde dúvidas, consulta a base e encaminha casos sensíveis.",
    recommendedTemplate: "support",
    nextSteps: ["Adicionar FAQs e políticas", "Configurar handoff para humano", "Criar um cenário de atendimento"],
    briefs: [
      "Atendimento de clientes de uma loja. Responda dúvidas sobre produtos, trocas e prazo de entrega e encaminhe reclamações para um humano.",
      "Suporte para uma clínica. Explique serviços e horários, responda dúvidas frequentes e passe casos delicados para a recepção.",
    ],
  },
  sales: {
    title: "Vendas e qualificação",
    description: "Comece com um agente que entende a necessidade, coleta contexto e encaminha oportunidades.",
    recommendedTemplate: "sales",
    nextSteps: ["Configurar catálogo ou CRM", "Definir critérios de qualificação", "Criar um cenário de lead"],
    briefs: [
      "Agente comercial para uma empresa de software. Entenda o perfil do cliente, orçamento e prazo e encaminhe oportunidades qualificadas para vendas.",
      "Atendimento de vendas de uma imobiliária. Pergunte região, tipo de imóvel e faixa de valor e passe o lead para um corretor.",
    ],
  },
  operations: {
    title: "Operação interna",
    description: "Comece com um agente flexível para apoiar rotinas, políticas e fluxos internos da equipe.",
    recommendedTemplate: "blank",
    nextSteps: ["Documentar o processo na base", "Definir limites e aprovações", "Testar uma rotina frequente"],
    briefs: [
      "Assistente interno para uma equipe de operações. Consulte procedimentos, organize solicitações e peça aprovação humana quando houver risco.",
      "Agente para apoiar o time financeiro com políticas internas, checklist de tarefas e encaminhamento de exceções para um responsável.",
    ],
  },
  other: {
    title: "Exploração inicial",
    description: "Comece por um template de atendimento e ajuste o blueprint conforme você descobrir o melhor caso de uso.",
    recommendedTemplate: "support",
    nextSteps: ["Criar um primeiro agente", "Adicionar uma pequena base", "Executar um cenário simples"],
    briefs: [
      "Quero explorar um agente para responder perguntas sobre meu negócio e encaminhar para uma pessoa quando não souber responder.",
    ],
  },
};

export function guidanceForWorkspaceGoal(goal: WorkspaceGoal): WorkspaceGoalGuidance | null {
  return goal ? GUIDANCE[goal] : null;
}
