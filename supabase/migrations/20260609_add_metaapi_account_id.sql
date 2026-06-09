ALTER TABLE trading_accounts
ADD COLUMN IF NOT EXISTS metaapi_account_id TEXT,
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
