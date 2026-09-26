-- Strict Checkout V5. Apply after 20260926_cart_state_idempotency.sql.
-- This repository has no migration runner: apply with psql using the same
-- database credentials as Order Service before enabling checkout-quote.

BEGIN;

CREATE TABLE IF NOT EXISTS orders.checkout_quote (
  quote_id UUID PRIMARY KEY,
  action_id UUID NOT NULL UNIQUE,
  user_id VARCHAR NOT NULL,
  cart_id VARCHAR(200) NOT NULL,
  cart_version BIGINT NOT NULL,
  request JSONB NOT NULL,
  quote JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_checkout_quote_user_expiry
  ON orders.checkout_quote (user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS orders.checkout_operation (
  operation_id VARCHAR(200) PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  request_hash TEXT NOT NULL,
  result JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_checkout_operation_user_created
  ON orders.checkout_operation (user_id, created_at DESC);

COMMIT;
