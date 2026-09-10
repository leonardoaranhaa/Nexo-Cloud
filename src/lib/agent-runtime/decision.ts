import { randomUUID } from "node:crypto";
import type { Agent } from "../types.ts";
import { matchFaq, wantsHandoff } from "../pipeline.ts";

export type CommercialState = "new" | "engaged" | "qualifying" | "qualified" | "nurture" | "handoff_pending" | "human_active" | "converted" | "lost";
export type Intent = "pricing_question" | "availability_question" | "support_question" | "human_request" | "general_inquiry";
export type DecisionRisk = "low" | "medium" | "high";
export type AnswerMode = "faq" | "answer_with_evidence" | "ask" | "handoff" | "fallback" | "no_reply";
export type NextAction = "respond" | "ask" | "handoff" | "update_lead" | "no_reply";

export type DecisionEvidence = {
  sourceId: string;
  sourceType: "faq" | "agent_notes" | "rag_chunk";
  excerpt: string;
  score: number;
};

export type AgentDecision = {
  intent: Intent;
  confidence: number;
  risk: DecisionRisk;
  answerMode: AnswerMode;
  nextAction: NextAction;
  commercialState: CommercialState;
  evidence: DecisionEvidence[];
  requestedFields: string[];
};

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function includesAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

export function classifyIntent(input: string): { intent: Intent; confidence: number } {
  const value = normalize(input);
  if (includesAny(value, ["humano", "atendente", "pessoa", "gerente", "falar com alguem"])) return { intent: "human_request", confidence: 0.98 };
  if (includesAny(value, ["preco", "preço", "valor", "quanto custa", "orcamento", "orçamento"])) return { intent: "pricing_question", confidence: 0.9 };
  if (includesAny(value, ["disponivel", "disponível", "prazo", "quando", "agenda", "horario", "horário"])) return { intent: "availability_question", confidence: 0.82 };
  if (includesAny(value, ["erro", "problema", "ajuda", "nao funciona", "não funciona", "suporte"])) return { intent: "support_question", confidence: 0.78 };
  return { intent: "general_inquiry", confidence: 0.55 };
}

function nextState(intent: Intent, current: CommercialState): CommercialState {
  if (intent === "human_request") return "handoff_pending";
  if (current === "new") return intent === "pricing_question" || intent === "availability_question" ? "qualifying" : "engaged";
  return current === "human_active" ? "human_active" : current;
}

export function decideAgentTurn(agent: Agent, input: { text: string; currentState: CommercialState; ragEvidence?: DecisionEvidence[] }): AgentDecision {
  const text = input.text.trim();
  if (!text) return { intent: "general_inquiry", confidence: 1, risk: "low", answerMode: "no_reply", nextAction: "no_reply", commercialState: input.currentState, evidence: [], requestedFields: [] };
  const classified = classifyIntent(text);
  if (wantsHandoff(agent, text)) {
    return { intent: "human_request", confidence: Math.max(classified.confidence, 0.98), risk: "medium", answerMode: "handoff", nextAction: "handoff", commercialState: "handoff_pending", evidence: [], requestedFields: [] };
  }
  const faq = matchFaq(agent, text);
  if (faq) {
    return { intent: classified.intent, confidence: Math.max(classified.confidence, 0.86), risk: "low", answerMode: "faq", nextAction: "respond", commercialState: nextState(classified.intent, input.currentState), evidence: [{ sourceId: `faq:${faq.id}`, sourceType: "faq", excerpt: faq.a.slice(0, 500), score: 0.86 }], requestedFields: [] };
  }
  if (input.ragEvidence?.length) {
    return { intent: classified.intent, confidence: Math.max(classified.confidence, input.ragEvidence[0].score), risk: "low", answerMode: "answer_with_evidence", nextAction: "respond", commercialState: nextState(classified.intent, input.currentState), evidence: input.ragEvidence.slice(0, 5), requestedFields: [] };
  }
  const hasNotes = agent.knowledge.notes.trim().length > 0;
  const isCommercial = classified.intent === "pricing_question" || classified.intent === "availability_question";
  return {
    intent: classified.intent,
    confidence: classified.confidence,
    risk: isCommercial && !hasNotes ? "medium" : "low",
    answerMode: hasNotes ? "answer_with_evidence" : "ask",
    nextAction: hasNotes ? "respond" : "ask",
    commercialState: nextState(classified.intent, input.currentState),
    evidence: hasNotes ? [{ sourceId: "agent-notes", sourceType: "agent_notes", excerpt: agent.knowledge.notes.slice(0, 800), score: 0.62 }] : [],
    requestedFields: isCommercial && !hasNotes ? ["need"] : [],
  };
}

export function decisionPrompt(decision: AgentDecision): string {
  if (decision.answerMode === "ask") return "Não há evidência suficiente. Faça uma pergunta curta para esclarecer a necessidade e não invente preço, prazo, disponibilidade, política ou condição comercial.";
  if (decision.answerMode === "answer_with_evidence") return "Use somente as evidências fornecidas. Se elas não responderem à pergunta, declare a limitação e peça esclarecimento.";
  return "Responda de forma curta e objetiva.";
}


import type { Sql } from "../db";

export async function persistAgentDecision(sql: Sql, input: { workspaceId: string; jobId: string; conversationId: string; agentId: string; traceId: string }, decision: AgentDecision): Promise<void> {
  await sql.query(
    `insert into agent_runtime_decisions
      (id, workspace_id, job_id, conversation_id, agent_id, trace_id, intent, confidence, risk, answer_mode, next_action, commercial_state, evidence, requested_fields)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb)
     on conflict (job_id) do update set
       intent = excluded.intent, confidence = excluded.confidence, risk = excluded.risk,
       answer_mode = excluded.answer_mode, next_action = excluded.next_action,
       commercial_state = excluded.commercial_state, evidence = excluded.evidence,
       requested_fields = excluded.requested_fields`,
    [randomId(), input.workspaceId, input.jobId, input.conversationId, input.agentId, input.traceId, decision.intent, decision.confidence, decision.risk, decision.answerMode, decision.nextAction, decision.commercialState, JSON.stringify(decision.evidence), JSON.stringify(decision.requestedFields)],
  );
  await sql.query(
    `update conversations set commercial_state = $1, last_intent = $2, updated_at = current_timestamp where id = $3 and workspace_id = $4`,
    [decision.commercialState, decision.intent, input.conversationId, input.workspaceId],
  );
}

function randomId(): string {
  return randomUUID();
}
