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
