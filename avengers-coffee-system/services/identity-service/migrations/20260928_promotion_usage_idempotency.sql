-- Apply after deduplicating any pre-existing duplicate order usage rows.
-- This is the remote counterpart of order-service checkout_outbox: the same
-- order/voucher/user can be delivered repeatedly but is recorded once.
CREATE UNIQUE INDEX IF NOT EXISTS uq_khuyen_mai_su_dung_order_once
  ON identity.khuyen_mai_su_dung (ma_khuyen_mai, ma_nguoi_dung, ma_don_hang)
  WHERE ma_don_hang IS NOT NULL;

-- Order Service owns PUBLIC voucher definitions. Their per-user usage is
-- recorded here without a foreign key to identity.khuyen_mai.
CREATE TABLE IF NOT EXISTS identity.external_voucher_usage (
  voucher_code VARCHAR(50) NOT NULL,
  user_id VARCHAR NOT NULL,
  order_id VARCHAR NOT NULL,
  discount_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (voucher_code, user_id, order_id)
);
CREATE INDEX IF NOT EXISTS idx_external_voucher_usage_user
  ON identity.external_voucher_usage (voucher_code, user_id);
