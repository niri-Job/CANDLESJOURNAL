ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS strategy_id UUID
  REFERENCES strategies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_trades_strategy_id
  ON trades(strategy_id);
