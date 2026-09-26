-- Apply after 20260928_checkout_outbox.sql. A committed strict checkout
-- reserves its per-user voucher allowance until Identity confirms the usage.
CREATE TABLE IF NOT EXISTS orders.checkout_voucher_claim (
  order_id VARCHAR NOT NULL,
  user_id VARCHAR NOT NULL,
  voucher_code VARCHAR(50) NOT NULL,
  reconciled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (order_id, user_id, voucher_code)
);
CREATE INDEX IF NOT EXISTS idx_checkout_voucher_claim_pending_user
  ON orders.checkout_voucher_claim (user_id, voucher_code)
  WHERE reconciled_at IS NULL;

-- A strict wallet payment uses the quote's stable reference. This protects
-- against accidental duplicate debit records outside the checkout operation.
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_wallet_payment_reference
  ON orders.customer_wallet_transaction (reference_id)
  WHERE type = 'PAYMENT' AND reference_id IS NOT NULL;
