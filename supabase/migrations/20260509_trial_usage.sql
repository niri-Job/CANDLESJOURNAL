-- Trial usage tracking table
-- One row per user. Counts are never reset — trial limits are one-time only.
-- Only service role can write (prevents client-side manipulation of counts).

CREATE TABLE IF NOT EXISTS public.trial_usage (
  user_id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ai_analyses         int NOT NULL DEFAULT 0 CHECK (ai_analyses >= 0),
  market_intelligence int NOT NULL DEFAULT 0 CHECK (market_intelligence >= 0),
  psychology_reports  int NOT NULL DEFAULT 0 CHECK (psychology_reports >= 0),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- RLS: users can read their own row (for displaying remaining credits in UI)
ALTER TABLE public.trial_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_trial_usage"
  ON public.trial_usage FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policy for authenticated users.
-- Service role bypasses RLS and is the only writer.

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trial_usage_set_updated_at ON public.trial_usage;
CREATE TRIGGER trial_usage_set_updated_at
  BEFORE UPDATE ON public.trial_usage
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.trial_usage IS
  'Tracks per-user AI feature consumption during the 3-day free trial. One-time limits, never reset.';
