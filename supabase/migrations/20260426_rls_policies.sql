-- ─── Row Level Security: CandlesJournal multi-tenant isolation ───────────────
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- Safe to run multiple times — all statements are idempotent.

-- ─── Enable RLS on all user-data tables ──────────────────────────────────────
ALTER TABLE trades              ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_analyses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE mt5_sync_tokens     ENABLE ROW LEVEL SECURITY;

-- ─── trades ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "trades: select own rows"  ON trades;
DROP POLICY IF EXISTS "trades: insert own rows"  ON trades;
DROP POLICY IF EXISTS "trades: update own rows"  ON trades;
DROP POLICY IF EXISTS "trades: delete own rows"  ON trades;

CREATE POLICY "trades: select own rows" ON trades
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "trades: insert own rows" ON trades
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "trades: update own rows" ON trades
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "trades: delete own rows" ON trades
  FOR DELETE USING (user_id = auth.uid());

-- ─── journal_analyses ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "analyses: select own rows" ON journal_analyses;
DROP POLICY IF EXISTS "analyses: insert own rows" ON journal_analyses;
DROP POLICY IF EXISTS "analyses: update own rows" ON journal_analyses;
DROP POLICY IF EXISTS "analyses: delete own rows" ON journal_analyses;

CREATE POLICY "analyses: select own rows" ON journal_analyses
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "analyses: insert own rows" ON journal_analyses
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "analyses: update own rows" ON journal_analyses
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "analyses: delete own rows" ON journal_analyses
  FOR DELETE USING (user_id = auth.uid());

-- ─── mt5_sync_tokens ─────────────────────────────────────────────────────────
-- Note: the MT5 sync API route uses the service_role key which bypasses RLS.
-- These policies only protect direct client-side access (Settings page).
DROP POLICY IF EXISTS "tokens: select own rows" ON mt5_sync_tokens;
DROP POLICY IF EXISTS "tokens: insert own rows" ON mt5_sync_tokens;
DROP POLICY IF EXISTS "tokens: update own rows" ON mt5_sync_tokens;
DROP POLICY IF EXISTS "tokens: delete own rows" ON mt5_sync_tokens;

CREATE POLICY "tokens: select own rows" ON mt5_sync_tokens
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "tokens: insert own rows" ON mt5_sync_tokens
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "tokens: update own rows" ON mt5_sync_tokens
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "tokens: delete own rows" ON mt5_sync_tokens
  FOR DELETE USING (user_id = auth.uid());
