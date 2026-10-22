---
name: verify-changes
description: Chọn đúng phạm vi test cho thay đổi hiện tại và so với baseline, đảm bảo không có lỗi mới. Verify changes, run tests, regression check, lint, typecheck, check nothing broke. Dùng sau khi sửa code, trước khi báo xong.
---

# Kiểm chứng thay đổi

## 1. Xác định phạm vi
`git status --short` + `git diff --stat` → nhóm file đã đổi theo phần. Chỉ tính file do phiên này sửa
(thay đổi có sẵn của người dùng vẫn được test, nhưng không phải trách nhiệm của bạn — ghi chú riêng).

## 2. Lệnh theo phạm vi (chỉ dùng lệnh thật, chạy offline)
| Đổi ở | Chạy |
|---|---|
| `services/ai-service/**` | `.claude/scripts/test-ai-offline.sh tests -q` (toàn bộ, ~40s). Trong lúc sửa: `... tests -q -k hybrid` hoặc file cụ thể |
| `contracts/*.json` | ai-service toàn bộ **và** test `customer-mobile`, `web-admin` liên quan |
| `data-platform/analytics-api/**` | `docker compose -f docker-compose.data.yml exec -T analytics-api python -m tools.run_tests_v29` (baseline 810 test, 4 lỗi có sẵn) · eval `python -m evals.semantic_eval_v30 --mode offline` |
| `data-platform/web-ui/**` | `npm run typecheck` · `node --test src/utils/*.test.mjs` · `npm run build` |
| `apps/customer-mobile`, `shipper-mobile` | `npm run lint` · `node --test tests/*.test.mjs` |
| `apps/admin-mobile`, `web-customer`, `web-shipper` | `npm run lint` (+ `npm run build` với web) |
| `apps/web-admin` | `npm run lint` · `npm test` · `npm run build` |
| NestJS `services/*-service`, `api-gateway/gateway-root` | `npm test` · `npm run build` · `npx eslint "src/**/*.ts"` (**không** `npm run lint` — có `--fix`) |

Không có lệnh cho phần nào? Ghi "chưa có lệnh test" — đừng bịa lệnh.

## 3. So với baseline
- ai-service baseline 2026-10-15: **5979 passed, 1 skipped, 0 failed**. Số pass giảm hoặc có fail/error mới = lỗi mới.
- Phần khác: dùng baseline đo đầu phiên (skill `execute-plan` bước 0); nếu chưa có, chạy trên trạng thái trước khi sửa
  bằng cách đọc kết quả — **không** `git stash` để đo.
- Báo dạng: `trước → sau` (pass/fail/skip), liệt kê test mới thêm, test fail kèm output.

## 4. Yêu cầu riêng cho logic AI (ai-service)
- Mọi thay đổi logic chatbot phải có/mở rộng **test hồi quy** trong `tests/` (bật hybrid bằng fixture `hybrid`).
- Hành trình chuẩn phải còn xanh: **hỏi món → chọn/cấu hình → giỏ → voucher → nhận hàng + thanh toán → tóm tắt → xác nhận**
  (`tests/test_hybrid_journeys.py`, `test_hybrid_order_checkout_followups.py`, `test_hybrid_commerce.py`).
  Nếu thay đổi chạm luồng này mà chưa có test bao phủ bước bị chạm → viết thêm.
- Kiểm checklist bất biến trong `.claude/rules/ai-chatbot.md`.

## 5. Test gọi LLM thật
Chỉ khi PLAN yêu cầu rõ. Trước khi chạy: nêu số lượt tối đa (vd ≤ 10), provider/model, ước tính chi phí; ghi lại trong báo cáo.
Không bao giờ dùng `--env-file .env` trong lệnh test offline.

## 6. E2E bằng docker compose
- `docker compose up -d --build <service>` rồi `docker compose logs <service> --since 5m`. Xem trạng thái: `docker compose ps`.
- Chat qua gateway/ai-service (port 8009 → 8000, health `GET /ai/health`).
- **Không** `docker compose down -v`, không xoá volume, không reseed DB thật nếu PLAN không yêu cầu.
- NestJS e2e chỉ với `NODE_ENV=test E2E_DB_SAFE=1 DB_SCHEMA=<service>_ci_*` (hàng rào `test-utils/e2e-db-safety.js`).

## Đầu ra
Bảng: phạm vi · lệnh · trước → sau · ghi chú. Kết luận một dòng: "không có lỗi mới" hoặc danh sách lỗi mới.
