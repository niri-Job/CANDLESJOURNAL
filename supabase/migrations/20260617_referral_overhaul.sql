-- Referral system overhaul: simpler schema, NIRI-XXXX codes, ₦3,000 per referral
-- Run in: Supabase Dashboard → SQL Editor

-- Step 1: drop old complex referral tables (payouts, commissions, referrals)
DROP TABLE IF EXISTS payouts    CASCADE;
DROP TABLE IF EXISTS commissions CASCADE;
DROP TABLE IF EXISTS referrals  CASCADE;

-- Step 2: new simple referrals table
CREATE TABLE referrals (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid        NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  referred_user_id uuid        REFERENCES user_profiles(user_id) ON DELETE SET NULL,
  referred_email   text,
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'converted', 'paid')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  converted_at     timestamptz,
  paid_at          timestamptz,
  UNIQUE (referred_user_id)
);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referrals_referrer_select" ON referrals
  FOR SELECT USING (referrer_user_id = auth.uid());

-- Step 3: add referral_earnings to user_profiles (naira, integer)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS referral_earnings integer NOT NULL DEFAULT 0;

-- Step 4: replace trigger — new codes use NIRI-XXXX format (4 alphanumeric chars)
DROP TRIGGER IF EXISTS set_referral_code          ON user_profiles;
DROP TRIGGER IF EXISTS auto_referral_code         ON user_profiles;
DROP FUNCTION IF EXISTS generate_referral_code()  CASCADE;
DROP FUNCTION IF EXISTS auto_referral_code()      CASCADE;

CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  new_code text;
  chars    text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i        int;
BEGIN
  IF NEW.referral_code IS NOT NULL THEN
    RETURN NEW;
  END IF;
  LOOP
    new_code := 'NIRI-';
    FOR i IN 1..4 LOOP
      new_code := new_code || substr(chars, floor(random() * length(chars))::int + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM user_profiles WHERE referral_code = new_code);
  END LOOP;
  NEW.referral_code := new_code;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_referral_code
  BEFORE INSERT ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION generate_referral_code();

-- Step 5: backfill existing users whose codes are not in NIRI-XXXX format
DO $$
DECLARE
  rec      record;
  new_code text;
  chars    text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i        int;
BEGIN
  FOR rec IN
    SELECT user_id FROM user_profiles
    WHERE referral_code IS NULL OR referral_code NOT LIKE 'NIRI-%'
  LOOP
    LOOP
      new_code := 'NIRI-';
      FOR i IN 1..4 LOOP
        new_code := new_code || substr(chars, floor(random() * length(chars))::int + 1, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM user_profiles WHERE referral_code = new_code);
    END LOOP;
    UPDATE user_profiles SET referral_code = new_code WHERE user_id = rec.user_id;
  END LOOP;
END $$;
