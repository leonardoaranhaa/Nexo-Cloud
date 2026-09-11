-- Controlled calendar booking with idempotency and explicit approval at the Tool Gateway.
create table if not exists calendar_bookings (
  id text primary key,
  workspace_id text not null references workspaces (id) on delete cascade,
  slot_id text not null references calendar_availability_slots (id) on delete restrict,
  conversation_id text references conversations (id) on delete set null,
  external_contact_id text not null,
  customer_name text,
  notes text,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  idempotency_key text not null,
  created_at timestamptz not null default current_timestamp,
  unique (workspace_id, idempotency_key),
  unique (workspace_id, slot_id, status)
);
create index if not exists calendar_bookings_workspace_idx on calendar_bookings (workspace_id, created_at desc);

insert into tools (id, workspace_id, connector_definition_id, key, name, description, risk_level, timeout_ms, input_schema, output_schema)
values (
  'tool_calendar_book_slot', null, null, 'calendar.book_slot', 'Reservar horário',
  'Reserva um horário disponível do calendário do workspace. Operação de escrita; requer aprovação quando habilitada na versão do agente.',
  'write', 3000,
  '{"type":"object","required":["slotId"],"properties":{"slotId":{"type":"string"},"customerName":{"type":"string"},"notes":{"type":"string"}}}',
  '{"type":"object","required":["status","bookingId","slotId"],"properties":{"status":{"type":"string"},"bookingId":{"type":"string"},"slotId":{"type":"string"}}}'
)
on conflict (id) do nothing;
