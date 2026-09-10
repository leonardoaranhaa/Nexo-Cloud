import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "../db";
import { requireWorkspaceAccess } from "../multitenancy/server.ts";

export type KnowledgeEvidence = {
  sourceId: string;
  sourceType: "rag_chunk";
  title: string;
  excerpt: string;
  score: number;
};

export type KnowledgeDocument = {
  id: string;
  workspaceId: string;
  title: string;
  sourceType: "text" | "faq" | "markdown" | "url" | "file";
  language: string;
  status: "draft" | "processed" | "archived";
  versionNumber: number;
  chunkCount: number;
};

function clean(value: string, max: number): string {
  return value.replace(/\u0000/g, "").trim().slice(0, max);
}

function lexical(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function chunks(content: string, max = 900): { heading: string; content: string }[] {
  const paragraphs = content.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const output: { heading: string; content: string }[] = [];
  let current = "";
  let heading = "";
  for (const paragraph of paragraphs) {
    if (/^#{1,3}\s+/.test(paragraph)) {
      heading = paragraph.replace(/^#{1,3}\s+/, "").slice(0, 160);
      continue;
    }
    if (current && current.length + paragraph.length + 2 > max) {
      output.push({ heading, content: current.slice(0, max) });
      current = "";
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current) output.push({ heading, content: current.slice(0, max) });
  return output.length ? output : [{ heading: "", content: content.slice(0, max) }];
}

export async function createKnowledgeDocument(sql: Sql, userId: string, input: { workspaceId: string; title: string; content: string; sourceType?: KnowledgeDocument["sourceType"]; language?: string; sourceUri?: string }): Promise<KnowledgeDocument> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const title = clean(input.title, 160);
  const content = clean(input.content, 100_000);
  if (!title || !content) throw new Error("KNOWLEDGE_TITLE_AND_CONTENT_REQUIRED");
  const hash = createHash("sha256").update(content).digest("hex");
  const existing = await sql<KnowledgeDocument>`select id, workspace_id as "workspaceId", title, source_type as "sourceType", language, status, version_number as "versionNumber", 0 as "chunkCount" from knowledge_documents where workspace_id = ${input.workspaceId} and content_hash = ${hash} limit 1`;
  if (existing[0]) return existing[0];
  const documentId = randomUUID();
  await sql.query(`insert into knowledge_documents (id, workspace_id, title, source_type, source_uri, language, status, content_hash, metadata, created_by) values ($1, $2, $3, $4, $5, $6, 'processed', $7, '{}'::jsonb, $8)`, [documentId, input.workspaceId, title, input.sourceType ?? "text", input.sourceUri ?? null, input.language ?? "pt", hash, userId]);
  const parts = chunks(content);
  for (const [ordinal, part] of parts.entries()) {
    const value = clean(part.content, 900);
    await sql.query(`insert into knowledge_chunks (id, workspace_id, document_id, ordinal, heading, content, lexical_text, token_count) values ($1, $2, $3, $4, $5, $6, $7, $8)`, [randomUUID(), input.workspaceId, documentId, ordinal, clean(part.heading, 160), value, lexical(`${part.heading} ${value}`), lexical(value).split(" ").filter(Boolean).length]);
  }
  return { id: documentId, workspaceId: input.workspaceId, title, sourceType: input.sourceType ?? "text", language: input.language ?? "pt", status: "processed", versionNumber: 1, chunkCount: parts.length };
}

export async function createKnowledgeSnapshot(sql: Sql, userId: string, input: { workspaceId: string; name: string }): Promise<{ id: string; versionNumber: number }> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "write");
  const next = await sql<{ version_number: number }>`select coalesce(max(version_number), 0) + 1 as version_number from knowledge_snapshots where workspace_id = ${input.workspaceId}`;
  const versionNumber = Number(next[0]?.version_number ?? 1);
  const snapshotId = randomUUID();
  await sql.query(`insert into knowledge_snapshots (id, workspace_id, name, version_number, status, created_by) values ($1, $2, $3, $4, 'draft', $5)`, [snapshotId, input.workspaceId, clean(input.name, 160) || `Knowledge v${versionNumber}`, versionNumber, userId]);
  await sql.query(`insert into knowledge_snapshot_chunks (snapshot_id, chunk_id) select $1, id from knowledge_chunks where workspace_id = $2 and document_id in (select id from knowledge_documents where workspace_id = $2 and status = 'processed')`, [snapshotId, input.workspaceId]);
  return { id: snapshotId, versionNumber };
}

export async function publishKnowledgeSnapshot(sql: Sql, userId: string, input: { workspaceId: string; snapshotId: string }): Promise<void> {
  await requireWorkspaceAccess(sql, userId, input.workspaceId, "publish");
  const target = await sql<{ id: string }>`select id from knowledge_snapshots where id = ${input.snapshotId} and workspace_id = ${input.workspaceId} and status = 'draft' limit 1`;
  if (!target[0]) throw new Error("KNOWLEDGE_SNAPSHOT_NOT_FOUND");
  await sql.query(`update knowledge_snapshots set status = 'retired' where workspace_id = $1 and status = 'published'`, [input.workspaceId]);
  await sql.query(`update knowledge_snapshots set status = 'published', published_at = current_timestamp where id = $1 and workspace_id = $2`, [input.snapshotId, input.workspaceId]);
}

function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0; let aa = 0; let bb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return aa && bb ? dot / (Math.sqrt(aa) * Math.sqrt(bb)) : 0;
}

export async function retrieveKnowledge(sql: Sql, input: { workspaceId: string; query: string; limit?: number; queryEmbedding?: number[] }): Promise<KnowledgeEvidence[]> {
  const query = lexical(input.query);
  if (!query) return [];
  const rows = await sql<{ id: string; title: string; content: string; lexical_text: string; embedding: number[] | null }>`
    select distinct kc.id, kd.title, kc.content, kc.lexical_text, kc.embedding
      from knowledge_snapshot_chunks ksc
      join knowledge_snapshots ks on ks.id = ksc.snapshot_id and ks.status = 'published' and ks.workspace_id = ${input.workspaceId}
      join knowledge_chunks kc on kc.id = ksc.chunk_id and kc.workspace_id = ${input.workspaceId}
      join knowledge_documents kd on kd.id = kc.document_id and kd.workspace_id = ${input.workspaceId} and kd.status = 'processed'
     where kc.lexical_text is not null
     limit 200
  `;
  const terms = new Set(query.split(" ").filter((term) => term.length > 2));
  return rows.map((row) => {
    const matched = [...terms].filter((term) => row.lexical_text.includes(term)).length;
    const lexicalScore = matched / Math.max(terms.size, 1);
    const vector = Array.isArray(row.embedding) ? cosine(input.queryEmbedding ?? [], row.embedding) : 0;
    return { sourceId: `rag:${row.id}`, sourceType: "rag_chunk" as const, title: row.title, excerpt: row.content.slice(0, 800), score: Math.min(1, lexicalScore * 0.7 + Math.max(0, vector) * 0.3) };
  }).filter((item) => item.score >= 0.12).sort((a, b) => b.score - a.score).slice(0, Math.min(Math.max(input.limit ?? 5, 1), 10));
}
