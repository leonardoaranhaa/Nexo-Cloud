insert into connector_definitions (id, key, name, provider, version, capabilities)
values
  ('connector_def_instagram', 'instagram_messaging', 'Instagram · Messaging API', 'instagram', 'v1', '{"healthcheck":true,"webhook":true,"messaging":true,"handoff":true}'::jsonb),
  ('connector_def_messenger', 'messenger_platform', 'Messenger · Platform API', 'messenger', 'v1', '{"healthcheck":true,"webhook":true,"messaging":true,"handoff":true}'::jsonb)
on conflict (id) do update set key = excluded.key, name = excluded.name, provider = excluded.provider, version = excluded.version, capabilities = excluded.capabilities;
