import type { Sql } from "../db.ts";
import type { PlatformSettings } from "../store";
import { updateUserPreferencesInput } from "../validation/server-schemas";

export type UserAccount = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_USER_PREFERENCES: PlatformSettings = {
  appearance: "dark",
  compactNavigation: false,
  reduceMotion: false,
  autoRefreshSeconds: 15,
  defaultMemoryWindow: 12,
  defaultTemperature: 0.4,
  notifyHandoffs: true,
  notifyFailures: true,
  notifyDeployments: true,
  confirmHighRiskTools: true,
  allowLocalFallback: true,
  defaultEnvironment: "development",
};

const PREFERENCE_KEYS = new Set<keyof PlatformSettings>([
  "appearance",
  "compactNavigation",
  "reduceMotion",
  "autoRefreshSeconds",
  "defaultMemoryWindow",
  "defaultTemperature",
  "notifyHandoffs",
  "notifyFailures",
  "notifyDeployments",
  "confirmHighRiskTools",
  "allowLocalFallback",
  "defaultEnvironment",
]);

function safePreferences(value: unknown): Partial<PlatformSettings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const candidate: Record<string, unknown> = {};
  for (const key of PREFERENCE_KEYS) {
    const valueForKey = source[key];
    if (valueForKey !== undefined) candidate[key] = valueForKey;
  }
  const parsed = updateUserPreferencesInput.safeParse(candidate);
  return parsed.success ? parsed.data : {};
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) return value;
  return new Date(0).toISOString();
}

export async function getUserAccount(sql: Sql, userId: string): Promise<UserAccount | null> {
  const rows = await sql.query<{
    id: string;
    name: string;
    email: string;
    email_verified: boolean;
    created_at: unknown;
    updated_at: unknown;
  }>(
    `select "id", "name", "email", "emailVerified" as email_verified,
            "createdAt" as created_at, "updatedAt" as updated_at
       from "user"
      where "id" = $1
      limit 1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: Boolean(row.email_verified),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export async function updateUserProfile(sql: Sql, userId: string, name: string): Promise<UserAccount> {
  const normalized = name.trim();
  if (!normalized) throw new Error("ACCOUNT_NAME_REQUIRED");
  if (normalized.length > 120) throw new Error("ACCOUNT_NAME_TOO_LONG");
  const rows = await sql.query<{ id: string }>(
    `update "user"
        set "name" = $2, "updatedAt" = current_timestamp
      where "id" = $1
      returning "id"`,
    [userId, normalized],
  );
  if (!rows[0]) throw new Error("ACCOUNT_NOT_FOUND");
  const account = await getUserAccount(sql, userId);
  if (!account) throw new Error("ACCOUNT_NOT_FOUND");
  return account;
}

export async function getUserPreferences(sql: Sql, userId: string): Promise<PlatformSettings> {
  const rows = await sql.query<{ preferences: unknown }>(
    `select preferences from user_preferences where user_id = $1 limit 1`,
    [userId],
  );
  return { ...DEFAULT_USER_PREFERENCES, ...safePreferences(rows[0]?.preferences) };
}

export async function updateUserPreferences(
  sql: Sql,
  userId: string,
  patch: Partial<PlatformSettings>,
): Promise<PlatformSettings> {
  const current = await getUserPreferences(sql, userId);
  const next = { ...current, ...safePreferences(patch) };
  const user = await sql.query<{ id: string }>(`select "id" from "user" where "id" = $1 limit 1`, [userId]);
  // The dev fallback has no Better Auth row. Keep its settings in Zustand rather
  // than failing the local console; real authenticated users persist here.
  if (!user[0]) return next;
  await sql.query(
    `insert into user_preferences (user_id, preferences)
     values ($1, $2::jsonb)
     on conflict (user_id) do update set
       preferences = excluded.preferences,
       updated_at = current_timestamp`,
    [userId, JSON.stringify(next)],
  );
  return next;
}
