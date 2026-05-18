-- Enable copy trading for developer only
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_copy_trading_enabled BOOLEAN DEFAULT false;
UPDATE user_profiles SET is_copy_trading_enabled = true WHERE user_id = 'b9433d15-02e3-44ed-b66f-b4f51f22fac7';

-- Signal providers
CREATE TABLE IF NOT EXISTS signal_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  strategy TEXT,
  broker TEXT,
  broker_server TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  grade TEXT DEFAULT 'ungraded',
  win_rate DECIMAL DEFAULT 0,
  profit_factor DECIMAL DEFAULT 0,
  max_drawdown DECIMAL DEFAULT 0,
  total_trades INTEGER DEFAULT 0,
  total_subscribers INTEGER DEFAULT 0,
  monthly_fee INTEGER DEFAULT 0,
  account_balance DECIMAL DEFAULT 0,
  account_currency TEXT DEFAULT 'USD',
  leverage INTEGER DEFAULT 100,
  provider_token TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Provider signals
CREATE TABLE IF NOT EXISTS provider_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES signal_providers(id),
  ticket BIGINT,
  symbol TEXT,
  action TEXT,
  direction TEXT,
  lot_size DECIMAL,
  entry_price DECIMAL,
  stop_loss DECIMAL,
  take_profit DECIMAL,
  close_price DECIMAL,
  pnl DECIMAL,
  account_balance DECIMAL,
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Copy subscriptions
CREATE TABLE IF NOT EXISTS copy_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  provider_id UUID REFERENCES signal_providers(id),
  is_active BOOLEAN DEFAULT true,
  risk_mode TEXT DEFAULT 'proportional',
  fixed_lot DECIMAL DEFAULT 0.01,
  risk_percent DECIMAL DEFAULT 1.0,
  max_lot_size DECIMAL DEFAULT 0.10,
  max_daily_loss_percent DECIMAL DEFAULT 5.0,
  max_open_trades INTEGER DEFAULT 5,
  allowed_symbols TEXT[],
  mt5_login TEXT,
  mt5_investor_password TEXT,
  mt5_server TEXT,
  broker TEXT,
  vps_status TEXT DEFAULT 'pending',
  vps_ip TEXT,
  subscriber_balance DECIMAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Copied trades
CREATE TABLE IF NOT EXISTS copied_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES copy_subscriptions(id),
  signal_id UUID REFERENCES provider_signals(id),
  user_id UUID REFERENCES auth.users(id),
  ticket BIGINT,
  symbol TEXT,
  direction TEXT,
  lot_size DECIMAL,
  entry_price DECIMAL,
  close_price DECIMAL,
  pnl DECIMAL,
  status TEXT DEFAULT 'pending',
  skip_reason TEXT,
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies
ALTER TABLE signal_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE copy_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE copied_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "providers_public_read" ON signal_providers FOR SELECT USING (is_active = true);
CREATE POLICY "providers_own_write" ON signal_providers FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "signals_public_read" ON provider_signals FOR SELECT USING (true);
CREATE POLICY "subscriptions_own" ON copy_subscriptions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "copied_trades_own" ON copied_trades FOR ALL USING (auth.uid() = user_id);
