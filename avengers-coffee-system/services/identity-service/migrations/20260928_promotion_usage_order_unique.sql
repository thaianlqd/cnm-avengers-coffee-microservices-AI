-- Reconcile existing duplicate order claims before applying this index.
CREATE UNIQUE INDEX IF NOT EXISTS promotion_usage_order_unique
ON identity.khuyen_mai_su_dung (ma_don_hang)
WHERE ma_don_hang IS NOT NULL;

-- New checkout claims use this table so Order Service PUBLIC vouchers do not
-- require a matching Identity promotion row or violate the legacy FK.
CREATE TABLE IF NOT EXISTS identity.order_voucher_claim (
  ma_don_hang uuid PRIMARY KEY,
  ma_khuyen_mai varchar(50) NOT NULL,
  ma_nguoi_dung varchar NOT NULL,
  so_tien_giam numeric(15,2) NOT NULL DEFAULT 0,
  ngay_su_dung timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_voucher_claim_user_code
ON identity.order_voucher_claim (ma_khuyen_mai, ma_nguoi_dung);
