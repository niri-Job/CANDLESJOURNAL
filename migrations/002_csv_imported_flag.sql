-- Add csv_imported flag to user_profiles
-- Tracks whether a free user has used their one-time CSV import
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS csv_imported BOOLEAN NOT NULL DEFAULT FALSE;
