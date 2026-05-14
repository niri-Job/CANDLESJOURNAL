-- Add target_user_id to notifications so the EA can send per-user trade sync alerts.
-- NULL target_user_id = broadcast to all users (existing admin notifications).
-- Non-null = shown only to that user.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS target_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Replace the read policy so users only see broadcasts + their own notifications
DROP POLICY IF EXISTS "notifications_read" ON public.notifications;
CREATE POLICY "notifications_read" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    is_active = true
    AND (target_user_id IS NULL OR target_user_id = auth.uid())
  );
