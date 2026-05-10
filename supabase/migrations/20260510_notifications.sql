-- ── Notifications system ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text        NOT NULL,
  message    text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_active  boolean     NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.notification_reads (
  user_id         uuid REFERENCES auth.users(id)            ON DELETE CASCADE,
  notification_id uuid REFERENCES public.notifications(id)  ON DELETE CASCADE,
  read_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, notification_id)
);

-- RLS
ALTER TABLE public.notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reads  ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read active notifications
CREATE POLICY "notifications_read" ON public.notifications
  FOR SELECT TO authenticated USING (is_active = true);

-- Users manage their own read receipts
CREATE POLICY "notification_reads_select" ON public.notification_reads
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "notification_reads_insert" ON public.notification_reads
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Seed: MT5 upgrade notification shown to all users
INSERT INTO public.notifications (title, message) VALUES (
  'MT5 Connection Updated 🔄',
  E'We''ve upgraded from Quick Connect to MT5 EA sync for better reliability.\n\nIf you previously connected your MT5:\n\n1. Go to Settings → Connect MT5\n2. Remove your old connection\n3. Download the new NIRI EA files\n4. Install following the steps shown\n\nThis gives you automatic trade sync that works 24/7.'
);

-- ── Live accounts only policy ──────────────────────────────────────────────────
-- Nullify all demo trading accounts (demo support removed)
UPDATE public.trading_accounts
SET
  sync_status = 'disconnected',
  sync_error  = 'Demo accounts are no longer supported. Please reconnect using your live MT5 account.'
WHERE account_type = 'demo';
