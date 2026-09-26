-- Apply after 20260927_checkout_safety.sql.  There is no migration runner:
-- psql "$DATABASE_URL" -f migrations/20260926_cart_state_idempotency.sql
-- psql "$DATABASE_URL" -f migrations/20260927_checkout_safety.sql
-- psql "$DATABASE_URL" -f migrations/20260928_checkout_outbox.sql
BEGIN;

CREATE TABLE IF NOT EXISTS orders.checkout_outbox (
  event_id UUID PRIMARY KEY,
  event_key VARCHAR(300) NOT NULL UNIQUE,
  event_type VARCHAR(80) NOT NULL,
  payload JSONB NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_checkout_outbox_pending
  ON orders.checkout_outbox (available_at, created_at)
  WHERE delivered_at IS NULL;

COMMIT;
