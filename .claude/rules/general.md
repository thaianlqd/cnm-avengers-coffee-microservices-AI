# Quy tắc chung (áp dụng mọi nơi)

- Luôn trả lời và viết báo cáo bằng **tiếng Việt** (giữ nguyên tên file, lệnh, định danh code).
- **Git**: chỉ đọc (`status`, `diff`, `log`, `show`). Không `commit`, `push`, `reset`, `stash`, `clean`, `rebase`, `restore`,
  `checkout -- <file>`. Người dùng tự commit; chỉ được *đề xuất* commit message.
- Người dùng có thể đang có thay đổi chưa commit: **không hoàn tác, ghi đè hay "dọn" thứ không do chính bạn tạo** trong phiên này.
  Trước khi sửa một file, xem `git diff <file>` để biết phần nào là của người dùng.
- **Secret**: không đọc, in, grep hay copy `.env`, `data-platform/.env`, `apps/*/.env`, khoá `.pem/.key/.keystore`.
  Không chạy `docker compose config` hay `docker inspect <container>` mà không lọc biến `*KEY*/*SECRET*/*PASSWORD*/*TOKEN*`
  (chúng in secret đã nội suy). Khi cần biết biến môi trường nào tồn tại, đọc `.env.example`.
- **Không lệnh phá hủy**: `rm -rf`, `docker compose down -v`, `docker volume rm/prune`, `docker system prune`, DROP/TRUNCATE DB thật.
  Dữ liệu demo nằm trong volume `avengers_pgdata`, `avengers_analytics_data`… — mất là mất.
- **Docs của người dùng**: không di chuyển/xoá/đổi tên file `.md` ở root, `docs/`, `data-platform/*.md`, `ai-service/docs/`.
  Nếu thấy nên gom lại, chỉ *đề xuất* danh sách nên archive trong báo cáo.
- **File lớn**: không đọc nguyên file khi không cần — `order_flow_graph.py` (~4.700 dòng), `tool_policy.py` (~2.800),
  `agent_service.py` (~2.200), `main.py` (~2.000), các `*_REPORT.md`/JSON đánh giá. Dùng `grep -n` rồi đọc đoạn bằng offset/limit.
- **Test mặc định offline**: không có key LLM, không mạng ra ngoài. ai-service: `.claude/scripts/test-ai-offline.sh`.
- Giữ phạm vi: chỉ sửa đúng thứ được yêu cầu; refactor/dọn dẹp ngoài phạm vi thì ghi vào "đề xuất", không tự làm.
- Báo cáo trung thực: test fail thì dán output; bước nào bỏ qua thì nói rõ; chỗ chưa kiểm chứng thì đánh dấu "chưa kiểm chứng".
