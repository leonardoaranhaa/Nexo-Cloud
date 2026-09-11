-- Contextual onboarding metadata for the first workspace.
alter table workspaces
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists onboarding_goal text,
  add column if not exists onboarding_team_size text;
