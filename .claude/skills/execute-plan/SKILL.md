---
name: execute-plan
description: Thực thi một file kế hoạch (PLAN) từng task một, tự chủ, test xanh rồi mới sang task tiếp. Execute plan, implement PLAN.md, run tasks autonomously, work through a plan file. Dùng khi người dùng gọi /execute-plan <đường dẫn PLAN>.
argument-hint: "<đường dẫn PLAN, vd docs/PLAN.md>"
disable-model-invocation: true
---

# Thực thi kế hoạch: $ARGUMENTS

## 0. Chuẩn bị
1. Đọc toàn bộ file PLAN `$ARGUMENTS`. Nếu không có đối số hoặc file không tồn tại → hỏi đường dẫn, dừng.
2. Chạy `git status --short` và `git diff --stat` — ghi nhận thay đổi **có sẵn của người dùng**; không hoàn tác chúng.
3. Xác định phạm vi đụng tới (ai-service / data-platform / apps / NestJS). Rules tương ứng trong `.claude/rules/` sẽ áp dụng.
4. Nếu chưa có baseline cho phạm vi đó trong phiên này → chạy test liên quan một lần (xem skill `verify-changes`) và ghi lại
   số pass/fail/skip. Lỗi đã có từ trước **không** tính là lỗi mới.

## 1. Chia task
- Tách PLAN thành danh sách task nhỏ, có thứ tự, mỗi task có tiêu chí xong kiểm chứng được (test nào phải xanh).
- Theo dõi tiến độ bằng danh sách task (TodoWrite nếu có). Đánh dấu xong ngay khi xong, không gộp.

## 2. Vòng lặp mỗi task
1. Đọc đúng đoạn code liên quan (grep + offset/limit; không đọc nguyên file lớn).
2. Với lỗi/hành vi chatbot: viết test tái hiện **trước** (phải fail), rồi mới sửa.
3. Code thay đổi nhỏ nhất đạt tiêu chí.
4. Chạy test liên quan (file test của module + nhóm nhanh, vd `.claude/scripts/test-ai-offline.sh tests -q -k hybrid`).
5. Đỏ → sửa → chạy lại cho đến khi xanh. Xanh → sang task tiếp.

## 3. Khi nào hỏi người dùng (CHỈ những trường hợp này)
- Không thể hoàn tác (xoá dữ liệu, migration phá huỷ, thao tác git ghi).
- Đổi kiến trúc, API công khai (endpoint, payload chat/checkout), hoặc schema dữ liệu (`init-db`, `migrations`, entity NestJS).
- Tốn tiền (gọi LLM thật ngoài phạm vi PLAN, dịch vụ trả phí).
- Bảo mật (auth, quyền, secret, nới quyền ghi cho LLM).
- Sửa phần chỉ-legacy của ai-service (`run_order_flow`, `llm_tool_orchestrator.py`, nhánh `semantic_legacy`).
  Helper legacy mà Hybrid đang gọi thì được tự sửa nếu đủ 4 điều kiện trong `.claude/rules/ai-chatbot.md`.
- PLAN mơ hồ **và** cách hiểu khác nhau dẫn tới kết quả khác hẳn.

Gom các câu hỏi lại hỏi một lần. Mọi trường hợp khác: tự chọn mặc định hợp lý, ghi vào mục
**"Quyết định đã tự đưa ra"** (quyết định + lý do + cách đảo ngược) và chạy tiếp.

## 4. Điều kiện dừng
- **Xong**: mọi task hoàn thành và test liên quan xanh, không có lỗi mới so với baseline.
- **Kẹt**: cùng một lỗi vẫn còn sau **3 hướng sửa khác nhau** → dừng, báo:
  đã thử những gì (từng hướng + kết quả), giả thuyết hiện tại, cần gì từ người dùng.
  Không thử hướng thứ 4, không nới test cho xanh, không skip/xoá test.

## 5. Kết thúc
1. Chạy `verify-changes` cho toàn bộ phạm vi đã đụng.
2. Gọi skill `review-changes` (đọc diff, sửa vấn đề tìm được, chạy lại test nếu có sửa).
3. Gọi skill `explain-system` để cập nhật `docs/SYSTEM_OVERVIEW.md` và viết báo cáo cuối.

## Cấm
Không `git commit/push/reset/stash/clean/rebase/restore`. Không đọc `.env`. Không `docker compose down -v`.
Không mở rộng phạm vi ngoài PLAN — ý tưởng thêm ghi vào "Bước tiếp theo đề xuất".
