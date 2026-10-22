-- Existing cards retain their existing validity. Newly purchased cards set
-- an explicit expiry in the application; NULL means no expiry on legacy cards.
ALTER TABLE orders.gift_cards ADD COLUMN IF NOT EXISTS expires_at timestamp NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customer_wallet_gift_card_reference_unique
ON orders.customer_wallet_transaction (reference_id)
WHERE type = 'GIFT_CARD' AND reference_id IS NOT NULL;

-- Review writers serialize on the order row. Add these indexes once any old
-- duplicate rows have been reconciled; no historical feedback is deleted here.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM orders.danh_gia_chi_nhanh WHERE ma_don_hang IS NOT NULL GROUP BY ma_don_hang HAVING COUNT(*) > 1) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS branch_review_order_once
      ON orders.danh_gia_chi_nhanh (ma_don_hang) WHERE ma_don_hang IS NOT NULL;
  ELSE
    RAISE NOTICE 'Historical duplicate branch reviews exist; application order locks still protect new submissions.';
  END IF;
END $$;
