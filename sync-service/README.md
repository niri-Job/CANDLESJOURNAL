# CandlesJournal Sync Service — Ubuntu Setup

Polls MetaAPI every 5 minutes for closed MT5/MT4 trades and inserts them into Supabase. Runs as a systemd service so it auto-restarts on crash or reboot.

## Prerequisites

- Ubuntu 20.04+ VPS (any cloud provider — DigitalOcean, Hetzner, AWS, etc.)
- Python 3.10+
- A MetaAPI account: https://app.metaapi.cloud (free tier = 1 account; paid for multi-user)

## 1. Copy files to the VPS

```bash
sudo mkdir -p /opt/candlesjournal/sync-service
sudo chown ubuntu:ubuntu /opt/candlesjournal/sync-service
scp sync-service/* ubuntu@YOUR_VPS_IP:/opt/candlesjournal/sync-service/
```

## 2. Install dependencies

```bash
cd /opt/candlesjournal/sync-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## 3. Configure environment

```bash
cp .env.example .env
nano .env   # fill in all values
```

Required values:
- `SUPABASE_URL` — from Supabase dashboard → Settings → API
- `SUPABASE_SERVICE_KEY` — service_role key from same page
- `ENCRYPTION_KEY` — must exactly match `ENCRYPTION_KEY` in your Next.js `.env.local`
- `METAAPI_TOKEN` — from https://app.metaapi.cloud/token

## 4. Run the Supabase migration

In the Supabase SQL editor, run:

```sql
-- supabase/migrations/20260509_metaapi_account_id.sql
ALTER TABLE public.trading_accounts
  ADD COLUMN IF NOT EXISTS metaapi_account_id text;
```

Also run `20260509_sync_health.sql` if you haven't already.

## 5. Test manually

```bash
cd /opt/candlesjournal/sync-service
source venv/bin/activate
python mt5_sync.py
```

You should see log lines like:
```
2026-01-01 12:00:00 [INFO] CandlesJournal MetaAPI Sync Service v2.0.0 starting
2026-01-01 12:00:00 [INFO] Processing 1 Quick Connect account(s)
2026-01-01 12:00:00 [INFO] Account 12345_BrokerServer (login 12345 @ BrokerServer)
2026-01-01 12:00:01 [INFO]   12345_BrokerServer — provisioned abc123, deploying (takes ~30s)…
```

Press Ctrl+C to stop. On the second run (after MetaAPI deploys the account) it will start fetching history.

## 6. Install as a systemd service

```bash
sudo cp mt5_sync.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable cj-sync
sudo systemctl start cj-sync
```

Check status:
```bash
sudo systemctl status cj-sync
sudo journalctl -u cj-sync -f   # live logs
```

## MetaAPI plan notes

- **Free tier**: 1 MetaAPI account total (1 user with 1 broker account)
- **Paid plans**: needed for multiple users or accounts — check https://metaapi.cloud/pricing

## Troubleshooting

**`DEAL_ENTRY_OUT` deals not appearing:**
Check that `METAAPI_CLIENT_URL` matches the region MetaAPI assigned your account. The correct URL is shown in your MetaAPI dashboard under Account → API access.

**`MetaAPI account is in ERROR state`:**
Log into https://app.metaapi.cloud, open the account, and check the error details. Usually means wrong credentials or broker server name.

**`get_deals failed`:**
The account may not be DEPLOYED yet. Wait one more cycle (5 min) and check logs.

**Recovering missing trades:**
Reset `last_synced_at` to a date before the missing trades in Supabase:
```sql
UPDATE trading_accounts
SET last_synced_at = '2026-01-01 00:00:00+00'
WHERE account_signature = 'YOUR_SIGNATURE';
```
The safety buffer (`SYNC_SAFETY_HOURS = 2`) and `mt5_deal_id` deduplication make this safe.
