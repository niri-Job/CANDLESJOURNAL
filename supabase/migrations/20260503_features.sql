-- ═══════════════════════════════════════════════════════════════
-- FEATURES: Monthly/Yearly subscriptions, AI credits,
--           Strategy Library, subscription type tracking
-- ═══════════════════════════════════════════════════════════════

-- ── user_profiles: subscription type + AI credits ────────────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS subscription_type TEXT DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS ai_credits_used     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_credits_limit    INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS ai_credits_purchased INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_credits_reset_date TIMESTAMPTZ DEFAULT (now() + interval '30 days');

-- Set credit limits based on existing plan (safe if subscription_status not yet added)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'subscription_status'
  ) THEN
    UPDATE user_profiles
    SET ai_credits_limit = CASE
      WHEN subscription_status = 'pro'     THEN 90
      WHEN subscription_status = 'starter' THEN 30
      ELSE 3
    END;
  END IF;
END $$;

-- ── strategies table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS strategies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  asset_class   TEXT,
  timeframe     TEXT,
  session       TEXT,
  description   TEXT,
  entry_rules   TEXT[],
  exit_rules    TEXT[],
  sl_rules      TEXT,
  tp_rules      TEXT,
  screenshot_url TEXT,
  tags          TEXT[],
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for strategies
ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "strategies_select" ON strategies;
DROP POLICY IF EXISTS "strategies_insert" ON strategies;
DROP POLICY IF EXISTS "strategies_update" ON strategies;
DROP POLICY IF EXISTS "strategies_delete" ON strategies;

CREATE POLICY "strategies_select" ON strategies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "strategies_insert" ON strategies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "strategies_update" ON strategies FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "strategies_delete" ON strategies FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_strategies_user_id ON strategies(user_id);
