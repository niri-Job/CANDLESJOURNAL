-- Allow multiple MT5 accounts per user in ea_tokens.
-- Previously a UNIQUE(user_id) constraint limited each user to one token total.
-- This replaces it with UNIQUE(user_id, account_number) so each account gets
-- its own token row while still preventing duplicate registrations of the same
-- account by the same user.

-- Drop the single-user constraint (idempotent via IF EXISTS)
ALTER TABLE ea_tokens
  DROP CONSTRAINT IF EXISTS ea_tokens_user_id_key;

-- Add the per-account constraint
ALTER TABLE ea_tokens
  DROP CONSTRAINT IF EXISTS ea_tokens_user_account_key;

ALTER TABLE ea_tokens
  ADD CONSTRAINT ea_tokens_user_account_key
  UNIQUE (user_id, account_number);
