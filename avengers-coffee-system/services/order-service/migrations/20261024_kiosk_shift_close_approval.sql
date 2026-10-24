-- Staff close requests remain non-terminal until a kiosk administrator reviews them.
ALTER TABLE orders.kiosk_shift_session
  ADD COLUMN IF NOT EXISTS close_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS close_requested_by varchar(100),
  ADD COLUMN IF NOT EXISTS close_approved_by varchar(100),
  ADD COLUMN IF NOT EXISTS close_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS close_approval_note text;

CREATE INDEX IF NOT EXISTS kiosk_shift_session_close_pending_idx
  ON orders.kiosk_shift_session (session_scope, co_so_ma, trang_thai)
  WHERE trang_thai = 'CLOSE_PENDING';
