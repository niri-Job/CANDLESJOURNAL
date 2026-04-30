-- Investor / Quick Connect sync support

-- ── 1. Extend trading_accounts ─────────────────────────────────────────────
ALTER TABLE trading_accounts
  ADD COLUMN IF NOT EXISTS sync_method              TEXT        DEFAULT 'ea',
  ADD COLUMN IF NOT EXISTS investor_password_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS sync_status             TEXT        DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS sync_error              TEXT,
  ADD COLUMN IF NOT EXISTS platform                TEXT        DEFAULT 'MT5';

-- sync_method  : 'ea' | 'investor'
-- sync_status  : 'pending' | 'connected' | 'syncing' | 'failed' | 'disconnected'
-- platform     : 'MT4' | 'MT5'

-- ── 2. sync_logs table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_logs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  account_signature TEXT,
  sync_method      TEXT,
  status           TEXT,
  trades_synced    INTEGER     DEFAULT 0,
  error_message    TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. RLS on sync_logs ───────────────────────────────────────────────────
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own log rows
CREATE POLICY "sync_logs_select_own" ON sync_logs
  FOR SELECT USING (user_id = auth.uid());

-- Service role (used by the Python sync daemon) bypasses RLS entirely,
-- so no INSERT policy is needed for it.  The app-level connect route
-- uses the service role to write the initial log entry.

-- ── 4. Index for fast per-account log lookup ──────────────────────────────
CREATE INDEX IF NOT EXISTS sync_logs_user_sig_idx
  ON sync_logs (user_id, account_signature, created_at DESC);
