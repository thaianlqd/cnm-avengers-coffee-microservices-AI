-- Additive hardening for the checkout voucher claim outbox.
-- Apply after 20260928_wallet_voucher_claim_outbox.sql.
ALTER TABLE orders.wallet_voucher_claim_outbox
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS error_code varchar(50),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS dead_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_wallet_voucher_claim_outbox_retry
  ON orders.wallet_voucher_claim_outbox (status, next_attempt_at)
  WHERE status = 'PENDING';

CREATE UNIQUE INDEX IF NOT EXISTS customer_wallet_refund_reference_unique
  ON orders.customer_wallet_transaction (customer_id, reference_id)
  WHERE type = 'REFUND' AND reference_id IS NOT NULL;
