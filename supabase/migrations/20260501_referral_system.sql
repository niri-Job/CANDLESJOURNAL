-- ════════════════════════════════════════════════════════════════
-- CandlesJournal — Referral & Affiliate System
-- Migration: 20260501_referral_system.sql
-- ════════════════════════════════════════════════════════════════

-- ── referrals ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code      TEXT        NOT NULL,
  status             TEXT        NOT NULL DEFAULT 'pending',
  -- pending | active | inactive | cancelled
  plan_type          TEXT,
  -- 'starter' | 'pro' (referred user's current plan)
  subscription_type  TEXT,
  -- 'monthly' | 'yearly'
  commission_rate    NUMERIC(10,2) NOT NULL DEFAULT 0.50,
  -- 0.50 for starter, 1.00 for pro
  joined_at          TIMESTAMPTZ DEFAULT NOW(),
  activated_at       TIMESTAMPTZ,
  last_payment_at    TIMESTAMPTZ,
  cancelled_at       TIMESTAMPTZ,
  referral_ip        TEXT,
  UNIQUE(referred_id)   -- one referrer per referred user
);

-- ── commissions ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commissions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_id     UUID        NOT NULL REFERENCES referrals(id)  ON DELETE CASCADE,
  amount          NUMERIC(10,2) NOT NULL,
  -- 0.50 (starter) or 1.00 (pro)
  plan_type       TEXT        NOT NULL,
  -- referred user's plan at time of commission
  month           TEXT        NOT NULL,
  -- 'YYYY-MM' e.g. '2026-05'
  status          TEXT        NOT NULL DEFAULT 'pending',
  -- pending | confirmed | paid | cancelled
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at    TIMESTAMPTZ,
  UNIQUE(referral_id, month)  -- one commission per referral per month
);

-- ── payouts ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payouts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount           NUMERIC(10,2) NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'pending',
  -- pending | processing | paid | failed
  payout_method    TEXT,
  -- 'bank_transfer' | 'paystack' | 'manual'
  payout_reference TEXT,
  account_details  JSONB,
  requested_at     TIMESTAMPTZ DEFAULT NOW(),
  paid_at          TIMESTAMPTZ,
  notes            TEXT
);

-- ── user_profiles additions ───────────────────────────────────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS referral_code      TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by        TEXT,
  ADD COLUMN IF NOT EXISTS referral_enabled   BOOLEAN        DEFAULT false,
  ADD COLUMN IF NOT EXISTS total_earnings     NUMERIC(10,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_earnings   NUMERIC(10,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_earnings      NUMERIC(10,2)  DEFAULT 0;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS referrals_referrer_idx  ON referrals  (referrer_id);
CREATE INDEX IF NOT EXISTS referrals_referred_idx  ON referrals  (referred_id);
CREATE INDEX IF NOT EXISTS referrals_code_idx      ON referrals  (referral_code);
CREATE INDEX IF NOT EXISTS commissions_referrer_idx ON commissions (referrer_id);
CREATE INDEX IF NOT EXISTS commissions_month_idx    ON commissions (month);
CREATE INDEX IF NOT EXISTS payouts_referrer_idx     ON payouts    (referrer_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE referrals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts     ENABLE ROW LEVEL SECURITY;

-- referrals: each user sees only their own referrals
CREATE POLICY "referrals_select_own"
  ON referrals FOR SELECT
  USING (referrer_id = auth.uid());

-- commissions: each user sees only their own commissions
CREATE POLICY "commissions_select_own"
  ON commissions FOR SELECT
  USING (referrer_id = auth.uid());

-- payouts: each user sees and creates only their own payouts
CREATE POLICY "payouts_select_own"
  ON payouts FOR SELECT
  USING (referrer_id = auth.uid());

CREATE POLICY "payouts_insert_own"
  ON payouts FOR INSERT
  WITH CHECK (referrer_id = auth.uid());

-- ── Helper: increment/decrement pending earnings on user_profiles ────────────
CREATE OR REPLACE FUNCTION increment_pending_earnings(p_user_id UUID, p_amount NUMERIC)
RETURNS VOID AS $$
BEGIN
  UPDATE user_profiles
     SET pending_earnings = COALESCE(pending_earnings, 0) + p_amount,
         total_earnings   = COALESCE(total_earnings, 0)   + p_amount
   WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_pending_earnings(p_user_id UUID, p_amount NUMERIC)
RETURNS VOID AS $$
BEGIN
  UPDATE user_profiles
     SET pending_earnings = GREATEST(0, COALESCE(pending_earnings, 0) - p_amount),
         total_earnings   = GREATEST(0, COALESCE(total_earnings, 0)   - p_amount)
   WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Helper: confirm stale pending commissions (older than 7 days) ─────────────
-- Call this from a cron job or manually
CREATE OR REPLACE FUNCTION confirm_stale_commissions()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE commissions
     SET status = 'confirmed', confirmed_at = NOW()
   WHERE status = 'pending'
     AND created_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
