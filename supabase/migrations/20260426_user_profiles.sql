-- ─── user_profiles: onboarding data + trader profile ────────────────────────
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- Safe to run multiple times — all statements are idempotent.

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name              TEXT,
  broker            TEXT,
  account_size      TEXT,
  preferred_pairs   TEXT[],
  experience_level  TEXT,
  trading_style     TEXT,
  preferred_sessions TEXT[],
  monthly_target    NUMERIC,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles: select own row" ON user_profiles;
DROP POLICY IF EXISTS "profiles: insert own row" ON user_profiles;
DROP POLICY IF EXISTS "profiles: update own row" ON user_profiles;
DROP POLICY IF EXISTS "profiles: delete own row" ON user_profiles;

CREATE POLICY "profiles: select own row" ON user_profiles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "profiles: insert own row" ON user_profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "profiles: update own row" ON user_profiles
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "profiles: delete own row" ON user_profiles
  FOR DELETE USING (user_id = auth.uid());
