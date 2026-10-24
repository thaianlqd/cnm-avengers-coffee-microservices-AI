-- A submitted close report is a finished selling session, independent of review.
-- Backfill older pending reports so history keeps the original cutoff time.
UPDATE orders.kiosk_shift_session
SET thoi_gian_dong_ca = COALESCE(thoi_gian_dong_ca, close_requested_at, ngay_cap_nhat),
    dong_ca_boi = COALESCE(dong_ca_boi, close_requested_by, staff_username)
WHERE session_scope = 'FRANCHISE_KIOSK' AND trang_thai = 'CLOSE_PENDING';
