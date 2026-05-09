-- Add MetaAPI cloud account ID to trading_accounts.
-- The sync daemon stores this ID after provisioning so it doesn't re-provision
-- on every cycle. NULL = not yet provisioned (daemon handles it next cycle).

ALTER TABLE public.trading_accounts
  ADD COLUMN IF NOT EXISTS metaapi_account_id text;

COMMENT ON COLUMN public.trading_accounts.metaapi_account_id IS
  'MetaAPI cloud account UUID, set by the sync daemon after provisioning. NULL = pending provisioning.';
