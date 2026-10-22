---
paths:
  - "avengers-coffee-system/apps/**"
---

# Quy tắc mobile & web (avengers-coffee-system/apps)

## Stack (từ package.json, 2026-10-15)
| App | Stack | Lệnh kiểm tra có thật |
|---|---|---|
| `customer-mobile` | Expo ~54, RN 0.81, React 19, JS | `npm run lint`, `node --test tests/*.test.mjs` |
| `admin-mobile` | Expo ~54, RN 0.81, JS | `npm run lint` (chưa có test) |
| `shipper-mobile` | Expo ^57, RN 0.86, JS | `npm run lint`, `node --test tests/*.test.mjs` |
| `web-customer` | React 19 + Vite 7 + Tailwind | `npm run lint`, `npm run build` (+ `node tests-checkout-ui.mjs`, `tests-nearby-branches.mjs` — TODO: chưa kiểm chứng) |
| `web-admin` | React 19 + Vite 7 | `npm run lint`, `npm test`, `npm run build`, `npm run check:runtime` |
| `web-shipper`, `shipper-launcher` | React 18 + Vite 5 | `npm run build` (web-shipper có `npm run lint`) |
| `shared-ui` | file JS dùng chung (`JourneyOverlay.js`, `nativeBasemap.js`) | — |

- Không app nào dùng TypeScript → **không có typecheck**. Không có Jest/Vitest; test là `node:test` (`*.test.mjs`).
- Chạy lệnh trong đúng thư mục app. Bundle mobile kiểm tra bằng `npx expo export --platform all` (chậm, chỉ khi cần).

## Điểm cần cẩn thận
- **Hợp đồng chung với chatbot**: `web-customer/src/components/agentContract.js` được `customer-mobile/tests/agentConversation.test.mjs`
  import; `avengers-coffee-system/contracts/*.json` được test Python của ai-service đọc. Đổi payload chat (reply, checkout_payload,
  ui_payload, action_id) phải chạy test cả web, mobile **và** ai-service.
- UI chỉ hiển thị giá/giỏ/tổng tiền do server trả; không tự tính lại hay tin dữ liệu LLM.
- `customer-mobile/.env`, `shipper-mobile/.env`, `admin-mobile/.env` là secret → không đọc; dùng `.env.example`.
- `web-customer`, `web-admin` chạy Vite dev trong docker (port 5175/5174, hot-reload) — không cần rebuild image khi sửa `src/`.
- `customer-mobile/tests/chat-ui-offline.mjs` cần Playwright + bản export — TODO: chưa kiểm chứng cách chạy.
- Thư mục rác lạ trong `shipper-mobile/` (`Appending`, `Cloning`, `Close`…) — không phải của bạn, đừng xoá; chỉ báo lại.
