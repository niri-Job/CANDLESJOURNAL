-- Sync service health / heartbeat table
-- The Python mt5_sync.py daemon upserts here on every cycle.
-- The web app reads this to detect when the service goes offline.

CREATE TABLE IF NOT EXISTS public.sync_service_health (
  service_name       text PRIMARY KEY,
  last_heartbeat     timestamptz NOT NULL DEFAULT now(),
  version            text,
  last_account_count int NOT NULL DEFAULT 0
);

-- No write policy — only service role (Python daemon) can write.
-- Authenticated users can read so the Next.js health endpoint can check status.
ALTER TABLE public.sync_service_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_sync_health"
  ON public.sync_service_health FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.sync_service_health IS
  'Heartbeat written by the mt5_sync.py daemon every cycle. Used by the web app to detect service downtime.';
