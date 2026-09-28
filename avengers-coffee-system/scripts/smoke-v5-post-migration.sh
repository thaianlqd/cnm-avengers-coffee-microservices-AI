#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the target PostgreSQL connection string}"
: "${ORDER_BASE_URL:?Set ORDER_BASE_URL, for example the deployed Order Service base URL}"
: "${CUSTOMER_ID:?Set CUSTOMER_ID to an existing non-production-test customer chosen by the operator}"
: "${AUTH_TOKEN:?Set AUTH_TOKEN for that customer}"
: "${VOUCHER_CODE:?Set VOUCHER_CODE to an operator-selected active voucher}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
SELECT
  to_regclass('identity.order_voucher_claim') AS identity_claim_table,
  to_regclass('orders.wallet_voucher_claim_outbox') AS order_claim_outbox,
  to_regclass('identity.promotion_usage_order_unique') AS identity_order_unique,
  to_regclass('orders.customer_wallet_payment_reference_unique') AS wallet_payment_unique,
  to_regclass('orders.customer_wallet_refund_reference_unique') AS wallet_refund_unique;

SELECT order_id, status, attempts, next_attempt_at, last_error, error_code, updated_at, dead_at
FROM orders.wallet_voucher_claim_outbox
ORDER BY created_at DESC
LIMIT 1;

SELECT indexname
FROM pg_indexes
WHERE schemaname = 'orders'
  AND indexname IN ('idx_wallet_voucher_claim_outbox_retry', 'customer_wallet_refund_reference_unique');
SQL

cart_json="$(curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  "${ORDER_BASE_URL%/}/cart/${CUSTOMER_ID}")"

subtotal="$(printf '%s' "$cart_json" | node -e '
let body=""; process.stdin.on("data", chunk => body += chunk); process.stdin.on("end", () => {
  const cart = JSON.parse(body); const value = Number(cart.total_price ?? cart.totalAmount ?? 0);
  if (!Number.isFinite(value) || value <= 0) process.exit(2); process.stdout.write(String(value));
});')"

curl --fail-with-body --silent --show-error \
  -H 'Content-Type: application/json' \
  -d "$(node -e 'process.stdout.write(JSON.stringify({ma_voucher:process.argv[1],tong_tien:Number(process.argv[2]),user_id:process.argv[3]}))' "$VOUCHER_CODE" "$subtotal" "$CUSTOMER_ID")" \
  "${ORDER_BASE_URL%/}/vouchers/kiem-tra"

printf '\nPost-migration read-only smoke checks passed. No order or payment was created.\n'

cat <<'CHAT'

Manual real-chat smoke sequence (use a disposable test customer/cart):
1. "Cho tôi xem bánh và nước"
2. "Cho tôi nước số 3"
3. Chọn các option được hiển thị (hoặc nói rõ "theo mặc định").
4. "Cái bánh trung thu trong giỏ chỉnh cho tôi 2 cái"
5. "Tiếp tục"
6. Áp một voucher được hiển thị, hoặc "bỏ qua voucher".
7. "Tiếp tục đặt hàng"
8. "Lấy tại quán và thanh toán bằng ví"
9. "Tôi ở phường <khu vực test>"
10. Chọn một branch bằng số trong danh sách.
11. Kiểm tra strict final quote rồi xác nhận đúng một lần.
12. Gửi lại cùng câu xác nhận/client action id; kiểm tra chỉ có một order,
    một PAYMENT ledger và một lần trừ số dư.
CHAT
