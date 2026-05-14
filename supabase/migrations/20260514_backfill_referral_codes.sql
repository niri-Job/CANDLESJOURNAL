-- Backfill referral_code for existing users who don't have one yet.
-- Uses first 8 hex chars of their UUID (no dashes) — unique per user by definition.
-- e.g. user_id = b9433d15-... → referral_code = 'B9433D15'

UPDATE user_profiles
SET referral_code = UPPER(REPLACE(SUBSTRING(user_id::TEXT, 1, 9), '-', ''))
WHERE referral_code IS NULL;

-- Ensure all users also have referral_enabled defaulted (in case column was added
-- after some rows were inserted without a default trigger).
UPDATE user_profiles
SET referral_enabled = false
WHERE referral_enabled IS NULL;
