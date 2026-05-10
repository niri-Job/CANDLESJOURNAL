-- EA token system — replaces the investor-password / MetaAPI Quick Connect approach.
-- One token per user, bound to one MT5 account number.
-- The NIRI EA sends this token on every sync; the server validates it server-side.

CREATE TABLE IF NOT EXISTS public.ea_tokens (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_number   text        NOT NULL,  -- MT5 account login (stored as text)
  broker_server    text        NOT NULL,  -- MT5 broker server name
  token            text        NOT NULL UNIQUE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_used_at     timestamptz,
  -- One MT5 account per NIRI user
  UNIQUE (user_id)
);

ALTER TABLE public.ea_tokens ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their own token (needed for download/settings page)
CREATE POLICY "user_read_own_ea_token"
  ON public.ea_tokens FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.ea_tokens IS
  'One row per user. Token issued during onboarding, embedded in the NIRI EA .set file. Server validates account_number on every sync.';

-- Fraud log — trades rejected because the EA account number did not match the token
CREATE TABLE IF NOT EXISTS public.fraud_attempts (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token              text        NOT NULL,
  claimed_account    text        NOT NULL,  -- account_number sent by the EA
  registered_account text        NOT NULL,  -- account_number in ea_tokens
  ip_address         text,
  user_agent         text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fraud_attempts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.fraud_attempts IS
  'Logs EA sync attempts where account_number in the request did not match the registered token.';
