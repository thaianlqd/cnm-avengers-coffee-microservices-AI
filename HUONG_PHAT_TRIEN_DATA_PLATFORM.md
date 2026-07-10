# Hướng Phát Triển 2: Xây Dựng Enterprise Data Platform & Real-time Analytics Pipeline (Modern Data Stack 7 Lớp)

Trong giai đoạn tiếp theo, nhóm có kế hoạch xây dựng một tầng **Data Platform chuyên biệt hoàn chỉnh** bên cạnh hệ thống vận hành hiện tại, được thiết kế chuẩn theo kiến trúc **Modern Data Stack gồm 7 lớp độc lập** — từ thu thập dữ liệu, xử lý real-time, lưu trữ Lakehouse, quản trị chất lượng, điều phối tự động đến trực quan hóa và phục vụ AI nâng cao. Đây là hướng đi chuẩn mực đang được các doanh nghiệp công nghệ hàng đầu như **Grab, Shopee, The Coffee House** áp dụng để tối ưu hóa vận hành toàn chuỗi dựa trên dữ liệu thực tế.

---

## 1. Kiến Trúc Tổng Thể 7 Lớp (Enterprise Modern Data Stack)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                                 LAYER 1 — DATA SOURCES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Microservices (NestJS)         Mobile App (React Native)        Shipper App (GPS)
   PostgreSQL (5 Schemas)         User Clickstream & Events        Real-time Delivery
             │                                │                            │
             └────────────────────────────────┼────────────────────────────┘
                                              ▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                          LAYER 2 — INGESTION & EVENT STREAMING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                      Apache Kafka (Central Event Streaming Hub)
     + Debezium CDC (Change Data Capture - Tự động bắt mọi thay đổi từ PostgreSQL WAL)
                                              │
                                              ▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                              LAYER 3 — PROCESSING & AI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                      Apache Spark (Distributed Compute Engine)
       • Spark Streaming: Xử lý real-time độ trễ < 5s (Alerting, Anomaly Detection)
       • Spark Batch: Tổng hợp hàng đêm, xây dựng Data Lakehouse
       • Spark MLlib ALS: Thuật toán gợi ý cá nhân hóa nâng cao
       • Feature Store (Feast): Quản lý & tái sử dụng đặc trưng cho các model AI
                                              │
                                              ▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                        LAYER 4 — STORAGE (DATA LAKEHOUSE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                        Delta Lake trên nền tảng MinIO / S3
       🟤 BRONZE LAYER : Dữ liệu thô (Raw Parquet) nguyên bản từ Kafka
       ⚪ SILVER LAYER : Dữ liệu đã làm sạch, chuẩn hóa và kết nối (Joined/Enriched)
       🟡 GOLD LAYER   : Dữ liệu tổng hợp nghiệp vụ sẵn sàng cho BI & AI
                                              │
                                              ▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                          LAYER 5 — HIGH-SPEED QUERY ENGINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                             Apache Trino (Query Engine)
   Truy vấn SQL phân tán siêu tốc trực tiếp trên hàng trăm triệu dòng Delta Lake (< 2s)
                                              │
                                              ▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                        LAYER 6 — ORCHESTRATION & GOVERNANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         • Apache Airflow: Điều phối tự động toàn bộ DAGs và chu trình ETL/ELT
         • Great Expectations: Kiểm soát tự động chất lượng dữ liệu (Data Quality)
         • MLflow: Quản lý vòng đời AI Model (Version control, Drift detection)
                                              │
                                              ▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                        LAYER 7 — VISUALIZATION & AI SERVING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         • Apache Superset: BI Dashboard chiến lược dành cho Ban Lãnh Đạo (CEO/C-Level)
         • Streamlit AI Analytics (:8501): Dashboard chuyên sâu theo dõi real-time & ML
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 2. Những Điểm Nâng Cấp Đột Phá So Với Bản Hiện Tại

### 2.1. Thêm Debezium CDC (Change Data Capture) — Đảm Bảo Zero Data Loss
- **Vấn đề khi không có CDC**: Phải tự viết code ứng dụng để bắn event vào Kafka mỗi khi có thay đổi DB, dễ gây lệch pha dữ liệu, bỏ sót thao tác sửa/xóa hoặc quá tải database.
- **Giải pháp với Debezium CDC**:
  - Đọc trực tiếp **WAL (Write-Ahead Log)** của PostgreSQL ở cấp độ database engine.
  - Tự động stream mọi lệnh `INSERT` / `UPDATE` / `DELETE` vào Kafka topic tương ứng với **0 dòng code bổ sung** tại application layer.
  - Đảm bảo tuyệt đối không bao giờ thất lạc sự kiện ngay cả khi network trục trặc hay server khởi động lại.

### 2.2. Thêm Apache Trino — SQL Query Siêu Tốc Trên Lakehouse
- **Tại sao cần Trino**: Delta Lake lưu trữ dữ liệu dưới dạng file Parquet phân tán trên MinIO/S3 — không thể query trực tiếp bằng SQL truyền thống một cách nhanh chóng.
- **Sức mạnh của Trino**:
  - Trino là Distributed SQL Engine cho phép viết câu lệnh SQL ANSI chuẩn chạy song song trên hàng trăm triệu dòng lịch sử chỉ trong **1–2 giây**.
  - Kết nối trực tiếp với Apache Superset và Streamlit mà không cần sao chép hay nạp ngược dữ liệu về database quan hệ.

### 2.3. AI Feature Store & MLflow Lifecycle Management
- **AI Feature Store (Feast)**:
  - Lưu trữ tập trung các đặc trưng (features) đã được tính toán như: LTV khách hàng, tần suất mua theo giờ, sở thích hương vị...
  - Chia sẻ chung cho các model **Recommendation (ALS)**, **Churn Prediction** (dự đoán rời bỏ) và **Demand Forecasting** (dự báo nhu cầu nguyên liệu), giảm thời gian huấn luyện từ hàng giờ xuống vài phút.
- **MLflow Model Registry**:
  - Theo dõi độ chính xác của model theo thời gian thực. Tự động cảnh báo khi phát hiện **Model Drift** (độ chính xác giảm do xu hướng thị trường thay đổi) và tự động kích hoạt pipeline huấn luyện lại trên Airflow.

### 2.4. Great Expectations — Tự Động Hóa Kiểm Soát Chất Lượng Dữ Liệu
- Dữ liệu sai lệch (giá âm, tọa độ GPS lỗi, thiếu mã khách hàng) sẽ dẫn đến kết quả AI sai lệch ("Garbage In, Garbage Out").
- **Great Expectations** tự động validate dữ liệu tại mỗi ranh giới tầng **Bronze → Silver → Gold**, chặn đứng dữ liệu lỗi và gửi cảnh báo tự động trước khi cập nhật lên báo cáo điều hành.

---

## 3. So Sánh Hiệu Quả Kỹ Thuật & Giá Trị Kinh Doanh

### 3.1. Giá Trị Kỹ Thuật
| Tiêu chí | Hệ thống thông thường (Chỉ DB) | Enterprise Data Platform (7 Lớp) |
|---|---|---|
| **Độ trễ dữ liệu** | Phụ thuộc batch query (chậm, dễ lock DB) | Real-time Streaming (< 5 giây) |
| **Độ tin cậy dữ liệu** | Dễ mất mát event khi tải cao | **Zero Data Loss** nhờ Debezium CDC + Kafka |
| **Khả năng mở rộng** | Bị giới hạn bởi dung lượng ổ cứng DB | **Vô hạn** trên nền tảng Object Storage (MinIO/S3) |
| **Truy vấn lịch sử lớn** | Quá tải PostgreSQL khi query > 10M dòng | **< 2 giây** cho 100M+ dòng với Apache Trino |
| **Chất lượng dữ liệu** | Kiểm tra thủ công hoặc phát hiện sau khi lỗi | Tự động kiểm duyệt 100% qua Great Expectations |

### 3.2. Giá Trị Kinh Doanh Thực Tế
| Lợi Ích Kinh Doanh | Tác Động Thực Tế Đến Chuỗi Avengers Coffee |
|---|---|
| **Phát hiện bất thường tức thì** | Chi nhánh có doanh thu giảm đột ngột hoặc Shipper giao trễ bất thường → Hệ thống phát cảnh báo ngay trong vòng **5 phút**. |
| **Gợi ý món siêu chính xác** | Thuật toán **Spark MLlib ALS** tận dụng lịch sử đồng mua hàng, chính xác hơn 40–60% so với Cosine Similarity cơ bản. |
| **Giữ chân khách hàng VIP** | Model **Churn Prediction** phát hiện sớm khách hàng quen có dấu hiệu ngừng mua trước 30 ngày để tự động tặng Voucher giữ chân. |
| **Tối ưu hóa chuỗi cung ứng** | Dự báo chính xác nhu cầu cà phê theo từng khung giờ/chi nhánh, giảm lãng phí nguyên liệu **20–30%**. |
