import streamlit as st
from components import render_sidebar
from styles import inject_styles, init_plotly_template

# ─── Page Config ──────────────────────────────────────────────────────────────
st.set_page_config(page_title="Kiến Trúc Hệ Thống", page_icon="🏗️", layout="wide")
inject_styles()
init_plotly_template()
render_sidebar()

st.markdown("<h3 style='margin-bottom:16px; font-weight:800; color:#C0C0D8;'>Kiến Trúc Dữ Liệu: Medallion Lakehouse</h3>", unsafe_allow_html=True)
st.caption("Tổng quan về hệ thống luồng dữ liệu (Data Pipeline) theo chuẩn Lakehouse Architecture.")

st.markdown("""
> **Mục tiêu Kiến trúc**: Kết hợp sự linh hoạt của **Data Lake** (lưu trữ phi cấu trúc chi phí thấp) và sức mạnh truy vấn nhanh của **Data Warehouse** (dữ liệu có cấu trúc).

### 1. Sơ đồ Luồng Dữ Liệu (Data Pipeline Flow)
""")

st.info("""
🚀 **1. Event Streaming (Kafka):**
Các sự kiện (Đơn hàng mới, Đăng ký shipper, Cập nhật trạng thái) từ Microservices Backend được đẩy trực tiếp vào Kafka Topics theo thời gian thực (Real-time Ingestion).

💧 **2. Bronze Layer (MinIO - Data Lake):**
Apache Spark tiêu thụ dữ liệu thô (Raw Events) từ Kafka và lưu trữ nguyên vẹn dưới dạng file Parquet/JSON vào MinIO Object Storage. Tại đây, hệ thống lưu giữ lịch sử toàn bộ dữ liệu chưa qua chỉnh sửa.

⚙️ **3. Silver Layer (Spark Transform):**
Các job Spark thực hiện làm sạch dữ liệu (Cleansing), lọc bỏ dữ liệu rác, xử lý null, và chuẩn hóa định dạng (Schema validation).

🥇 **4. Gold Layer (PostgreSQL - Data Warehouse/Serving):**
Dữ liệu sau khi tổng hợp các chỉ số kinh doanh (Aggregated Metrics) được ghi vào PostgreSQL. Tầng này được thiết kế theo dạng Star Schema / Bảng Fact-Dimension để tối ưu hóa truy vấn đọc.

📊 **5. Presentation Layer (Streamlit & AI):**
Dashboard truy vấn trực tiếp từ Gold Layer (Postgres) để dựng biểu đồ tốc độ cao, đồng thời kết nối LLM (Anthropic/Groq) để phân tích Insight tự động.
""")

st.markdown("---")

col1, col2 = st.columns(2)
with col1:
    st.markdown("### Data Lake (MinIO)")
    st.markdown("""
    **Đặc điểm:** 
    - Lưu trữ đa định dạng với chi phí cực thấp (S3-compatible).
    - Có thể mở rộng dung lượng vô hạn (Horizontal scaling).
    
    **Loại dữ liệu lưu trữ:**
    - 📦 **Semi-structured**: Log hệ thống (JSON), lịch sử thay đổi trạng thái đơn hàng (Kafka events).
    - 📄 **Unstructured (Tiềm năng)**: Hình ảnh hóa đơn (OCR), hình ảnh xác minh của shipper, phản hồi bình luận text tự do của khách hàng, âm thanh/chatbot logs.
    """)
with col2:
    st.markdown("### Data Warehouse (Postgres)")
    st.markdown("""
    **Đặc điểm:**
    - Tối ưu cực độ cho truy vấn SQL phân tích (OLAP/OLTP Hybrid).
    - Tính nhất quán dữ liệu cao (ACID Compliance).
    
    **Loại dữ liệu lưu trữ:**
    - 📐 **Structured**: Thông tin Chi nhánh, Sản phẩm, Bảng tổng hợp (Fact Orders), Người dùng.
    - Dữ liệu ở đây đã được làm sạch 100% (Gold standard), sẵn sàng để vẽ biểu đồ không cần tiền xử lý thêm.
    """)
