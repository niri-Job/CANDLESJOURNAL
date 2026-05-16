-- Stores one Deriv API connection per user
CREATE TABLE deriv_connections (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_token        TEXT        NOT NULL,
  deriv_account_id TEXT,
  account_currency TEXT        DEFAULT 'USD',
  status           TEXT        NOT NULL DEFAULT 'connected',  -- 'connected' | 'error' | 'disconnected'
  last_synced_at   TIMESTAMPTZ,
  last_error       TEXT,
  total_synced     INTEGER     DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE deriv_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own deriv connection"
  ON deriv_connections FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
