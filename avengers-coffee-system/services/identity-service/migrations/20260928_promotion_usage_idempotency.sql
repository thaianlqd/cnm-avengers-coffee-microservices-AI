-- Apply after deduplicating any pre-existing duplicate order usage rows.
-- This is the remote counterpart of order-service checkout_outbox: the same
-- order/voucher/user can be delivered repeatedly but is recorded once.
CREATE UNIQUE INDEX IF NOT EXISTS uq_khuyen_mai_su_dung_order_once
  ON identity.khuyen_mai_su_dung (ma_khuyen_mai, ma_nguoi_dung, ma_don_hang)
  WHERE ma_don_hang IS NOT NULL;
