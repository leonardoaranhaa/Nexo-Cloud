import { randomUUID } from "node:crypto";
import type { Sql } from "@/lib/db";
import { requireWorkspaceAccess, type JsonObject } from "@/lib/multitenancy/server";

export type WorkspaceIntegration = {
  id: string;
  workspaceId: string;
  integrationKey: string;
  name: string;
  status: "pending" | "connected" | "disconnected" | "error";
  config: JsonObject;
  lastTestedAt: string | null;
};

export async function listWorkspaceIntegrations(sql: Sql, userId: string, workspaceId: string): Promise<WorkspaceIntegration[]> {
  await requireWorkspaceAccess(sql, userId, workspaceId, "read");
  return sql<WorkspaceIntegration>`
    select id, workspace_id as "workspaceId", integration_key as "integrationKey", name, status, config,
           last_tested_at as "lastTestedAt"
      from workspace_integrations
     where workspace_id = ${workspaceId}
     order by name asc
  `;
}

export async function configureWorkspaceCrm(
  sql: Sql,
  userId: string,
  input: { workspaceId: string; pipelineName: string; defaultStage: string; captureFields: string[] },
): Promise<WorkspaceIntegration> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "manage");
  const pipelineName = input.pipelineName.trim().slice(0, 120);
  const defaultStage = input.defaultStage.trim().slice(0, 80);
  if (!pipelineName || !defaultStage) throw new Error("CRM_CONFIGURATION_REQUIRED");
  const captureFields = input.captureFields.filter((field) => typeof field === "string" && field.trim()).slice(0, 12);
  const config = { pipelineName, defaultStage, captureFields } satisfies JsonObject;
  const existing = await sql<{ id: string }>`select id from workspace_integrations where workspace_id = ${input.workspaceId} and integration_key = 'crm.qualificacao' limit 1`;
  const id = existing[0]?.id ?? randomUUID();
  if (existing[0]) {
    await sql.query(`update workspace_integrations set name = $1, status = 'connected', config = $2::jsonb, last_tested_at = current_timestamp, updated_at = current_timestamp where id = $3 and workspace_id = $4`, ["CRM + Qualificação", JSON.stringify(config), id, input.workspaceId]);
  } else {
    await sql.query(`insert into workspace_integrations (id, workspace_id, integration_key, name, status, config, last_tested_at) values ($1,$2,'crm.qualificacao',$3,'connected',$4::jsonb,current_timestamp)`, [id, input.workspaceId, "CRM + Qualificação", JSON.stringify(config)]);
  }
  return (await listWorkspaceIntegrations(sql, userId, input.workspaceId)).find((integration) => integration.id === id)!;
}

export async function disconnectWorkspaceCrm(sql: Sql, userId: string, workspaceId: string): Promise<void> {
  await requireWorkspaceAccess(sql, userId, workspaceId, "manage");
  await sql.query(`update workspace_integrations set status = 'disconnected', updated_at = current_timestamp where workspace_id = $1 and integration_key = 'crm.qualificacao'`, [workspaceId]);
}
