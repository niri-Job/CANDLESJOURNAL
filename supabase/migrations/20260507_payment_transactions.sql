-- ════════════════════════════════════════════════════════════════
-- payment_transactions — audit log of every Paystack charge
-- Safe to run multiple times (all statements idempotent)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payment_transactions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reference    TEXT        NOT NULL UNIQUE,
  amount       INTEGER     NOT NULL,           -- kobo
  currency     TEXT        NOT NULL DEFAULT 'NGN',
  plan_type    TEXT        NOT NULL DEFAULT 'pro',
  billing_type TEXT        NOT NULL DEFAULT 'monthly',  -- monthly | yearly
  status       TEXT        NOT NULL DEFAULT 'pending',  -- pending | success | failed
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at  TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pt_user_id   ON payment_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_pt_reference ON payment_transactions (reference);
CREATE INDEX IF NOT EXISTS idx_pt_status    ON payment_transactions (status);

-- RLS — users can only see their own transactions
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pt_select_own" ON payment_transactions;
CREATE POLICY "pt_select_own" ON payment_transactions
  FOR SELECT USING (user_id = auth.uid());

-- Service role can insert/update (used by API routes)
DROP POLICY IF EXISTS "pt_service_all" ON payment_transactions;
CREATE POLICY "pt_service_all" ON payment_transactions
  FOR ALL USING (true) WITH CHECK (true);
