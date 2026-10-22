---
name: execute-plan
description: Thực thi một file kế hoạch (PLAN) từ A-Z theo từng phase, tự chủ, tiết kiệm token (đọc plan theo đoạn, file tiến độ nhỏ để resume). Execute plan, implement PLAN.md, run tasks autonomously. Dùng khi người dùng gọi /execute-plan <đường dẫn PLAN>.
argument-hint: "<đường dẫn PLAN, vd docs/PLAN.md>"
disable-model-invocation: true
---

# Thực thi kế hoạch: $ARGUMENTS

Mục tiêu: chạy hết plan A-Z **không dừng giữa chừng**, với ngữ cảnh nhỏ nhất có thể. Tuân thủ `.claude/rules/token-budget.md`.

## 0. Khởi động (rẻ)
1. Không có đối số / file không tồn tại → hỏi đường dẫn, dừng.
2. File tiến độ: `<PLAN không đuôi>.progress.md` (cạnh PLAN). **Nếu đã có → đọc nó trước** và tiếp tục từ phase chưa DONE
   (không làm lại phase đã xong, không đọc lại các mục plan của phase đó).
3. **Không đọc nguyên PLAN.** Lập mục lục: `grep -nE "^#{1,3} |^[0-9]+\. |^P[0-9]+|PHASE" PLAN | head -150`.
   Đọc phần tóm tắt/ràng buộc đầu file (thường ≤ 150 dòng) + bảng phase. Ghi vào file progress:
   ràng buộc cứng (≤ 10 dòng), danh sách phase → dải dòng của từng phase trong PLAN, mục báo cáo cuối (số dòng).
4. `git status --short | head -40` và `git diff --stat | tail -3` — ghi nhận thay đổi có sẵn của người dùng; không hoàn tác.
5. Baseline: dùng số đã ghi trong `.claude/rules/*.md` / `CLAUDE.md`. **Không chạy full suite lúc đầu** trừ khi chưa có baseline.

## 1. Vòng lặp mỗi phase
1. Đọc **đúng dải dòng của phase đó** trong PLAN (`sed -n a,bp`). Mục plan khác chỉ đọc khi phase tham chiếu tới.
2. Tìm code bằng `grep -n`, đọc đoạn bằng offset/limit. Không đọc nguyên file lớn; không đọc lại file vừa sửa.
3. Lỗi/hành vi: viết test tái hiện trước (phải fail), rồi sửa. Thay đổi nhỏ nhất đạt tiêu chí.
4. Test **chỉ module bị ảnh hưởng**, output rút gọn:
   data-platform `.claude/scripts/dp-test.sh module tests.<m>` / `dp-test.sh web`; ai-service `test-ai-offline.sh tests/<file> -q 2>&1 | tail -15`.
5. Đỏ → sửa → chạy lại. Xanh → **cập nhật file progress** (≤ 6 dòng/phase: DONE, file đổi, test + kết quả, việc còn lại)
   → sang phase tiếp ngay, không hỏi.
6. Có thể gộp 2–3 phase nhỏ liên quan thành một vòng để đỡ chạy test lặp.

File progress là bộ nhớ dài hạn: nếu hội thoại bị nén (compact) hay mở phiên mới, chỉ cần đọc lại file này để chạy tiếp.

## 2. Khi nào hỏi người dùng (CHỈ những trường hợp này)
- Không thể hoàn tác (xoá dữ liệu, migration phá huỷ, thao tác git ghi).
- Đổi kiến trúc, API công khai, hoặc schema dữ liệu (`init-db`, `migrations`, entity NestJS).
- Tốn tiền (gọi LLM thật ngoài phạm vi PLAN). Bảo mật (auth, quyền, secret).
- Sửa phần chỉ-legacy của ai-service (xem `.claude/rules/ai-chatbot.md`).
- PLAN mơ hồ **và** cách hiểu khác nhau dẫn tới kết quả khác hẳn.

Gom câu hỏi hỏi một lần. Mọi trường hợp khác: tự chọn mặc định hợp lý, ghi vào progress mục "Quyết định đã tự đưa ra".

## 3. Điều kiện dừng
- **Xong**: mọi phase DONE, test liên quan xanh, không lỗi mới so với baseline.
- **Kẹt**: cùng một lỗi còn sau **3 hướng sửa khác nhau** → ghi vào progress, báo người dùng (đã thử gì, giả thuyết, cần gì).
  Không nới test cho xanh, không skip/xoá test.

## 4. Kết thúc (một lần)
0. **Triển khai để người dùng test được (bắt buộc, người dùng KHÔNG tự build):** build ở máy ≠ container đang chạy.
   Đổi `data-platform/web-ui` → `docker compose -f docker-compose.data.yml up -d --build web-ui` (tạo lại cả analytics-api;
   chỉ chạy khi không có test đang chạy). Đổi analytics-api → code được mount, uvicorn tự reload (kiểm `ps` healthy).
   Đổi ai-service/NestJS → `docker compose up -d --build <service>`. Sau đó **xác minh bản đang phục vụ**:
   `J=$(curl -s localhost:8501 | grep -o 'assets/[^"]*\.js' | head -1); curl -s localhost:8501/$J | grep -c "<chuỗi UI mới>"`
   (và chuỗi UI cũ phải = 0). Không được báo "build PASS" khi chưa làm bước này.
1. Kiểm chứng toàn phạm vi **một lần**, tuần tự: `dp-test.sh all` (data-platform) / `test-ai-offline.sh` (ai-service).
2. `git diff --check`; quét secret/debug chỉ trên dòng thêm:
   `git diff | grep -E "^\+" | grep -iE "AIza|sk-|gsk_|password\s*=|console\.log|print\(|breakpoint" | head`.
3. Tự review nhẹ: `git diff --stat`, chỉ mở diff của file rủi ro (auth, thanh toán, planner, provider). Không spawn agent review
   trừ khi người dùng yêu cầu. Không tự chạy `explain-system`.
4. **Kịch bản test thủ công cho người dùng** (ngắn, theo từng tab/màn hình đã đổi): mỗi ca = bước bấm/nhập cụ thể → kết quả đúng
   mong đợi → dấu hiệu sai. Ghi vào cuối file progress và đưa trong báo cáo cuối. Người dùng chỉ test, không build.
5. Rà lại PLAN so với code: mỗi mục "must/required" của PLAN phải có bằng chứng (test, grep, hoặc chuỗi UI); mục nào chưa làm thì nêu rõ.
6. Báo cáo cuối theo đúng mẫu PLAN yêu cầu (đọc đúng mục đó theo số dòng đã ghi), lấy số liệu từ file progress.

## Cấm
Không `git commit/push/reset/stash/clean/rebase/restore`. Không đọc `.env`. Không `docker compose down -v`.
Không mở rộng phạm vi ngoài PLAN — ý tưởng thêm ghi vào "Bước tiếp theo đề xuất".
