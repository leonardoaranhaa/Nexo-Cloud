-- Database-level defense in depth for workspace isolation.
-- Server-side authorization remains mandatory; these guards prevent accidental cross-tenant writes.

create or replace function nexo_assert_workspace_consistency() returns trigger
language plpgsql as $$
declare
  expected_workspace text;
begin
  if TG_TABLE_NAME = 'agent_connections' then
    select workspace_id into expected_workspace from agents where id = NEW.agent_id;
    if expected_workspace is null or expected_workspace <> (select workspace_id from connections where id = NEW.connection_id) then
      raise exception 'WORKSPACE_ISOLATION_AGENT_CONNECTION';
    end if;
  elsif TG_TABLE_NAME = 'agent_tool_permissions' then
    select a.workspace_id into expected_workspace
      from agent_versions v join agents a on a.id = v.agent_id
     where v.id = NEW.agent_version_id;
    if expected_workspace is null or NEW.workspace_id <> expected_workspace then
      raise exception 'WORKSPACE_ISOLATION_TOOL_PERMISSION';
    end if;
    select workspace_id into expected_workspace from tools where id = NEW.tool_id;
    if expected_workspace is not null and expected_workspace <> NEW.workspace_id then
      raise exception 'WORKSPACE_ISOLATION_TOOL_PERMISSION_TOOL';
    end if;
  elsif TG_TABLE_NAME = 'agent_tool_proposals' then
    select workspace_id into expected_workspace from agents where id = NEW.agent_id;
    if expected_workspace is null or NEW.workspace_id <> expected_workspace then
      raise exception 'WORKSPACE_ISOLATION_TOOL_PROPOSAL_AGENT';
    end if;
    select workspace_id into expected_workspace from agent_development_blueprints where id = NEW.blueprint_id;
    if expected_workspace is null or NEW.workspace_id <> expected_workspace then
      raise exception 'WORKSPACE_ISOLATION_TOOL_PROPOSAL_BLUEPRINT';
    end if;
    select workspace_id into expected_workspace from tools where id = NEW.tool_id;
    if expected_workspace is null or NEW.workspace_id <> expected_workspace then
      raise exception 'WORKSPACE_ISOLATION_TOOL_PROPOSAL_TOOL';
    end if;
  elsif TG_TABLE_NAME = 'tool_executions' then
    if NEW.agent_id is not null then
      select workspace_id into expected_workspace from agents where id = NEW.agent_id;
      if expected_workspace is null or NEW.workspace_id <> expected_workspace then
        raise exception 'WORKSPACE_ISOLATION_TOOL_EXECUTION_AGENT';
      end if;
    end if;
    if NEW.agent_version_id is not null then
      select a.workspace_id into expected_workspace
        from agent_versions v join agents a on a.id = v.agent_id
       where v.id = NEW.agent_version_id;
      if expected_workspace is null or NEW.workspace_id <> expected_workspace then
        raise exception 'WORKSPACE_ISOLATION_TOOL_EXECUTION_VERSION';
      end if;
    end if;
    if NEW.connector_instance_id is not null then
      select workspace_id into expected_workspace from connections where id = NEW.connector_instance_id;
      if expected_workspace is null or NEW.workspace_id <> expected_workspace then
        raise exception 'WORKSPACE_ISOLATION_TOOL_EXECUTION_CONNECTION';
      end if;
    end if;
  elsif TG_TABLE_NAME = 'tool_execution_approvals' then
    select workspace_id into expected_workspace from tool_executions where id = NEW.tool_execution_id;
    if expected_workspace is null or NEW.workspace_id <> expected_workspace then
      raise exception 'WORKSPACE_ISOLATION_TOOL_APPROVAL';
    end if;
  elsif TG_TABLE_NAME = 'agent_blueprint_evaluation_runs' then
    select workspace_id into expected_workspace from agents where id = NEW.agent_id;
    if expected_workspace is null or NEW.workspace_id <> expected_workspace then
      raise exception 'WORKSPACE_ISOLATION_EVALUATION_AGENT';
    end if;
    select workspace_id into expected_workspace from agent_development_blueprints where id = NEW.blueprint_id;
    if expected_workspace is null or NEW.workspace_id <> expected_workspace then
      raise exception 'WORKSPACE_ISOLATION_EVALUATION_BLUEPRINT';
    end if;
  elsif TG_TABLE_NAME = 'agent_blueprint_evaluation_results' then
    select workspace_id into expected_workspace from agent_blueprint_evaluation_runs where id = NEW.run_id;
    if expected_workspace is null or NEW.workspace_id <> expected_workspace then
      raise exception 'WORKSPACE_ISOLATION_EVALUATION_RUN';
    end if;
    select workspace_id into expected_workspace from agents where id = NEW.agent_id;
    if expected_workspace is null or NEW.workspace_id <> expected_workspace then
      raise exception 'WORKSPACE_ISOLATION_EVALUATION_RESULT_AGENT';
    end if;
    select workspace_id into expected_workspace from agent_development_blueprints where id = NEW.blueprint_id;
    if expected_workspace is null or NEW.workspace_id <> expected_workspace then
      raise exception 'WORKSPACE_ISOLATION_EVALUATION_RESULT_BLUEPRINT';
    end if;
  end if;
  return NEW;
end;
$$;

create trigger nexo_agent_connections_workspace_guard
before insert or update on agent_connections
for each row execute function nexo_assert_workspace_consistency();

create trigger nexo_agent_tool_permissions_workspace_guard
before insert or update on agent_tool_permissions
for each row execute function nexo_assert_workspace_consistency();

create trigger nexo_agent_tool_proposals_workspace_guard
before insert or update on agent_tool_proposals
for each row execute function nexo_assert_workspace_consistency();

create trigger nexo_tool_executions_workspace_guard
before insert or update on tool_executions
for each row execute function nexo_assert_workspace_consistency();

create trigger nexo_tool_execution_approvals_workspace_guard
before insert or update on tool_execution_approvals
for each row execute function nexo_assert_workspace_consistency();

create trigger nexo_evaluation_runs_workspace_guard
before insert or update on agent_blueprint_evaluation_runs
for each row execute function nexo_assert_workspace_consistency();

create trigger nexo_evaluation_results_workspace_guard
before insert or update on agent_blueprint_evaluation_results
for each row execute function nexo_assert_workspace_consistency();
