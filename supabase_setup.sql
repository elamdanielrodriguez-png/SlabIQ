-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)

CREATE TABLE IF NOT EXISTS user_plans (
  id            UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  plan          TEXT NOT NULL DEFAULT 'free',
  grades_used   INTEGER NOT NULL DEFAULT 0,
  grade_limit   INTEGER NOT NULL DEFAULT 2,
  period_start  TIMESTAMPTZ DEFAULT NOW(),
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  model         TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own plan" ON user_plans
  FOR SELECT USING (auth.uid() = id);

-- ── Price alerts (no auth required — anyone can subscribe via email) ──────────
CREATE TABLE IF NOT EXISTS price_alerts (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email             TEXT NOT NULL,
  player            TEXT NOT NULL,
  year              TEXT,
  set_name          TEXT,
  variant           TEXT,
  card_number       TEXT,
  grade_tier        TEXT NOT NULL,      -- 'raw', 'psa9', 'psa10', 'bgs9_5', etc.
  direction         TEXT NOT NULL,      -- 'below' or 'above'
  threshold_type    TEXT NOT NULL DEFAULT 'price', -- 'price' or 'percent'
  threshold_price   INTEGER,            -- USD — used when threshold_type = 'price'
  threshold_percent INTEGER,            -- 1-999 — used when threshold_type = 'percent'
  baseline_price    INTEGER,            -- price at creation time — used for percent alerts
  last_price        INTEGER,
  unsubscribe_token TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  last_checked_at   TIMESTAMPTZ,
  last_notified_at  TIMESTAMPTZ
);

ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS price_alerts_active ON price_alerts (is_active, last_checked_at);

-- ── If you already created price_alerts and need to add the new columns ───────
-- Run these separately if the table already exists:
--
-- ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS threshold_type TEXT NOT NULL DEFAULT 'price';
-- ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS threshold_percent INTEGER;
-- ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS baseline_price INTEGER;
-- ALTER TABLE price_alerts ALTER COLUMN threshold_price DROP NOT NULL;
