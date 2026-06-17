-- MT5 7-day free trial tracking columns on user_profiles
-- Run in: Supabase Dashboard → SQL Editor → New query

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS mt5_trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mt5_trial_ends_at    TIMESTAMPTZ;

-- Backfill existing MetaAPI users: trial started on their first account's created_at
-- This gives existing users 7 days from when they first connected, not from today
UPDATE user_profiles up
SET
  mt5_trial_started_at = ta.first_connect,
  mt5_trial_ends_at    = ta.first_connect + INTERVAL '7 days'
FROM (
  SELECT user_id, MIN(created_at) AS first_connect
  FROM  trading_accounts
  WHERE sync_source = 'metaapi' OR sync_method = 'metaapi'
  GROUP BY user_id
) ta
WHERE up.user_id            = ta.user_id
  AND up.mt5_trial_started_at IS NULL;
