-- Persist wallet voucher claims in the same transaction as payment and order.
CREATE TABLE IF NOT EXISTS orders.wallet_voucher_claim_outbox (
  order_id uuid PRIMARY KEY,
  customer_id varchar NOT NULL,
  voucher_code varchar(50) NOT NULL,
  discount_amount numeric(15,2) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS wallet_voucher_claim_pending
ON orders.wallet_voucher_claim_outbox (next_attempt_at)
WHERE status = 'PENDING';
