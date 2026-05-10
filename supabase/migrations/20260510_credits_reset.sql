-- Track when ai_credits_used was last reset for Pro users (monthly reset)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS ai_credits_reset_at date;
