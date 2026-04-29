-- Multi-account support: trading_accounts table + new trade columns

-- 1. Create trading_accounts table
CREATE TABLE IF NOT EXISTS trading_accounts (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_signature TEXT        NOT NULL,
  account_label     TEXT,
  broker_name       TEXT,
  account_login     TEXT,
  account_server    TEXT,
  account_currency  TEXT        NOT NULL DEFAULT 'USD',
  account_type      TEXT        NOT NULL DEFAULT 'real',
  is_cent           BOOLEAN     NOT NULL DEFAULT false,
  current_balance   NUMERIC(18,2),
  last_synced_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, account_signature)
);

-- 2. Row-level security
ALTER TABLE trading_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trading_accounts_select" ON trading_accounts
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "trading_accounts_insert" ON trading_accounts
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "trading_accounts_update" ON trading_accounts
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "trading_accounts_delete" ON trading_accounts
  FOR DELETE USING (user_id = auth.uid());

-- 3. New columns on trades table
ALTER TABLE trades ADD COLUMN IF NOT EXISTS account_signature TEXT;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS account_label     TEXT;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS normalized_pnl    NUMERIC(18,2);
