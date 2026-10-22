---
name: explain-system
description: Tạo/cập nhật docs/SYSTEM_OVERVIEW.md đúng với code và viết báo cáo cuối bằng tiếng Việt kèm commit message đề xuất. Explain system, system overview, architecture summary, final report, handoff, write-up. Dùng ở cuối execute-plan hoặc khi người dùng muốn hiểu hệ thống.
---

# Giải thích hệ thống & báo cáo cuối

## 1. Cập nhật `docs/SYSTEM_OVERVIEW.md`
- Chưa có → tạo. Có rồi → chỉ sửa phần bị thay đổi ảnh hưởng; giữ nguyên phần người dùng viết.
- Ngắn (≤ ~150 dòng), **đúng với code hiện tại**: mỗi khẳng định dựa trên file đã đọc; trỏ `đường/dẫn.py` thay vì chép code.
- Chỗ chưa kiểm chứng → đánh dấu `(chưa kiểm chứng)`. Không chép nguyên các tài liệu lớn ở root.
- Bố cục gợi ý:
  1. Mục đích hệ thống (1 đoạn).
  2. Thành phần & cổng: NestJS services, api-gateway, ai-service (8009→8000), web (5174/5175), data-platform.
  3. Luồng chat đặt hàng: client → gateway → `main.py` → `run_agent` → `run_hybrid_turn` → interpreter → grounding → điều phối
     → tool nghiệp vụ → order-service; ranh giới "LLM chỉ hiểu ý".
  4. Luồng dữ liệu BI: DB app → data-sync/Kafka → MinIO/Spark → postgres-analytics → analytics-api → web-ui.
  5. Production vs legacy trong ai-service (và các helper legacy Hybrid còn dùng).
  6. Cách chạy & test (lệnh thật, baseline).
  7. Lịch sử thay đổi gần đây (1–3 dòng mỗi lần cập nhật, có ngày).

## 2. Báo cáo cuối (tiếng Việt, trong tin nhắn — không ghi vào file trừ khi được yêu cầu)
1. **Đã đổi gì**: danh sách file (link markdown) + một câu mỗi file.
2. **Các thành phần nối với nhau thế nào**: chỉ phần liên quan đến thay đổi, có thể dùng sơ đồ chữ ngắn.
3. **Cách chạy và test**: lệnh thật + kết quả `trước → sau` (pass/fail/skip).
4. **Quyết định đã tự đưa ra**: quyết định · lý do · cách đảo ngược.
5. **Rủi ro còn lại**: từ `review-changes`.
6. **Bước tiếp theo đề xuất**.
7. **Commit message ĐỀ XUẤT** (khối code, kiểu `feat(ai-service): ...` / `fix: ...`, thân ngắn gạch đầu dòng).
   Chỉ đề xuất — **không chạy `git commit`**, không `git add`.

## Nguyên tắc
- Không phóng đại: test không chạy thì nói không chạy; chỉ nói "xong" khi đã kiểm chứng.
- Nếu thấy tài liệu cũ mâu thuẫn với code, ghi vào báo cáo kèm danh sách *đề xuất archive* — không tự di chuyển/xoá docs.
