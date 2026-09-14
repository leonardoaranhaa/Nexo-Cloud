-- P0 promotion hardening: an active agent must always have a published version.
create or replace function nexo_assert_agent_active_has_published_version() returns trigger
language plpgsql as $$
begin
  if NEW.status = 'active' and not exists (
    select 1 from agent_versions v where v.agent_id = NEW.id and v.status = 'published'
  ) then
    raise exception 'AGENT_ACTIVE_REQUIRES_PUBLISHED_VERSION';
  end if;
  return NEW;
end;
$$;

drop trigger if exists nexo_agent_active_published_guard on agents;
create constraint trigger nexo_agent_active_published_guard
after insert or update of status on agents
deferrable initially deferred
for each row execute function nexo_assert_agent_active_has_published_version();

alter table agent_evaluation_harness_runs
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists approval_note text;

create index if not exists agent_evaluation_harness_approved_candidate_idx
  on agent_evaluation_harness_runs (workspace_id, agent_id, candidate_version_id, approved_at)
  where status = 'succeeded' and approved_at is not null;

create or replace function nexo_assert_harness_approval_consistency() returns trigger
language plpgsql as $$
declare
  candidate_agent text;
begin
  if NEW.approved_at is not null then
    if NEW.status <> 'succeeded' then
      raise exception 'HARNESS_APPROVAL_REQUIRES_SUCCESS';
    end if;
    if NEW.regression_count <> 0 then
      raise exception 'HARNESS_APPROVAL_REQUIRES_NO_REGRESSIONS';
    end if;
    if coalesce((NEW.candidate_metrics->>'successRate')::numeric, 0) < coalesce((NEW.baseline_metrics->>'successRate')::numeric, 0)
       or coalesce((NEW.candidate_metrics->>'guardrailViolationCount')::numeric, 0) > coalesce((NEW.baseline_metrics->>'guardrailViolationCount')::numeric, 0) then
      raise exception 'HARNESS_APPROVAL_QUALITY_REGRESSION';
    end if;
    select agent_id into candidate_agent from agent_versions where id = NEW.candidate_version_id;
    if candidate_agent is distinct from NEW.agent_id then
      raise exception 'HARNESS_APPROVAL_CANDIDATE_MISMATCH';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists nexo_harness_approval_guard on agent_evaluation_harness_runs;
create trigger nexo_harness_approval_guard
before insert or update of approved_at, approved_by, status, regression_count
on agent_evaluation_harness_runs
for each row execute function nexo_assert_harness_approval_consistency();
