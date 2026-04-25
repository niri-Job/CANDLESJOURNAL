-- ─── Add subscription columns to user_profiles ───────────────────────────────
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- Safe to run multiple times — all statements are idempotent.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_start  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_end    TIMESTAMPTZ;

-- Index for fast subscription status lookups
CREATE INDEX IF NOT EXISTS user_profiles_subscription_status_idx
  ON user_profiles(subscription_status);
