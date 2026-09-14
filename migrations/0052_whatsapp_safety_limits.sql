-- WhatsApp anti-abuse controls are connection-scoped and enforced server-side.
alter table connections
  add column if not exists outbound_day date,
  add column if not exists outbound_day_count integer not null default 0,
  add column if not exists outbound_burst_started_at timestamptz,
  add column if not exists outbound_burst_count integer not null default 0,
  add column if not exists outbound_last_at timestamptz,
  add column if not exists agent_pause_until timestamptz;

create index if not exists connections_agent_pause_idx
  on connections (workspace_id, agent_pause_until)
  where agent_pause_until is not null;
