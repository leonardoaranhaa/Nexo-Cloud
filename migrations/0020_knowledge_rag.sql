-- Persistent, tenant-isolated knowledge sources for retrieval augmented generation.
create table if not exists knowledge_documents (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  source_scope text not null default 'workspace' check (source_scope in ('workspace', 'product')),
  title text not null,
  source_type text not null default 'text' check (source_type in ('text', 'faq', 'markdown', 'url', 'file')),
  source_uri text,
  language text not null default 'pt',
  status text not null default 'draft' check (status in ('draft', 'processed', 'archived')),
  version_number integer not null default 1,
  content_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by text not null,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  unique (workspace_id, content_hash)
);

create table if not exists knowledge_chunks (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  document_id text not null references knowledge_documents (id) on delete cascade,
  ordinal integer not null check (ordinal >= 0),
  heading text not null default '',
  content text not null,
  lexical_text text not null,
  token_count integer not null default 0,
  embedding jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default current_timestamp,
  unique (document_id, ordinal)
);

create index if not exists knowledge_chunks_workspace_idx on knowledge_chunks (workspace_id, document_id, ordinal);
create index if not exists knowledge_chunks_lexical_idx on knowledge_chunks (workspace_id, lexical_text);

create table if not exists knowledge_snapshots (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  name text not null,
  version_number integer not null default 1,
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  created_by text not null,
  created_at timestamptz not null default current_timestamp,
  published_at timestamptz,
  unique (workspace_id, version_number)
);

create unique index if not exists knowledge_one_published_snapshot_idx
  on knowledge_snapshots (workspace_id) where status = 'published';

create table if not exists knowledge_snapshot_chunks (
  snapshot_id text not null references knowledge_snapshots (id) on delete cascade,
  chunk_id text not null references knowledge_chunks (id) on delete cascade,
  primary key (snapshot_id, chunk_id)
);

create index if not exists knowledge_snapshot_chunks_chunk_idx on knowledge_snapshot_chunks (chunk_id);
