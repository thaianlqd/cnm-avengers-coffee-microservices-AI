-- Durable business-key dedupe for post-commit order loyalty awards.
CREATE TABLE IF NOT EXISTS identity.loyalty_order_award (
  order_id VARCHAR PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  base_points INTEGER NOT NULL,
  awarded_points INTEGER NOT NULL DEFAULT 0,
  tier_before VARCHAR(20),
  tier_after VARCHAR(20),
  reward_processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_order_award_user
  ON identity.loyalty_order_award (user_id, created_at DESC);
