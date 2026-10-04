# Seed lại bình luận theo sản phẩm

Đọc Menu/tùy chọn và dòng đơn từ PostgreSQL Supabase qua cấu hình DB hiện có. Không dùng LLM hoặc key AI. Hồ sơ của từng sản phẩm nằm trong `product_profiles.tsv`: ID, tên chính xác, loại món, ba cảm nhận và hai điểm góp ý riêng. Khi đổi tên/thêm món, phải cập nhật hồ sơ trước khi chạy.

Chỉ thay các bình luận trùng **chính xác** danh sách câu seed cũ trong script. Không xóa dòng đánh giá, thêm đánh giá mới, thay sao, tác giả, mã đơn, thời gian, dữ liệu đơn hay mô tả Menu. Nội dung khác được giữ. Mọi bình luận sinh mới có nhãn **[Dữ liệu mẫu]**, là phản hồi mô phỏng cho demo, không phải lời khách tự viết.

Nội dung theo số sao: 5 sao tích cực, 4 sao có góp ý nhẹ, 3 sao cân nhắc, 1–2 sao phản ánh trải nghiệm không hài lòng. Không gán trà/đá cho bánh hoặc món nóng. Topping phải khớp cả lựa chọn trên dòng đơn và tên trong Menu; chỉ bỏ hậu tố giá như `(+10k)`, không đổi `Thạch Cà Phê` thành `Thạch Sương Sáo`. Không quy đổi phần trăm đá/đường cũ sang tùy chọn Menu mới bằng phỏng đoán.

## Chuẩn bị và áp dụng

Thực hiện từ thư mục gốc repo, với `ai-service` đang chạy và cấu hình đúng DB cần seed:

```sh
docker cp scripts/review-seed avengers_ai_service:/tmp/review-seed
docker compose exec -T ai-service python /tmp/review-seed/seed_product_reviews.py prepare --folder /tmp/review-plan
```

`prepare` chỉ đọc DB trong snapshot nhất quán, tạo `backup.json`, `plan.json` và `preview.md`. Backup chứa dữ liệu đánh giá gốc và cấu hình đơn; lưu trong thư mục riêng, không đưa lên Git. Copy ra máy **trước khi áp dụng**, để backup không mất khi tạo lại container:

```sh
mkdir -m 700 .review-seed-backups
docker cp avengers_ai_service:/tmp/review-plan .review-seed-backups/new-run
```

Rà `preview.md` rồi áp dụng đúng bản đã chuẩn bị:

```sh
docker compose exec -T ai-service python /tmp/review-seed/seed_product_reviews.py apply --folder /tmp/review-plan
```

Áp dụng trong một transaction. Catalog phải còn khớp snapshot, từng dòng phải còn đúng ID/sản phẩm/sao/bình luận cũ; nếu có thay đổi đồng thời, rollback toàn bộ. Script tái tạo kế hoạch từ backup để đối chiếu trước khi ghi. Chạy lại `prepare` sau khi seed không tạo bình luận lặp.

## Khôi phục

Nếu container đã được tạo lại, copy cả script và thư mục backup/plan từ máy vào container. Sau đó:

```sh
docker compose exec -T ai-service python /tmp/review-seed/seed_product_reviews.py restore --folder /tmp/review-plan
```

Khôi phục chỉ khi bình luận vẫn đúng nội dung sau seed và sao/sản phẩm không thay đổi. Nếu khách hoặc quản trị đã sửa một dòng, rollback toàn bộ để tránh ghi đè nội dung mới.

## Kiểm tra offline

```sh
avengers-coffee-system/services/ai-service/.venv/bin/python -m pytest -q scripts/review-seed/test_seed_product_reviews.py
```

Test chặn mạng, dùng dữ liệu giả; không kết nối Supabase hay LLM. Kiểm tra phạm vi thay thế, đa dạng nội dung, nhãn dữ liệu mẫu, topping hợp lệ, giữ sao, idempotence, recipe đổi và rollback khi có chỉnh sửa đồng thời.

## Kết quả lần seed 04/10/2026

Đã đọc đủ 118 sản phẩm của DB Supabase đang được ứng dụng sử dụng, rà tên/mô tả/tùy chọn và dòng đơn. Thay 3.004 bình luận thuộc 21 câu mẫu lặp bằng 3.004 bình luận khác nhau, đúng hồ sơ sản phẩm và cảm nhận phù hợp số sao. Một bình luận ngoài danh sách mẫu được giữ nguyên. Tổng vẫn là 3.005 đánh giá, bao phủ đủ 118 sản phẩm. Topping cũ không khớp Menu được bỏ khỏi lời bình luận, không sửa cấu hình đơn.

Sau commit, truy vấn đối chiếu từng dòng với backup xác nhận **mọi trường ngoài bình luận seed đều không đổi**. Công cụ `execute_get_product_insights` đọc được bình luận mới cho Americano Yuzu (4,6/5, 22 lượt), Latte Tiramisu (4,7/5, 28 lượt) và Bạc Xỉu (4,6/5, 29 lượt); không gửi yêu cầu inference. 20 kiểm tra offline đều qua. Không thay code chatbot, model, prompt hay giới hạn token.

Bản xem trước từng món: [preview.md](preview.md). Backup và kế hoạch đã áp dụng nằm tại `.review-seed-backups/20261004-v2/` ở thư mục gốc repo, quyền riêng tư và được loại khỏi Git. Bản `20261004/` là kế hoạch nháp, chưa áp dụng; chỉ dùng `20261004-v2/` để khôi phục lần này.
