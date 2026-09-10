import type { Sql } from "../db.ts";
import { requireWorkspaceAccess } from "../multitenancy/server.ts";

export type LeadMetricsFilter = { workspaceId: string; from?: string; to?: string; agentId?: string; productId?: string };
export type LeadMetrics = {
  from: string; to: string; lastUpdated: string;
  summary: { total: number; qualifying: number; qualified: number; converted: number; lost: number; qualificationRate: number; conversionRate: number; averageScore: number; assignedQualified: number; unassignedQualified: number; pendingFollowUps: number };
  funnel: { stage: string; count: number }[];
  byAgent: { agentId: string; agentName: string; total: number; qualified: number; converted: number; conversionRate: number }[];
  byProduct: { productId: string; productName: string; total: number; qualified: number; converted: number; conversionRate: number }[];
};

function date(value: string | undefined, fallback: Date): string {
  if (!value) return fallback.toISOString();
  const parsed = new Date(value); if (!Number.isFinite(parsed.getTime())) throw new Error("METRICS_DATE_INVALID");
  return parsed.toISOString();
}
function pct(numerator: number, denominator: number): number { return denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0; }

export async function getLeadMetrics(sql: Sql, userId: string, input: LeadMetricsFilter): Promise<LeadMetrics> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "read");
  const end = date(input.to, new Date());
  const start = date(input.from, new Date(new Date(end).getTime() - 7 * 86400000));
  if (new Date(start) > new Date(end)) throw new Error("METRICS_RANGE_INVALID");
  if (new Date(end).getTime() - new Date(start).getTime() > 366 * 86400000) throw new Error("METRICS_RANGE_TOO_LARGE");
  const params: unknown[] = [input.workspaceId, start, end];
  const conditions = ["l.workspace_id = $1", "l.created_at >= $2::timestamptz", "l.created_at < $3::timestamptz"];
  if (input.agentId) { params.push(input.agentId); conditions.push(`c.agent_id = $${params.length}`); }
  if (input.productId) { params.push(input.productId); conditions.push(`ai.product_id = $${params.length}`); }
  const where = conditions.join(" and ");
  const baseJoin = `from crm_leads l left join conversations c on c.id = l.last_conversation_id and c.workspace_id = l.workspace_id left join agents a on a.id = c.agent_id and a.workspace_id = l.workspace_id left join lateral (select product_id from agent_installations where workspace_id = l.workspace_id and agent_id = c.agent_id and status in ('draft','staging','active') order by updated_at desc limit 1) ai on true where ${where}`;
  const summaryRows = await sql.query<{ total: number; qualifying: number; qualified: number; converted: number; lost: number; average_score: number; assigned_qualified: number; unassigned_qualified: number }>(`select count(*)::int as total, count(*) filter (where l.stage in ('qualifying','engaged','new','nurture'))::int as qualifying, count(*) filter (where l.stage = 'qualified')::int as qualified, count(*) filter (where l.stage = 'converted')::int as converted, count(*) filter (where l.stage = 'lost')::int as lost, coalesce(round(avg(l.score)),0)::int as average_score, count(*) filter (where l.stage = 'qualified' and l.owner_id is not null)::int as assigned_qualified, count(*) filter (where l.stage = 'qualified' and l.owner_id is null)::int as unassigned_qualified ${baseJoin}`, params);
  const funnel = await sql.query<{ stage: string; count: number }>(`select l.stage, count(*)::int as count ${baseJoin} group by l.stage order by count desc`, params);
  const agents = await sql.query<{ agent_id: string; agent_name: string; total: number; qualified: number; converted: number }>(`select coalesce(a.id,'unassigned') as agent_id, coalesce(a.name,'Sem agente') as agent_name, count(*)::int as total, count(*) filter (where l.stage = 'qualified')::int as qualified, count(*) filter (where l.stage = 'converted')::int as converted ${baseJoin} group by a.id, a.name order by converted desc, total desc`, params);
  const productJoin = `from crm_leads l left join conversations c on c.id = l.last_conversation_id and c.workspace_id = l.workspace_id left join agents a on a.id = c.agent_id and a.workspace_id = l.workspace_id left join lateral (select product_id from agent_installations where workspace_id = l.workspace_id and agent_id = c.agent_id and status in ('draft','staging','active') order by updated_at desc limit 1) ai on true left join agent_products p on p.id = ai.product_id where ${where}`;
  const products = await sql.query<{ product_id: string; product_name: string; total: number; qualified: number; converted: number }>(`select coalesce(ai.product_id,'unassigned') as product_id, coalesce(p.name,'Sem produto') as product_name, count(*)::int as total, count(*) filter (where l.stage = 'qualified')::int as qualified, count(*) filter (where l.stage = 'converted')::int as converted ${productJoin} group by ai.product_id, p.name order by converted desc, total desc`, params);
  const followParams: unknown[] = [input.workspaceId, end];
  const followConditions = ["workspace_id = $1", "scheduled_at <= $2::timestamptz", "status in ('scheduled','processing','failed')"];
  if (input.agentId) { followParams.push(input.agentId); followConditions.push(`agent_id = $${followParams.length}`); }
  const pending = await sql.query<{ count: number }>(`select count(*)::int as count from crm_follow_ups where ${followConditions.join(" and ")}`, followParams);
  const summary = summaryRows[0] ?? { total: 0, qualifying: 0, qualified: 0, converted: 0, lost: 0, average_score: 0, assigned_qualified: 0, unassigned_qualified: 0 };
  const total = Number(summary.total); const qualified = Number(summary.qualified); const converted = Number(summary.converted);
  return { from: start, to: end, lastUpdated: new Date().toISOString(), summary: { total, qualifying: Number(summary.qualifying), qualified, converted, lost: Number(summary.lost), qualificationRate: pct(qualified + converted, total), conversionRate: pct(converted, total), averageScore: Number(summary.average_score), assignedQualified: Number(summary.assigned_qualified), unassignedQualified: Number(summary.unassigned_qualified), pendingFollowUps: Number(pending[0]?.count ?? 0) }, funnel: funnel.map((row) => ({ stage: row.stage, count: Number(row.count) })), byAgent: agents.map((row) => ({ agentId: row.agent_id, agentName: row.agent_name, total: Number(row.total), qualified: Number(row.qualified), converted: Number(row.converted), conversionRate: pct(Number(row.converted), Number(row.total)) })), byProduct: products.map((row) => ({ productId: row.product_id, productName: row.product_name, total: Number(row.total), qualified: Number(row.qualified), converted: Number(row.converted), conversionRate: pct(Number(row.converted), Number(row.total)) })) };
}
