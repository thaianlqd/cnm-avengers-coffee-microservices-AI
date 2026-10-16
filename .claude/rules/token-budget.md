# Tiết kiệm token (áp dụng mọi phiên)

Mỗi lượt gửi lại toàn bộ ngữ cảnh → ngữ cảnh càng dài, mỗi bước càng đắt. Giữ ngữ cảnh nhỏ:

- **Không đọc nguyên file > 300 dòng.** Dùng `grep -n` tìm vị trí, rồi đọc đoạn bằng `sed -n a,bp` / offset+limit.
  File PLAN dài: chỉ đọc mục lục (`grep -nE "^[0-9]+\. |^#"`) + đúng mục của phase đang làm.
- **Không đọc lại** file vừa đọc/vừa sửa; không `cat` file mình vừa Write.
- **Output lệnh luôn rút gọn**: test qua `.claude/scripts/dp-test.sh` (data-platform) hoặc
  `test-ai-offline.sh ... -q 2>&1 | tail -15` (ai-service). Log dài → ghi file rồi `grep`, không in cả log.
  `git diff` → dùng `--stat` trước; chỉ xem diff của file cần review.
- **Không spawn subagent** (Explore/code-reviewer/general-purpose) trừ khi người dùng yêu cầu — mỗi agent đọc lại từ đầu.
- **Gom lệnh độc lập** vào một lượt gọi tool song song; không chạy lại test đã xanh khi không đổi code liên quan.
- Full suite (~8 phút) chỉ chạy **một lần cuối**; giữa chừng chạy test module bị ảnh hưởng.
- Trả lời ngắn: kết quả + việc tiếp theo. Không tóm tắt lại những gì đã nói; không dán lại code đã viết.
- Tiến độ dài hạn ghi vào file progress nhỏ (xem skill `execute-plan`), không giữ trong hội thoại.
