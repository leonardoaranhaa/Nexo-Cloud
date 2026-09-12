import { randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";
import { requireWorkspaceAccess, type JsonObject } from "../multitenancy/server.ts";
import { validateToolSchema, type ToolRisk } from "../connectors/tool-registry.ts";

export type ToolProposalStatus = "draft" | "approved" | "rejected" | "archived";

export type AgentToolProposal = {
  id: string;
  workspaceId: string;
  agentId: string;
  blueprintId: string;
  capability: string;
  toolId: string;
  toolKey: string;
  name: string;
  description: string;
  inputSchema: JsonObject;
  outputSchema: JsonObject;
  riskLevel: ToolRisk;
  requiresApproval: boolean;
  rationale: string;
  status: ToolProposalStatus;
  createdBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ToolCandidate = {
  capability: string;
  key: string;
};

type ToolRow = {
  id: string;
  key: string;
  name: string;
  description: string;
  input_schema: unknown;
  output_schema: unknown;
  risk_level: ToolRisk;
  status: "active" | "disabled" | "review";
};

const capabilityRules: { terms: string[]; key: string }[] = [
  { terms: ["crm", "criar lead", "criar contato", "registrar contato", "cadastro comercial"], key: "lead.create_or_update" },
  { terms: ["qualificar", "qualificação", "qualificacao", "critério comercial", "criterio comercial"], key: "lead.update_qualification" },
  { terms: ["atribuir vendedor", "atribuir responsável", "atribuir responsavel", "owner", "distribuir lead"], key: "lead.assign_owner" },
  { terms: ["follow-up", "follow up", "acompanhamento comercial", "cadência", "cadencia"], key: "lead.create_follow_up" },
  { terms: ["handoff", "transferir para humano", "atendente humano", "falar com pessoa"], key: "conversation.handoff" },
  { terms: ["disponibilidade", "consultar agenda", "horários disponíveis", "horarios disponiveis"], key: "calendar.list_availability" },
  { terms: ["reservar horário", "reservar horario", "agendamento", "marcar horário", "marcar horario"], key: "calendar.book_slot" },
];

function normalize(value: string): string {
  return value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function object(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function bounded(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function capabilities(value: unknown): string[] {
  return [...new Set((Array.isArray(value) ? value : [])
    .filter((item): item is string => typeof item === "string")
    .map((item) => bounded(item, 240))
    .filter(Boolean))].slice(0, 20);
}

function candidatesFor(capability: string): ToolCandidate[] {
  const normalized = normalize(capability);
  return capabilityRules
    .filter((rule) => rule.terms.some((term) => normalized.includes(normalize(term))))
    .map((rule) => ({ capability, key: rule.key }));
}

function schema(value: unknown): JsonObject {
  return object(value);
}

function proposalRationale(capability: string, tool: ToolRow): string {
  return `A capacidade "${bounded(capability, 180)}" foi mapeada deterministicamente para a tool nativa confirmada ${tool.key}. A proposta permanece em revisão e não autoriza execução.`;
}

async function loadBlueprint(sql: Sql, input: { workspaceId: string; agentId: string; blueprintId: string }): Promise<{ id: string; agent_id: string; capabilities: string[] }> {
  const rows = await sql.query<{ id: string; agent_id: string; capabilities: unknown }>(
    `select id, agent_id, capabilities
       from agent_development_blueprints
      where id = $1 and workspace_id = $2 and agent_id = $3
      limit 1`,
    [input.blueprintId, input.workspaceId, input.agentId],
  );
  if (!rows[0]) throw new Error("BLUEPRINT_NOT_FOUND");
  return { id: rows[0].id, agent_id: rows[0].agent_id, capabilities: capabilities(rows[0].capabilities) };
}

async function loadTools(sql: Sql, keys: string[], workspaceId: string): Promise<Map<string, ToolRow>> {
  if (!keys.length) return new Map();
  const rows = await sql.query<ToolRow>(
    `select id, key, name, description, input_schema, output_schema, risk_level, status
       from tools
      where key = any($1::text[])
        and (workspace_id is null or workspace_id = $2)
        and status in ('active', 'review')
      order by workspace_id nulls last, version desc`,
    [keys, workspaceId],
  );
  const result = new Map<string, ToolRow>();
  for (const row of rows) if (!result.has(row.key)) result.set(row.key, row);
  return result;
}

async function ensureReviewTool(
  sql: Sql,
  workspaceId: string,
  key: string,
  source: ToolRow,
): Promise<ToolRow> {
  const review = await sql.query<ToolRow>(
    `select id, key, name, description, input_schema, output_schema, risk_level, status
       from tools
      where workspace_id = $1 and key = $2 and status = 'review'
      order by version desc
      limit 1`,
    [workspaceId, key],
  );
  if (review[0]) return review[0];
  const versionRows = await sql.query<{ next_version: number }>(
    `select coalesce(max(version), 0) + 1 as next_version
       from tools
      where workspace_id = $1 and key = $2`,
    [workspaceId, key],
  );
  const id = randomUUID();
  const version = versionRows[0]?.next_version ?? 1;
  const rows = await sql.query<ToolRow>(
    `insert into tools
      (id, workspace_id, connector_definition_id, key, name, description, input_schema, output_schema, risk_level, timeout_ms, max_retries, status, version)
     values ($1, $2, null, $3, $4, $5, $6::jsonb, $7::jsonb, $8, 3000, 1, 'review', $9)
     returning id, key, name, description, input_schema, output_schema, risk_level, status`,
    [id, workspaceId, source.key, source.name, source.description, JSON.stringify(source.input_schema), JSON.stringify(source.output_schema), source.risk_level, version],
  );
  if (!rows[0]) throw new Error("TOOL_REVIEW_CREATE_FAILED");
  return rows[0];
}

export async function listAgentToolProposals(
  sql: Sql,
  userId: string,
  input: { workspaceId: string; blueprintId: string },
): Promise<AgentToolProposal[]> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  return sql.query<AgentToolProposal>(
    `select id, workspace_id as "workspaceId", agent_id as "agentId", blueprint_id as "blueprintId",
            capability, tool_id as "toolId", tool_key as "toolKey", name, description,
            input_schema as "inputSchema", output_schema as "outputSchema",
            risk_level as "riskLevel", requires_approval as "requiresApproval", rationale, status,
            created_by as "createdBy", reviewed_by as "reviewedBy", reviewed_at as "reviewedAt",
            created_at as "createdAt", updated_at as "updatedAt"
       from agent_tool_proposals
      where workspace_id = $1 and blueprint_id = $2
      order by created_at asc, tool_key asc`,
    [input.workspaceId, input.blueprintId],
  );
}

export async function generateToolProposalsFromBlueprint(
  sql: Sql,
  userId: string,
  input: { workspaceId: string; agentId: string; blueprintId: string },
): Promise<{ blueprintId: string; proposals: AgentToolProposal[]; unsupportedCapabilities: string[] }> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const blueprint = await loadBlueprint(sql, input);
  const candidates = capabilities(blueprint.capabilities).flatMap(candidatesFor);
  const deduped = [...new Map(candidates.map((candidate) => [`${candidate.capability}:${candidate.key}`, candidate])).values()];
  const keys = [...new Set(deduped.map((candidate) => candidate.key))];
  const tools = await loadTools(sql, keys, input.workspaceId);
  const missing = keys.filter((key) => !tools.has(key));
  if (missing.length) throw new Error(`TOOL_CATALOG_INCOMPLETE:${missing.join(",")}`);
  const unsupportedCapabilities = capabilities(blueprint.capabilities).filter((capability) => candidatesFor(capability).length === 0);
  const proposals: AgentToolProposal[] = [];
  for (const candidate of deduped) {
    const tool = tools.get(candidate.key);
    if (!tool) continue;
    const inputSchema = schema(tool.input_schema);
    const outputSchema = schema(tool.output_schema);
    validateToolSchema(inputSchema);
    validateToolSchema(outputSchema);
    const requiresApproval = tool.risk_level !== "read";
    const existing = await sql.query<{ tool_id: string }>(
      `select tool_id from agent_tool_proposals
        where workspace_id = $1 and blueprint_id = $2 and capability = $3 and tool_key = $4
        limit 1`,
      [input.workspaceId, input.blueprintId, candidate.capability, tool.key],
    );
    const reviewTool = existing[0]
      ? (await sql.query<ToolRow>(
        `select id, key, name, description, input_schema, output_schema, risk_level, status
           from tools where id = $1 and workspace_id = $2 and status = 'review' limit 1`,
        [existing[0].tool_id, input.workspaceId],
      ))[0]
      : await ensureReviewTool(sql, input.workspaceId, tool.key, tool);
    if (!reviewTool) throw new Error("TOOL_PROPOSAL_REVIEW_REQUIRED");
    const rows = await sql.query<AgentToolProposal>(
      `insert into agent_tool_proposals
        (id, workspace_id, agent_id, blueprint_id, capability, tool_id, tool_key, name,
         description, input_schema, output_schema, risk_level, requires_approval, rationale,
         status, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,'draft',$15)
       on conflict (workspace_id, blueprint_id, capability, tool_key) do update set
         tool_id = excluded.tool_id, name = excluded.name, description = excluded.description,
         input_schema = excluded.input_schema, output_schema = excluded.output_schema,
         risk_level = excluded.risk_level, requires_approval = excluded.requires_approval,
         rationale = excluded.rationale, status = case when agent_tool_proposals.status = 'draft' then 'draft' else agent_tool_proposals.status end,
         updated_at = current_timestamp
       returning id, workspace_id as "workspaceId", agent_id as "agentId", blueprint_id as "blueprintId",
                 capability, tool_id as "toolId", tool_key as "toolKey", name, description,
                 input_schema as "inputSchema", output_schema as "outputSchema",
                 risk_level as "riskLevel", requires_approval as "requiresApproval", rationale, status,
                 created_by as "createdBy", reviewed_by as "reviewedBy", reviewed_at as "reviewedAt",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [randomUUID(), input.workspaceId, input.agentId, input.blueprintId, candidate.capability, reviewTool.id, tool.key, bounded(tool.name, 160), bounded(tool.description, 1000), JSON.stringify(inputSchema), JSON.stringify(outputSchema), tool.risk_level, requiresApproval, proposalRationale(candidate.capability, tool), userId],
    );
    if (rows[0]) proposals.push(rows[0]);
  }
  return { blueprintId: blueprint.id, proposals, unsupportedCapabilities };
}
