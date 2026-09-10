-- Workspace-scoped availability slots for the native calendar tool.
create table if not exists calendar_availability_slots (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'available' check (status in ('available', 'booked', 'blocked')),
  resource_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  check (end_at > start_at),
  unique (workspace_id, start_at, end_at)
);
create index if not exists calendar_availability_workspace_window_idx
  on calendar_availability_slots (workspace_id, status, start_at);

insert into tools (id, workspace_id, connector_definition_id, key, name, description, risk_level, timeout_ms, input_schema, output_schema)
values (
  'tool_calendar_list_availability', null, null, 'calendar.list_availability',
  'Consultar disponibilidade',
  'Consulta horários disponíveis no calendário do workspace. Apenas leitura; não reserva nem altera horários.',
  'read', 3000,
  '{"type":"object","required":["from","to"],"properties":{"from":{"type":"string","description":"Início da janela ISO-8601"},"to":{"type":"string","description":"Fim da janela ISO-8601"},"durationMinutes":{"type":"integer","minimum":5,"maximum":480},"limit":{"type":"integer","minimum":1,"maximum":50}}}',
  '{"type":"object","required":["status","count","slots"],"properties":{"status":{"type":"string"},"count":{"type":"integer"},"slots":{"type":"array"}}}'
)
on conflict (id) do nothing;
