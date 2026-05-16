-- EA sync fix: ensure all columns and constraints exist for trade syncing.
-- Idempotent — safe to run multiple times.

-- ── trades: required columns ──────────────────────────────────────────────────
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS unique_trade_id     TEXT,
  ADD COLUMN IF NOT EXISTS is_verified         BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_method TEXT,
  ADD COLUMN IF NOT EXISTS mt5_deal_id         TEXT,
  ADD COLUMN IF NOT EXISTS asset_class         TEXT,
  ADD COLUMN IF NOT EXISTS session             TEXT,
  ADD COLUMN IF NOT EXISTS setup               TEXT,
  ADD COLUMN IF NOT EXISTS account_signature   TEXT;

-- ── trades: unique constraint for deduplication ───────────────────────────────
ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_unique_trade;
ALTER TABLE trades
  ADD CONSTRAINT trades_unique_trade
  UNIQUE (user_id, unique_trade_id);

-- ── trades: partial unique index on mt5_deal_id ───────────────────────────────
DROP INDEX IF EXISTS trades_mt5_deal_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS trades_mt5_deal_id_unique
  ON trades(user_id, mt5_deal_id)
  WHERE mt5_deal_id IS NOT NULL;

-- ── notifications: target_user_id for per-user trade alerts ──────────────────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS target_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "notifications_read" ON public.notifications;
CREATE POLICY "notifications_read" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    is_active = true
    AND (target_user_id IS NULL OR target_user_id = auth.uid())
  );
