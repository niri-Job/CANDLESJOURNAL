-- ═══════════════════════════════════════════════════════════════
-- SYNC ARCHITECTURE UPGRADE + ACCOUNT LIMITS
-- ═══════════════════════════════════════════════════════════════

-- ── trading_accounts: verification + import tracking ─────────────────────────
ALTER TABLE trading_accounts
  ADD COLUMN IF NOT EXISTS verification_status  TEXT    DEFAULT 'unverified',
  -- values: 'verified_ea' | 'inferred' | 'unverified'
  ADD COLUMN IF NOT EXISTS verification_method  TEXT,
  -- values: 'EA' | 'server_name' | 'manual'
  ADD COLUMN IF NOT EXISTS is_verified          BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_trade_id        TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_trade_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_trades_imported  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS import_status        TEXT    DEFAULT 'pending';
  -- values: 'pending' | 'importing' | 'complete' | 'failed'

-- ── trades: deduplication + verification ─────────────────────────────────────
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS unique_trade_id    TEXT,
  ADD COLUMN IF NOT EXISTS is_verified        BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_method TEXT;

-- Unique constraint prevents duplicate trades per user
ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_unique_trade;
ALTER TABLE trades
  ADD CONSTRAINT trades_unique_trade
  UNIQUE (user_id, unique_trade_id);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_trades_unique_trade_id
  ON trades(user_id, unique_trade_id);
CREATE INDEX IF NOT EXISTS idx_trades_account_sig
  ON trades(account_signature);

-- ── user_profiles: per-plan account limits ───────────────────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS max_accounts INTEGER DEFAULT 1;

UPDATE user_profiles
SET max_accounts = CASE
  WHEN subscription_status = 'pro'     THEN 10
  WHEN subscription_status = 'starter' THEN 3
  ELSE 1
END;

-- ── Back-fill verification status for existing accounts ──────────────────────
-- EA accounts (sync_method = 'ea' or NULL) are trusted as verified
UPDATE trading_accounts
SET verification_status = 'verified_ea',
    is_verified         = true,
    verification_method = 'EA'
WHERE sync_method = 'ea' OR sync_method IS NULL;

-- Quick Connect accounts are inferred from server name
UPDATE trading_accounts
SET verification_status = 'inferred',
    verification_method = 'server_name'
WHERE sync_method = 'investor';
