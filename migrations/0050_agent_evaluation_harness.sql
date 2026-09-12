-- Offline, workspace-scoped comparisons between two agent versions.
-- This table stores sanitized snapshots and metrics only; it never publishes or executes production work.
create table if not exists agent_evaluation_harness_runs (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  agent_id text not null references agents (id) on delete cascade,
  blueprint_id text not null references agent_development_blueprints (id) on delete cascade,
  baseline_version_id text not null references agent_versions (id) on delete restrict,
  candidate_version_id text not null references agent_versions (id) on delete restrict,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed')),
  scenario_count integer not null default 0 check (scenario_count >= 0),
  regression_count integer not null default 0 check (regression_count >= 0),
  baseline_snapshot jsonb not null default '{}'::jsonb,
  candidate_snapshot jsonb not null default '{}'::jsonb,
  baseline_metrics jsonb not null default '{}'::jsonb,
  candidate_metrics jsonb not null default '{}'::jsonb,
  duration_ms integer,
  error_code text,
  error_message text,
  created_by text not null,
  created_at timestamptz not null default current_timestamp,
  completed_at timestamptz,
  check (baseline_version_id <> candidate_version_id)
);

create table if not exists agent_evaluation_harness_results (
  id text primary key,
  run_id text not null references agent_evaluation_harness_runs (id) on delete cascade,
  workspace_id text not null references workspaces (id) on delete cascade,
  agent_id text not null references agents (id) on delete cascade,
  blueprint_id text not null references agent_development_blueprints (id) on delete cascade,
  scenario_id text not null,
  scenario_name text not null,
  baseline_result jsonb not null default '{}'::jsonb,
  candidate_result jsonb not null default '{}'::jsonb,
  regression boolean not null default false,
  differences jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default current_timestamp,
  unique (run_id, scenario_id)
);

create index if not exists agent_evaluation_harness_runs_workspace_idx
  on agent_evaluation_harness_runs (workspace_id, created_at desc);
create index if not exists agent_evaluation_harness_results_run_idx
  on agent_evaluation_harness_results (run_id, regression);
create index if not exists agent_evaluation_harness_results_workspace_idx
  on agent_evaluation_harness_results (workspace_id, created_at desc);

create or replace function nexo_assert_harness_workspace_consistency() returns trigger
language plpgsql as $$
declare
  expected_workspace text;
  expected_agent text;
begin
  if TG_TABLE_NAME = 'agent_evaluation_harness_runs' then
    select a.workspace_id, a.id into expected_workspace, expected_agent
      from agents a where a.id = NEW.agent_id;
    if expected_workspace is null or expected_workspace <> NEW.workspace_id then
      raise exception 'WORKSPACE_ISOLATION_HARNESS_AGENT';
    end if;
    if (select v.agent_id from agent_versions v where v.id = NEW.baseline_version_id) is distinct from expected_agent
       or (select v.agent_id from agent_versions v where v.id = NEW.candidate_version_id) is distinct from expected_agent then
      raise exception 'WORKSPACE_ISOLATION_HARNESS_VERSION_AGENT';
    end if;
    select workspace_id into expected_workspace from agent_development_blueprints where id = NEW.blueprint_id;
    if expected_workspace is null or expected_workspace <> NEW.workspace_id then
      raise exception 'WORKSPACE_ISOLATION_HARNESS_BLUEPRINT';
    end if;
  elsif TG_TABLE_NAME = 'agent_evaluation_harness_results' then
    select workspace_id into expected_workspace from agent_evaluation_harness_runs where id = NEW.run_id;
    if expected_workspace is null or expected_workspace <> NEW.workspace_id then
      raise exception 'WORKSPACE_ISOLATION_HARNESS_RESULT_RUN';
    end if;
    select workspace_id into expected_workspace from agents where id = NEW.agent_id;
    if expected_workspace is null or expected_workspace <> NEW.workspace_id then
      raise exception 'WORKSPACE_ISOLATION_HARNESS_RESULT_AGENT';
    end if;
    select workspace_id into expected_workspace from agent_development_blueprints where id = NEW.blueprint_id;
    if expected_workspace is null or expected_workspace <> NEW.workspace_id then
      raise exception 'WORKSPACE_ISOLATION_HARNESS_RESULT_BLUEPRINT';
    end if;
  end if;
  return NEW;
end;
$$;

create trigger nexo_harness_runs_workspace_guard
before insert or update on agent_evaluation_harness_runs
for each row execute function nexo_assert_harness_workspace_consistency();

create trigger nexo_harness_results_workspace_guard
before insert or update on agent_evaluation_harness_results
for each row execute function nexo_assert_harness_workspace_consistency();
