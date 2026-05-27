-- MT5 Direct Connect: non-sensitive connection status only
-- Passwords are NEVER stored here — they live encrypted on the VPS only

CREATE TABLE IF NOT EXISTS mt5_connections (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    mt5_login       text        NOT NULL,
    broker_server   text        NOT NULL,
    status          text        NOT NULL DEFAULT 'pending',
    last_synced_at  timestamptz,
    sync_error      text,
    account_name    text,
    account_currency text,
    account_balance numeric(18,2),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, mt5_login, broker_server)
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS mt5_connections_updated_at ON mt5_connections;
CREATE TRIGGER mt5_connections_updated_at
    BEFORE UPDATE ON mt5_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE mt5_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own connections"
    ON mt5_connections FOR SELECT
    USING (auth.uid() = user_id);

-- Service role (VPS) can insert/update via service role key (bypasses RLS)
-- Users cannot insert/update/delete directly — all writes go through the VPS API

-- Status index
CREATE INDEX IF NOT EXISTS idx_mt5_connections_user_id ON mt5_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_mt5_connections_status  ON mt5_connections(status);
