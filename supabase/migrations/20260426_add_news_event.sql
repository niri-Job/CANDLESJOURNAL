-- Add news_event column to trades table for tagging news-driven trades
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS news_event TEXT;
