ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS niri_questions_today INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS niri_questions_date  DATE;
