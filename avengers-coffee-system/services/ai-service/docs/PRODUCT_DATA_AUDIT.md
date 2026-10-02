# Kiểm tra nguồn mô tả và đánh giá sản phẩm — 02/10/2026

## Mô tả

- Chatbot: `src/rag/data_ingestion.py` đọc `menu.san_pham.mo_ta`, gắn `entity_id` bằng `ma_san_pham`. `get_product_description` lọc canonical product ID, không lấy bình luận làm mô tả.
- Log lượt gợi ý matcha có `rag_evidence_count=0`; lời giới thiệu hương vị ở lượt đó chưa có nguồn mô tả. Đã sửa trình bày danh sách chỉ dùng tên/giá và mô tả đã tra cứu đúng ID. Khi trả lời mô tả, không chấp nhận đặc tính thêm ngoài nội dung nguồn chỉ vì có vài từ trùng.
- `apps/web-customer/src/pages/ProductDetail/index.jsx` trước đây thêm đoạn Highlands và các lời quảng cáo cho mọi sản phẩm sau `mo_ta`; còn có mô tả thay thế chứa Robusta/Arabica/sữa. Đã bỏ các đoạn này. Modal cũng bỏ mô tả thay thế. Cả hai chỉ hiện mô tả Menu hoặc báo chưa có mô tả.

## Đánh giá — chỉ kiểm tra, chưa sửa

Đã đọc `GET http://127.0.0.1:3000/products/116/reviews` trên ứng dụng đang chạy. Kết quả Cà Phê Muối Avenger:

| Chỉ số | Kết quả |
| --- | --- |
| Tổng đánh giá | 27 |
| Điểm trung bình | 3,9/5 |
| 5 sao | 9 |
| 4 sao | 11 |
| 3 sao | 4 |
| 2 sao | 2 |
| 1 sao | 1 |
| Không có mã đơn hàng | 0 |
| Bình luận chứa chữ seed | 0 |

Các số khớp ảnh người dùng. Tần suất bình luận: “Cà phê ngon, đóng gói đẹp, shipper nhiệt tình.” có 4 lượt; có 2 bình luận nói về trà vải, 2 nói về Freeze trà xanh và 2 nói về Freeze chocolate dù đây là cà phê muối.

Đường đọc dữ liệu:

1. Web `ProductDetail` và `ProductDetailModal` gọi API `/products/:id/reviews`.
2. `services/order-service/src/services/review.service.ts` đọc bảng `orders.danh_gia_san_pham`, tính số lượng và trung bình từ các dòng thật trong DB.
3. Chatbot `src/function_calling/tools/product_tools.py::execute_get_product_insights` cũng đọc bảng đó bằng `ma_san_pham`; lấy AVG/COUNT và tối đa hai bình luận mới nhất. Không tạo sao/bình luận ngẫu nhiên lúc trả lời.

**Dữ liệu từ DB thật không đồng nghĩa với phản hồi của khách thật.** Repo có `scripts/seed-behavior-data.ps1`, chèn trực tiếp đánh giá với sao ngẫu nhiên và bình luận `Seeded review for analytics test`; bản backup SQL cũng có dữ liệu này. API của riêng sản phẩm 116 không có nhãn seed đó, nên chưa thể quy toàn bộ 27 dòng cho script này. Mô hình review hiện không có trường nguồn/nhãn seed để phân biệt khách tự viết với dữ liệu nhập hoặc sinh thử nghiệm. Có mã đơn hàng cũng không chứng minh nguồn thật vì script seed tạo cả đơn hàng.

Kết luận: các số sao/lượt đánh giá được đọc từ dữ liệu lưu thật, không phải LLM tự bịa khi trả lời. Nội dung lặp và lệch món cho thấy cần kiểm tra nguồn nhập/seed của các dòng này; chưa đủ bằng chứng để khẳng định 27 dòng đều do khách thật viết hoặc đều là seed. Chưa thay đổi code đánh giá, API, bảng DB, số sao hay bình luận theo yêu cầu người dùng.
