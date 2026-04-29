-- Add emotion column to trades for trade psychology tracking
ALTER TABLE trades ADD COLUMN IF NOT EXISTS emotion TEXT;
