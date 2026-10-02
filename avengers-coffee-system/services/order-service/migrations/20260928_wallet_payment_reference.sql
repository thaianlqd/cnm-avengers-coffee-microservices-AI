-- Keep one successful wallet PAYMENT per customer/reference. REFUND and TOP_UP
-- may legitimately reuse the order reference and are intentionally excluded.
CREATE UNIQUE INDEX IF NOT EXISTS customer_wallet_payment_reference_unique
ON orders.customer_wallet_transaction (customer_id, reference_id)
WHERE type = 'PAYMENT' AND reference_id IS NOT NULL;
