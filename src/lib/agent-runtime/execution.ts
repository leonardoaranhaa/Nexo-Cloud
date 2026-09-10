import { randomUUID } from "node:crypto";
import type { Sql } from "../db";
import type { AgentRuntimeJob } from "./queue.ts";

export type ExecutionStep = {
  name: string;
  status: "ok" | "skip" | "error";
  durationMs?: number;
};

export type RuntimeExecutionResult = {
  status: "succeeded" | "failed" | "skipped";
  reason?: string;
  aiProvider?: string;
  modelName?: string;
  durationMs: number;
  historyCount?: number;
  inputChars?: number;
  outputChars?: number;
  errorCode?: string;
  errorMessage?: string;
  steps: ExecutionStep[];
};

function safe(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  return value.replace(/[\r\n\t]+/g, " ").slice(0, max) || null;
}

export async function startRuntimeExecution(sql: Sql, job: AgentRuntimeJob): Promise<{ id: string; startedAt: number }> {
  const id = randomUUID();
  const rows = await sql.query<{ id: string }>(
    `insert into agent_runtime_execution_logs
      (id, workspace_id, job_id, agent_id, conversation_id, inbound_message_id, trace_id, attempt_count, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'running')
     on conflict (job_id, attempt_count) do nothing
     returning id`,
    [id, job.workspace_id, job.id, job.agent_id, job.conversation_id, job.inbound_message_id, job.trace_id, job.attempt_count],
  );
  if (rows[0]) return { id: rows[0].id, startedAt: Date.now() };
  const existing = await sql.query<{ id: string }>(
    `select id from agent_runtime_execution_logs where job_id = $1 and attempt_count = $2 limit 1`,
    [job.id, job.attempt_count],
  );
  if (!existing[0]) throw new Error("AGENT_RUNTIME_EXECUTION_LOG_FAILED");
  return { id: existing[0].id, startedAt: Date.now() };
}

export async function finishRuntimeExecution(
  sql: Sql,
  executionId: string,
  result: RuntimeExecutionResult,
): Promise<void> {
  await sql.query(
    `update agent_runtime_execution_logs set
       status = $2,
       reason = $3,
       ai_provider = $4,
       model_name = $5,
       duration_ms = $6,
       history_count = $7,
       input_chars = $8,
       output_chars = $9,
       error_code = $10,
       error_message = $11,
       steps = $12::jsonb,
       completed_at = current_timestamp
     where id = $1`,
    [
      executionId,
      result.status,
      safe(result.reason, 80),
      safe(result.aiProvider, 80),
      safe(result.modelName, 120),
      Math.max(0, Math.round(result.durationMs)),
      Math.max(0, Math.round(result.historyCount ?? 0)),
      Math.max(0, Math.round(result.inputChars ?? 0)),
      Math.max(0, Math.round(result.outputChars ?? 0)),
      safe(result.errorCode, 120),
      safe(result.errorMessage, 500),
      JSON.stringify(result.steps.slice(0, 30)),
    ],
  );
}
