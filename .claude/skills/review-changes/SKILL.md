---
name: review-changes
description: Tự review git diff trước khi báo xong - đúng logic, ca biên, có test, không lộ secret, không lan phạm vi, giữ bất biến AI. Review changes, code review, check diff, self-review before done. Dùng ở cuối mọi task sửa code.
---

# Review thay đổi (chỉ đọc git)

## 1. Thu thập
- `git status --short`, `git diff --stat`, `git diff` (và `git diff --cached` nếu có staged). Chỉ lệnh đọc.
- File mới chưa track: đọc trực tiếp. Phân biệt thay đổi của phiên này với thay đổi có sẵn của người dùng — chỉ review phần của mình,
  phần của người dùng chỉ ghi chú nếu thấy rủi ro.

## 2. Checklist chung
- [ ] **Đúng logic**: thay đổi làm đúng yêu cầu; không còn code chết/debug print/TODO tạm.
- [ ] **Ca biên**: rỗng/None, số lượng 0 hoặc âm, món hết hàng, chi nhánh đóng cửa, voucher hết hạn, lượt lặp, tiếng Việt có/không dấu.
- [ ] **Có test**: mỗi hành vi mới/lỗi đã sửa có test; test fail được nếu bỏ phần sửa.
- [ ] **Không lộ secret**: không key/token/mật khẩu trong code, log, test, fixture; không đọc `.env`.
- [ ] **Không lan phạm vi**: không refactor/đổi tên/định dạng lại file ngoài yêu cầu; diff không chứa file không liên quan.
- [ ] **Legacy**: không đụng phần chỉ-legacy (`run_order_flow`, `llm_tool_orchestrator.py`, nhánh `semantic_legacy`) trừ khi người dùng
  đã đồng ý. Nếu có sửa helper legacy mà Hybrid gọi: đủ 4 điều kiện trong `ai-chatbot.md` và đã ghi vào "Quyết định đã tự đưa ra".
- [ ] **Hợp đồng**: đổi payload API/chat → client web/mobile và `contracts/` vẫn khớp.
- [ ] **NestJS/DB**: không đổi entity/migration/schema mà chưa hỏi.

## 3. Checklist bất biến AI (khi diff chạm `services/ai-service/`)
Theo `.claude/rules/ai-chatbot.md`:
- [ ] LLM không có thêm quyền giao dịch; giá/tồn/giỏ/voucher/thanh toán/quyền ghi vẫn do server quyết.
- [ ] Tham chiếu ("#1", "món đó", "đơn đó") vẫn grounding từ snapshot đóng băng đầu lượt.
- [ ] Xác nhận hai lượt còn nguyên; xác nhận cũ/thiếu tóm tắt bị từ chối.
- [ ] `client_message_id` / `action_id` (idempotency) không bị bỏ hay đổi nghĩa.
- [ ] Không thêm intent/câu prompt mới khi chưa có test hồi quy.
- [ ] Test mới cho production bật hybrid (fixture `hybrid`), không chạy nhầm nhánh `semantic_legacy`.

## 4. Review độc lập
Thay đổi lớn (≳ 200 dòng, > 5 file, hoặc chạm điều phối/checkout/thanh toán/auth) → giao subagent **`code-reviewer`**
(ngữ cảnh mới, chỉ đọc) với: mục tiêu thay đổi, danh sách file, các bất biến cần kiểm. Xem xét từng phát hiện, không nhận mù quáng.

## 5. Sửa và đầu ra
- Sửa các vấn đề xác thực được; chạy lại `verify-changes` cho phần đã sửa.
- Báo cáo: **Vấn đề đã sửa** (file:dòng, mô tả) · **Rủi ro còn lại** (vì sao chưa sửa, mức độ) · kết quả test sau sửa.
