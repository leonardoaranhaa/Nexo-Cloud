-- Immutable, sanitized snapshots make offline evaluations comparable after later edits.
alter table agent_blueprint_evaluation_runs
  add column if not exists agent_version_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists tools_snapshot jsonb not null default '[]'::jsonb;
