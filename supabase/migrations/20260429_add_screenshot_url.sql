-- Add screenshot_url column to trades table for trade note screenshots
ALTER TABLE trades ADD COLUMN IF NOT EXISTS screenshot_url TEXT;

-- Ensure notes column exists (may already be present)
ALTER TABLE trades ADD COLUMN IF NOT EXISTS notes TEXT;
