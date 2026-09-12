import { randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";
import { requireWorkspaceAccess } from "../multitenancy/server.ts";
import { compileWorkflowDefinition } from "../workflows/compiler.ts";
import { createWorkflow, saveWorkflowDefinition, type WorkflowDefinition, type WorkflowRecord } from "../workflows/server.ts";

const workflowToolKeys = new Set(["evolution.send_text"]);

type BlueprintRow = {
  id: string;
  agent_id: string;
  agent_name: string;
  source_brief: string;
  objectives: unknown;
  capabilities: unknown;
};

type ApprovedToolRow = {
  capability: string;
  tool_key: string;
  require_approval: boolean;
};

type BlueprintWorkflowLink = {
  id: string;
  workflow_id: string;
  agent_id: string;
};

export type GeneratedBlueprintWorkflow = {
  workflow: WorkflowRecord;
  workflowVersionId: string;
  definition: WorkflowDefinition;
  pendingCapabilities: string[];
  materializedToolKeys: string[];
  agentVersionId: string;
  publishedVersionPreserved: boolean;
};

function list(value: unknown, maxItems: number, maxLength: number): string[] {
  return [...new Set((Array.isArray(value) ? value : [])
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean))].slice(0, maxItems);
}

function bounded(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function workflowPrompt(blueprint: BlueprintRow, objectives: string[]): string {
  const source = bounded(blueprint.source_brief, 1800);
  if (source) return source;
  return bounded(`Execute estes objetivos com segurança: ${objectives.join("; ") || "atender o objetivo informado pelo usuário"}.`, 1800);
}

async function loadBlueprint(sql: Sql, input: { workspaceId: string; agentId: string; blueprintId: string }): Promise<BlueprintRow> {
  const rows = await sql.query<BlueprintRow>(
    `select b.id, b.agent_id, a.name as agent_name, b.source_brief, b.objectives, b.capabilities
       from agent_development_blueprints b
       join agents a on a.id = b.agent_id and a.workspace_id = b.workspace_id and a.deleted_at is null
      where b.id = $1 and b.workspace_id = $2 and b.agent_id = $3
      limit 1`,
    [input.blueprintId, input.workspaceId, input.agentId],
  );
  if (!rows[0]) throw new Error("BLUEPRINT_NOT_FOUND");
  return rows[0];
}

async function loadDraftAgentVersion(sql: Sql, workspaceId: string, agentId: string): Promise<string> {
  const rows = await sql.query<{ id: string }>(
    `select v.id
       from agent_versions v
       join agents a on a.id = v.agent_id and a.workspace_id = $2 and a.deleted_at is null
      where v.agent_id = $1 and v.status = 'draft'
      order by v.version_number desc
      limit 1`,
    [agentId, workspaceId],
  );
  if (!rows[0]) throw new Error("AGENT_DRAFT_VERSION_NOT_FOUND");
  return rows[0].id;
}

async function loadApprovedWorkflowTools(sql: Sql, workspaceId: string, blueprintId: string, agentVersionId: string): Promise<ApprovedToolRow[]> {
  return sql.query<ApprovedToolRow>(
    `select p.capability, t.key as tool_key, (p.requires_approval or ap.require_approval) as require_approval
       from agent_tool_proposals p
       join tools t on t.id = p.tool_id
        and t.workspace_id = p.workspace_id
        and t.status = 'active'
       join agent_tool_permissions ap on ap.tool_id = t.id
        and ap.agent_version_id = $3
        and ap.workspace_id = $1
        and ap.enabled = true
      where p.workspace_id = $1
        and p.blueprint_id = $2
        and p.status = 'approved'
      order by p.created_at, t.key`,
    [workspaceId, blueprintId, agentVersionId],
  );
}

async function loadPrimaryConnection(sql: Sql, workspaceId: string, agentId: string): Promise<string | null> {
  const rows = await sql.query<{ id: string }>(
    `select c.id
       from agent_connections ac
       join connections c on c.id = ac.connection_id and c.workspace_id = $1
      where ac.agent_id = $2 and ac.is_primary = true
        and c.deleted_at is null and c.status in ('connected', 'pending')
      limit 1`,
    [workspaceId, agentId],
  );
  return rows[0]?.id ?? null;
}

async function loadLink(sql: Sql, workspaceId: string, blueprintId: string): Promise<BlueprintWorkflowLink | null> {
  const rows = await sql.query<BlueprintWorkflowLink>(
    `select id, workflow_id, agent_id
       from agent_blueprint_workflows
      where workspace_id = $1 and blueprint_id = $2
      limit 1`,
    [workspaceId, blueprintId],
  );
  return rows[0] ?? null;
}

async function loadWorkflow(sql: Sql, workspaceId: string, workflowId: string): Promise<WorkflowRecord> {
  const rows = await sql.query<WorkflowRecord>(
    `select w.id, w.workspace_id as "workspaceId", w.name, w.slug, w.description, w.status,
            w.trigger_type as "triggerType", w.error_workflow_id as "errorWorkflowId",
            v.id as "versionId", v.version_number as "versionNumber",
            w.created_at as "createdAt", w.updated_at as "updatedAt"
       from workflows w
       left join lateral (
         select id, version_number from workflow_versions
          where workflow_id = w.id and status = 'published'
          order by version_number desc limit 1
       ) v on true
      where w.id = $1 and w.workspace_id = $2 and w.deleted_at is null
      limit 1`,
    [workflowId, workspaceId],
  );
  if (!rows[0]) throw new Error("WORKFLOW_NOT_FOUND");
  return rows[0];
}

async function loadDraftWorkflowVersion(sql: Sql, workspaceId: string, workflowId: string): Promise<{ id: string; definition: unknown }> {
  const rows = await sql.query<{ id: string; definition: unknown }>(
    `select v.id, v.definition
       from workflow_versions v
       join workflows w on w.id = v.workflow_id and w.workspace_id = $2 and w.deleted_at is null
      where v.workflow_id = $1 and v.status = 'draft'
      order by v.version_number desc
      limit 1`,
    [workflowId, workspaceId],
  );
  if (!rows[0]) throw new Error("WORKFLOW_DRAFT_VERSION_NOT_FOUND");
  return rows[0];
}

function buildDefinition(
  blueprint: BlueprintRow,
  objectives: string[],
  capabilities: string[],
  approvedTools: ApprovedToolRow[],
  connectionId: string | null,
): { definition: WorkflowDefinition; pendingCapabilities: string[]; materializedToolKeys: string[] } {
  const materialized = approvedTools.filter((tool) => workflowToolKeys.has(tool.tool_key) && (tool.tool_key !== "evolution.send_text" || connectionId));
  const materializedCapabilities = new Set(materialized.map((tool) => tool.capability));
  const pendingCapabilities = capabilities.filter((capability) => !materializedCapabilities.has(capability));
  const nodes: WorkflowDefinition["nodes"] = [{
    id: "blueprint-agent",
    type: "agent",
    name: `Agente · ${bounded(blueprint.agent_name, 80)}`,
    config: {
      agentId: blueprint.agent_id,
      prompt: workflowPrompt(blueprint, objectives),
      sourceCapabilities: capabilities,
      pendingCapabilities,
    },
  }];
  const edges: WorkflowDefinition["edges"] = [];
  let previous = "blueprint-agent";
  for (const [index, tool] of materialized.entries()) {
    if (tool.require_approval) {
      const approvalId = `approval-${index + 1}`;
      nodes.push({ id: approvalId, type: "approval", name: "Aprovação da ferramenta", config: { title: `Aprovar ${tool.tool_key}`, expiresInMinutes: 30 } });
      edges.push({ from: previous, to: approvalId });
      previous = approvalId;
    }
    const toolId = `tool-${index + 1}`;
    nodes.push({
      id: toolId,
      type: "tool",
      name: tool.tool_key,
      config: {
        agentId: blueprint.agent_id,
        toolKey: tool.tool_key,
        ...(connectionId ? { connectionId } : {}),
        ...(tool.require_approval ? { approvalNodeId: `approval-${index + 1}` } : {}),
        ...(tool.require_approval ? { approved: true } : {}),
      },
    });
    edges.push({ from: previous, to: toolId });
    previous = toolId;
  }
  return { definition: { nodes, edges }, pendingCapabilities, materializedToolKeys: materialized.map((tool) => tool.tool_key) };
}

export async function generateWorkflowFromBlueprint(
  sql: Sql,
  userId: string,
  input: { workspaceId: string; agentId: string; blueprintId: string },
): Promise<GeneratedBlueprintWorkflow> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const blueprint = await loadBlueprint(sql, input);
  const agentVersionId = await loadDraftAgentVersion(sql, input.workspaceId, input.agentId);
  const objectives = list(blueprint.objectives, 8, 240);
  const capabilities = list(blueprint.capabilities, 20, 240);
  const approvedTools = await loadApprovedWorkflowTools(sql, input.workspaceId, input.blueprintId, agentVersionId);
  const connectionId = await loadPrimaryConnection(sql, input.workspaceId, input.agentId);
  const generated = buildDefinition(blueprint, objectives, capabilities, approvedTools, connectionId);
  const compiled = compileWorkflowDefinition(generated.definition);
  const existing = await loadLink(sql, input.workspaceId, input.blueprintId);
  let workflowId = existing?.workflow_id;
  if (existing && existing.agent_id !== input.agentId) throw new Error("BLUEPRINT_WORKFLOW_AGENT_MISMATCH");
  if (!workflowId) {
    const created = await createWorkflow(sql, userId, {
      workspaceId: input.workspaceId,
      name: `Blueprint · ${bounded(blueprint.agent_name, 80)}`,
      description: "Workflow gerado assistidamente a partir de um blueprint; requer revisão antes da publicação.",
      triggerType: "manual",
    });
    workflowId = created.id;
    await sql.query(
      `insert into agent_blueprint_workflows (id, workspace_id, blueprint_id, agent_id, workflow_id, generated_by)
       values ($1,$2,$3,$4,$5,$6)`,
      [randomUUID(), input.workspaceId, input.blueprintId, input.agentId, workflowId, userId],
    );
  } else {
    const workflow = await loadWorkflow(sql, input.workspaceId, workflowId);
    if (workflow.status === "archived") throw new Error("BLUEPRINT_WORKFLOW_ARCHIVED");
  }
  await saveWorkflowDefinition(sql, userId, { workspaceId: input.workspaceId, workflowId, definition: compiled });
  await sql.query(`update agent_blueprint_workflows set generated_by = $1, updated_at = current_timestamp where workspace_id = $2 and blueprint_id = $3`, [userId, input.workspaceId, input.blueprintId]);
  const workflow = await loadWorkflow(sql, input.workspaceId, workflowId);
  const draft = await loadDraftWorkflowVersion(sql, input.workspaceId, workflowId);
  return {
    workflow,
    workflowVersionId: draft.id,
    definition: compiled,
    pendingCapabilities: generated.pendingCapabilities,
    materializedToolKeys: generated.materializedToolKeys,
    agentVersionId,
    publishedVersionPreserved: workflow.versionId !== null,
  };
}
