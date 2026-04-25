-- Add mt5_deal_id to trades for MT5 deduplication
-- Run this in: Supabase Dashboard → SQL Editor → New query

ALTER TABLE trades
ADD COLUMN IF NOT EXISTS mt5_deal_id TEXT;

-- Partial unique index: only enforces uniqueness when mt5_deal_id is set.
-- Manual trades (mt5_deal_id = NULL) are never affected.
CREATE UNIQUE INDEX IF NOT EXISTS trades_mt5_deal_id_unique
ON trades(user_id, mt5_deal_id)
WHERE mt5_deal_id IS NOT NULL;
