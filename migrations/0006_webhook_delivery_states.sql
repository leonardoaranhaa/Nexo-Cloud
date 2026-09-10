-- Compatibility migration for databases that already applied 0004/0005.
alter table message_deliveries
  drop constraint if exists message_deliveries_status_check;
alter table message_deliveries
  add constraint message_deliveries_status_check
  check (status in ('pending', 'sending', 'sent', 'delivered', 'read', 'failed', 'unknown'));

alter table connections
  add column if not exists last_event_at timestamptz;
