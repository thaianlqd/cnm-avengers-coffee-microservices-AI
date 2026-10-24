-- Keep store POS sessions separate from franchise kiosk sessions.
-- Existing rows belong to the legacy franchise-kiosk flow.
ALTER TABLE orders.kiosk_shift_session
  ADD COLUMN IF NOT EXISTS session_scope varchar(24) NOT NULL DEFAULT 'FRANCHISE_KIOSK';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kiosk_shift_session_scope_check'
      AND conrelid = 'orders.kiosk_shift_session'::regclass
  ) THEN
    ALTER TABLE orders.kiosk_shift_session
      ADD CONSTRAINT kiosk_shift_session_scope_check
      CHECK (session_scope IN ('FRANCHISE_KIOSK', 'STORE_BRANCH'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS kiosk_shift_session_scope_active_idx
  ON orders.kiosk_shift_session (session_scope, co_so_ma, trang_thai);
