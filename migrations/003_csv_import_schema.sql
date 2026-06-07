-- ─────────────────────────────────────────────────────────────────
-- Migration 003: CSV import schema — add missing columns + constraints
-- Run this in Supabase SQL editor before using CSV import.
-- Safe to run multiple times (all statements are idempotent).
-- ─────────────────────────────────────────────────────────────────

-- ── 1. Rename 'exit' → 'exit_price' if the rename hasn't happened yet ────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trades' AND column_name = 'exit'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trades' AND column_name = 'exit_price'
  ) THEN
    ALTER TABLE trades RENAME COLUMN "exit" TO exit_price;
  END IF;
END $$;

-- ── 2. Add missing columns to trades ─────────────────────────────────────────
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS exit_price        NUMERIC,
  ADD COLUMN IF NOT EXISTS asset_class       TEXT    NOT NULL DEFAULT 'Forex',
  ADD COLUMN IF NOT EXISTS session           TEXT    NOT NULL DEFAULT 'London',
  ADD COLUMN IF NOT EXISTS setup             TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS account_signature TEXT,
  ADD COLUMN IF NOT EXISTS account_label     TEXT,
  ADD COLUMN IF NOT EXISTS account_login     TEXT,
  ADD COLUMN IF NOT EXISTS account_broker    TEXT,
  ADD COLUMN IF NOT EXISTS source            TEXT    NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS mt5_deal_id       TEXT,
  ADD COLUMN IF NOT EXISTS unique_trade_id   TEXT,
  ADD COLUMN IF NOT EXISTS is_verified       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verification_method TEXT,
  ADD COLUMN IF NOT EXISTS screenshot_url    TEXT,
  ADD COLUMN IF NOT EXISTS emotion           TEXT,
  ADD COLUMN IF NOT EXISTS strategy_id       UUID,
  ADD COLUMN IF NOT EXISTS news_event        TEXT;

-- ── 3. Unique index for CSV deduplication (upsert onConflict target) ─────────
CREATE UNIQUE INDEX IF NOT EXISTS trades_user_unique_trade_id_idx
  ON trades (user_id, unique_trade_id)
  WHERE unique_trade_id IS NOT NULL;

-- ── 4. csv_imported flag on user_profiles ────────────────────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS csv_imported BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 5. trading_accounts table (create if missing, add columns if not) ────────
CREATE TABLE IF NOT EXISTS trading_accounts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_signature   TEXT        NOT NULL,
  account_login       TEXT,
  account_server      TEXT,
  account_label       TEXT,
  broker_name         TEXT,
  sync_method         TEXT,
  sync_status         TEXT        DEFAULT 'connected',
  last_synced_at      TIMESTAMPTZ DEFAULT NOW(),
  account_currency    TEXT        DEFAULT 'USD',
  account_type        TEXT        DEFAULT 'real',
  is_cent             BOOLEAN     DEFAULT FALSE,
  is_verified         BOOLEAN     DEFAULT FALSE,
  verification_status TEXT        DEFAULT 'inferred',
  sync_error          TEXT,
  current_balance     NUMERIC,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, account_signature)
);

-- In case the table exists but is missing newer columns:
ALTER TABLE trading_accounts
  ADD COLUMN IF NOT EXISTS account_login       TEXT,
  ADD COLUMN IF NOT EXISTS broker_name         TEXT,
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'inferred',
  ADD COLUMN IF NOT EXISTS sync_error          TEXT,
  ADD COLUMN IF NOT EXISTS current_balance     NUMERIC;

-- ── 6. RLS on trading_accounts ────────────────────────────────────────────────
ALTER TABLE trading_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own trading accounts" ON trading_accounts;
CREATE POLICY "users manage own trading accounts" ON trading_accounts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
