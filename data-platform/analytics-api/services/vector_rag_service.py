import json
import logging
import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple

import requests
import psycopg2
from psycopg2.extras import RealDictCursor

from db import get_db_conn, GEMINI_API_KEY


logger = logging.getLogger("ai-vector-rag")

EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIM = 768

# Canonical Table Relationships for Silver Lakehouse
CANONICAL_RELATIONSHIPS = [
    {
        "from_table": "silver.don_hang",
        "from_column": "co_so_ma",
        "to_table": "silver.chi_nhanh",
        "to_column": "ma_chi_nhanh",
        "relationship_type": "MANY_TO_ONE",
        "join_clause": "JOIN silver.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh",
        "business_context": "Liên kết đơn hàng với chi nhánh để lấy tên cửa hàng, thành phố (Hà Nội, TP.HCM, Đà Nẵng), địa chỉ",
    },
    {
        "from_table": "silver.chi_tiet_don_hang",
        "from_column": "ma_don_hang",
        "to_table": "silver.don_hang",
        "to_column": "ma_don_hang",
        "relationship_type": "MANY_TO_ONE",
        "join_clause": "JOIN silver.don_hang d ON ct.ma_don_hang = d.ma_don_hang",
        "business_context": "Liên kết chi tiết từng món đồ uống với hóa đơn chính để lọc thời gian, trạng thái, chi nhánh",
    },
    {
        "from_table": "silver.chi_tiet_don_hang",
        "from_column": "ma_san_pham",
        "to_table": "silver.san_pham",
        "to_column": "ma_san_pham",
        "relationship_type": "MANY_TO_ONE",
        "join_clause": "JOIN silver.san_pham sp ON ct.ma_san_pham = sp.ma_san_pham",
        "business_context": "Liên kết món trong hóa đơn với danh mục sản phẩm đồ uống/bánh ngọt",
    },
    {
        "from_table": "silver.san_pham",
        "from_column": "ma_danh_muc",
        "to_table": "silver.danh_muc",
        "to_column": "ma_danh_muc",
        "relationship_type": "MANY_TO_ONE",
        "join_clause": "JOIN silver.danh_muc dm ON sp.ma_danh_muc = dm.ma_danh_muc",
        "business_context": "Liên kết sản phẩm với nhóm thực đơn (Cà phê, Trà, Đá xay, Bánh ngọt)",
    },
    {
        "from_table": "silver.don_hang",
        "from_column": "ma_nguoi_dung",
        "to_table": "silver.nguoi_dung",
        "to_column": "ma_nguoi_dung",
        "relationship_type": "MANY_TO_ONE",
        "join_clause": "JOIN silver.nguoi_dung nd ON d.ma_nguoi_dung = nd.ma_nguoi_dung::text",
        "business_context": "Liên kết đơn hàng với hồ sơ hội viên/khách hàng loyalty",
    },
    {
        "from_table": "silver.danh_gia_san_pham",
        "from_column": "ma_san_pham",
        "to_table": "silver.san_pham",
        "to_column": "ma_san_pham",
        "relationship_type": "MANY_TO_ONE",
        "join_clause": "JOIN silver.san_pham sp ON dg.ma_san_pham = sp.ma_san_pham",
        "business_context": "Liên kết điểm số đánh giá và nhận xét với từng sản phẩm cà phê",
    },
    {
        "from_table": "silver.danh_gia_chi_nhanh",
        "from_column": "ma_chi_nhanh",
        "to_table": "silver.chi_nhanh",
        "to_column": "ma_chi_nhanh",
        "relationship_type": "MANY_TO_ONE",
        "join_clause": "JOIN silver.chi_nhanh cn ON dg.ma_chi_nhanh = cn.ma_chi_nhanh",
        "business_context": "Liên kết đánh giá chất lượng phục vụ và không gian với từng cửa hàng",
    },
    {
        "from_table": "silver.ca_lam_viec_nhan_vien",
        "from_column": "ma_chi_nhanh",
        "to_table": "silver.chi_nhanh",
        "to_column": "ma_chi_nhanh",
        "relationship_type": "MANY_TO_ONE",
        "join_clause": "JOIN silver.chi_nhanh cn ON ca.ma_chi_nhanh = cn.ma_chi_nhanh",
        "business_context": "Liên kết ca làm việc, chấm công và tình trạng đi trễ với từng điểm bán",
    },
    {
        "from_table": "silver.ca_doi_soat",
        "from_column": "ma_chi_nhanh",
        "to_table": "silver.chi_nhanh",
        "to_column": "ma_chi_nhanh",
        "relationship_type": "MANY_TO_ONE",
        "join_clause": "JOIN silver.chi_nhanh cn ON ds.ma_chi_nhanh = cn.ma_chi_nhanh",
        "business_context": "Liên kết đối soát doanh thu ca và chênh lệch tiền mặt két thu ngân với cửa hàng",
    },
    {
        "from_table": "silver.chuyen_giao_hang",
        "from_column": "ma_shipper",
        "to_table": "silver.shipper",
        "to_column": "ma_shipper",
        "relationship_type": "MANY_TO_ONE",
        "join_clause": "JOIN silver.shipper sh ON cg.ma_shipper = sh.ma_shipper",
        "business_context": "Liên kết chuyến giao hàng với tài xế shipper",
    }
]

# Business metadata descriptions for Silver and Gold tables
TABLE_BUSINESS_DESCRIPTIONS = {
    "silver.don_hang": {
        "domain": "Giao dịch Đơn hàng Bán hàng & Doanh thu",
        "grain": "Mỗi dòng là 1 đơn hàng giao dịch của khách.",
        "pk": "ma_don_hang",
        "desc": "Bảng trung tâm chứa doanh thu tong_tien, ngay_tao, trang_thai_don_hang (HOAN_THANH, DANG_GIAO, DA_HUY), phuong_thuc_thanh_toan (TIEN_MAT, MOMO, VNPAY, NGAN_HANG_QR), loai_don_hang (TAI_QUAY, MANG_DI, GIAO_TAN_NOI), co_so_ma (chi nhánh), ma_nguoi_dung."
    },
    "silver.chi_tiet_don_hang": {
        "domain": "Chi tiết Món ăn & Đồ uống trong Đơn hàng",
        "grain": "Mỗi dòng là 1 món cụ thể trong 1 đơn hàng.",
        "pk": "id",
        "desc": "Chứa ma_don_hang, ma_san_pham, ten_san_pham, so_luong (số ly bán ra), gia_ban, kich_co (size S, M, L)."
    },
    "silver.san_pham": {
        "domain": "Danh mục Thực đơn Sản phẩm & Giá bán",
        "grain": "Mỗi dòng là 1 món đồ uống hoặc bánh ngọt.",
        "pk": "ma_san_pham",
        "desc": "Chứa ma_san_pham, ten_san_pham, gia_ban, ma_danh_muc, trang_thai (kinh doanh hay tạm ngưng)."
    },
    "silver.danh_muc": {
        "domain": "Phân loại Nhóm Thực đơn (Cà phê, Trà, Bánh)",
        "grain": "Mỗi dòng là 1 danh mục món ăn đồ uống.",
        "pk": "ma_danh_muc",
        "desc": "Chứa ma_danh_muc, ten_danh_muc (Cà phê máy, Cà phê truyền thống, Trà trái cây, Bánh ngọt), cap_bac."
    },
    "silver.chi_nhanh": {
        "domain": "Hệ thống Cửa hàng Chi nhánh Toàn quốc",
        "grain": "Mỗi dòng là 1 điểm bán / cửa hàng cà phê.",
        "pk": "ma_chi_nhanh",
        "desc": "Chứa ma_chi_nhanh, ten_chi_nhanh, thanh_pho (Hà Nội, TP.HCM, Đà Nẵng, Cần Thơ, Hải Phòng), dia_chi, trang_thai."
    },
    "silver.nguoi_dung": {
        "domain": "Khách hàng & Hội viên Loyalty",
        "grain": "Mỗi dòng là 1 tài khoản khách hàng.",
        "pk": "ma_nguoi_dung",
        "desc": "Chứa ma_nguoi_dung, diem_loyalty, tong_chi_tieu, ngay_dang_ky."
    },
    "silver.ton_kho_san_pham": {
        "domain": "Tồn kho Nguyên vật liệu & Cảnh báo hết hàng",
        "grain": "Mỗi dòng là số lượng tồn của 1 nguyên liệu/mặt hàng tại 1 chi nhánh.",
        "pk": "id",
        "desc": "Chứa ma_san_pham, ten_san_pham, so_luong_ton, dinh_muc_toi_thieu, trang_thai_ton, ma_chi_nhanh."
    },
    "silver.danh_gia_san_pham": {
        "domain": "Đánh giá Chất lượng Món & Rating Sao Sản phẩm",
        "grain": "Mỗi dòng là 1 lượt đánh giá sản phẩm của khách.",
        "pk": "id",
        "desc": "Chứa ma_san_pham, so_sao (1-5 sao), noi_dung_danh_gia, ngay_tao."
    },
    "silver.danh_gia_chi_nhanh": {
        "domain": "Đánh giá Dịch vụ Chi nhánh & Trải nghiệm Phục vụ",
        "grain": "Mỗi dòng là 1 lượt đánh giá cửa hàng.",
        "pk": "id",
        "desc": "Chứa ma_chi_nhanh, diem_phuc_vu, diem_khong_gian, so_sao, noi_dung, ngay_tao."
    },
    "silver.ca_lam_viec_nhan_vien": {
        "domain": "Chấm công Nhân viên, Ca làm việc & Đi trễ",
        "grain": "Mỗi dòng là 1 ca làm của nhân viên.",
        "pk": "id",
        "desc": "Chứa ma_nhan_vien, ma_chi_nhanh, ngay_lam, ca, trang_thai_cham_cong, so_phut_di_tre."
    },
    "silver.ca_doi_soat": {
        "domain": "Đối soát Thu ngân & Chênh lệch Tiền mặt Két",
        "grain": "Mỗi dòng là 1 phiên giao ca đối soát tại quầy thu ngân.",
        "pk": "id",
        "desc": "Chứa ma_chi_nhanh, ma_ca, tong_thu_he_thong, tien_mat_thuc_te, chenh_lech, trang_thai."
    },
    "silver.voucher": {
        "domain": "Chương trình Khuyến mãi, Voucher & Mã giảm giá",
        "grain": "Mỗi dòng là 1 mã ưu đãi.",
        "pk": "ma_voucher",
        "desc": "Chứa ma_voucher, ten_khuyen_mai, phan_tram_giam, so_tien_giam_toi_da, luot_su_dung, trang_thai."
    },
    "silver.yeu_thich_san_pham": {
        "domain": "Sản phẩm Yêu thích & Wishlist Người dùng",
        "grain": "Mỗi dòng là 1 lượt lưu món yêu thích.",
        "pk": "id",
        "desc": "Chứa ma_san_pham, ten_san_pham, ma_nguoi_dung, ngay_tao."
    },
    "silver.khao_sat_phan_hoi": {
        "domain": "Khảo sát Ý kiến & Phản hồi Khách hàng",
        "grain": "Mỗi dòng là 1 câu trả lời khảo sát dịch vụ.",
        "pk": "id",
        "desc": "Chứa ma_don_hang, co_so_ma, cau_hoi, tra_loi, ngay_tao."
    },
    "silver.shipper": {
        "domain": "Đội ngũ Tài xế Giao hàng Shipper",
        "grain": "Mỗi dòng là 1 tài xế giao nhận.",
        "pk": "ma_shipper",
        "desc": "Chứa ma_shipper, ho_ten, bien_so_xe, khu_vuc_hoat_dong, diem_danh_gia, trang_thai."
    },
    "gold.revenue_daily": {
        "domain": "Data Mart Doanh thu Theo Ngày (Chuỗi 30 ngày)",
        "grain": "Mỗi dòng là tổng kết doanh thu và đơn hàng của 1 ngày.",
        "pk": "date",
        "desc": "Chứa date (YYYY-MM-DD), total_orders, revenue."
    },
    "gold.top_products": {
        "domain": "Data Mart Top Món Bán Chạy & Doanh thu Theo Món",
        "grain": "Mỗi dòng là tổng sản lượng và doanh thu của 1 sản phẩm.",
        "pk": "ma_san_pham",
        "desc": "Chứa ma_san_pham, ten_san_pham, total_quantity, total_revenue."
    },
    "gold.stores_overview": {
        "domain": "Data Mart Hiệu suất Bán hàng Chi nhánh",
        "grain": "Mỗi dòng là doanh thu, đơn và AOV của 1 cửa hàng.",
        "pk": "store_code",
        "desc": "Chứa store_code, store_name, city, total_orders, total_revenue, aov."
    },
    "gold.payment_methods_distribution": {
        "domain": "Data Mart Cơ cấu Phương thức Thanh toán",
        "grain": "Mỗi dòng là 1 kênh thanh toán.",
        "pk": "payment_method",
        "desc": "Chứa payment_method, count, revenue."
    },
    "gold.order_status_distribution": {
        "domain": "Data Mart Tỷ lệ Trạng thái Đơn hàng",
        "grain": "Mỗi dòng là 1 trạng thái giao dịch.",
        "pk": "status",
        "desc": "Chứa status, count, pct (tỷ lệ %)."
    }
}


def get_embedding(text: str) -> List[float]:
    """Generate 768-dim semantic embedding using Gemini embedding API."""
    if not GEMINI_API_KEY or not text.strip():
        return [0.0] * EMBEDDING_DIM

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{EMBEDDING_MODEL}:embedContent?key={GEMINI_API_KEY}"
    payload = {
        "content": {"parts": [{"text": text[:3500]}]},
        "outputDimensionality": EMBEDDING_DIM,
    }
    try:
        res = requests.post(url, json=payload, timeout=12)
        if res.status_code == 200:
            return res.json().get("embedding", {}).get("values", [0.0] * EMBEDDING_DIM)
        else:
            logger.warning("Embedding API error %d: %s", res.status_code, res.text[:120])
            return [0.0] * EMBEDDING_DIM
    except Exception as e:
        logger.warning("Embedding request exception: %s", e)
        return [0.0] * EMBEDDING_DIM


class VectorRagService:
    def __init__(self):
        self._initialized = False

    def ensure_vector_db_ready(self):
        """Ensure pgvector extension, ai_agent schema, catalog, and relationships are seeded."""
        if self._initialized:
            return
        try:
            conn = get_db_conn()
            cur = conn.cursor()
            
            # 1. Enable pgvector
            try:
                cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
                conn.commit()
            except Exception as e:
                logger.warning("Could not enable pgvector: %s", e)
                conn.rollback()

            # 2. Check if ai_agent.schema_catalog exists and has data
            cur.execute("""
                SELECT COUNT(*) as count 
                FROM information_schema.tables 
                WHERE table_schema = 'ai_agent' AND table_name = 'schema_catalog';
            """)
            has_table = cur.fetchone()["count"] > 0
            
            row_count = 0
            if has_table:
                cur.execute("SELECT COUNT(*) as cnt FROM ai_agent.schema_catalog WHERE embedding IS NOT NULL;")
                row_count = cur.fetchone()["cnt"]

            if not has_table or row_count < 10:
                logger.info("⚡ [VECTOR-DB] Khởi tạo & nạp Vector Knowledge Base vào ai_agent.schema_catalog...")
                self._seed_knowledge_base(conn, cur)
            else:
                self._initialized = True
                
            cur.close()
            conn.close()
        except Exception as err:
            logger.error("Error in ensure_vector_db_ready: %s", err)

    def _seed_knowledge_base(self, conn, cur):
        """Introspect tables and embed schema metadata into ai_agent.schema_catalog."""
        cur.execute("CREATE SCHEMA IF NOT EXISTS ai_agent;")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS ai_agent.schema_catalog (
                id SERIAL PRIMARY KEY,
                schema_name VARCHAR(64) NOT NULL,
                table_name VARCHAR(100) NOT NULL,
                domain_name VARCHAR(150) NOT NULL,
                table_grain TEXT,
                primary_key VARCHAR(100),
                relationships TEXT,
                columns_metadata JSONB NOT NULL,
                summary_markdown TEXT NOT NULL,
                embedding vector(768),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                CONSTRAINT unq_schema_tbl UNIQUE (schema_name, table_name)
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS ai_agent.table_relationships (
                id SERIAL PRIMARY KEY,
                from_table VARCHAR(100) NOT NULL,
                from_column VARCHAR(100) NOT NULL,
                to_table VARCHAR(100) NOT NULL,
                to_column VARCHAR(100) NOT NULL,
                relationship_type VARCHAR(50) DEFAULT 'MANY_TO_ONE',
                join_clause TEXT NOT NULL,
                business_context TEXT NOT NULL
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS ai_agent.query_logs (
                id SERIAL PRIMARY KEY,
                user_prompt TEXT NOT NULL,
                retrieved_tables JSONB,
                generated_sql TEXT,
                execution_status VARCHAR(30) NOT NULL,
                execution_time_ms INT,
                error_message TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)
        conn.commit()

        # Seed relationships
        cur.execute("TRUNCATE TABLE ai_agent.table_relationships;")
        for r in CANONICAL_RELATIONSHIPS:
            cur.execute("""
                INSERT INTO ai_agent.table_relationships
                (from_table, from_column, to_table, to_column, relationship_type, join_clause, business_context)
                VALUES (%s, %s, %s, %s, %s, %s, %s);
            """, (
                r["from_table"], r["from_column"], r["to_table"], r["to_column"],
                r["relationship_type"], r["join_clause"], r["business_context"]
            ))
        conn.commit()

        # Introspect real columns for silver and gold schemas
        cur.execute("""
            SELECT table_schema, table_name, column_name, data_type
            FROM information_schema.columns
            WHERE table_schema IN ('silver', 'gold')
            ORDER BY table_schema, table_name, ordinal_position;
        """)
        table_cols: Dict[str, List[Dict[str, str]]] = {}
        for r in cur.fetchall():
            qualified = f"{r['table_schema']}.{r['table_name']}"
            if qualified not in table_cols:
                table_cols[qualified] = []
            table_cols[qualified].append({"name": r["column_name"], "type": r["data_type"]})

        logger.info("Embedding and indexing %d tables into Vector DB...", len(table_cols))
        for qualified, cols in table_cols.items():
            schema_name, tbl_name = qualified.split(".", 1)
            b_info = TABLE_BUSINESS_DESCRIPTIONS.get(qualified, {
                "domain": f"Dữ liệu {schema_name.upper()} {tbl_name}",
                "grain": "Bản ghi nghiệp vụ",
                "pk": cols[0]["name"] if cols else "id",
                "desc": f"Bảng {qualified} lưu trữ thông tin nghiệp vụ hệ thống."
            })
            
            col_list_str = "\n".join(f"- {c['name']} ({c['type']})" for c in cols)
            summary_md = f"""### Bảng: {qualified}
- Miền nghiệp vụ: {b_info['domain']}
- Khóa chính: {b_info['pk']}
- Cấp độ dữ liệu: {b_info['grain']}
- Mô tả nghiệp vụ: {b_info['desc']}
- Các trường dữ liệu:
{col_list_str}
"""
            emb = get_embedding(summary_md)
            cur.execute("""
                INSERT INTO ai_agent.schema_catalog
                (schema_name, table_name, domain_name, table_grain, primary_key, relationships, columns_metadata, summary_markdown, embedding)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (schema_name, table_name) DO UPDATE SET
                    domain_name = EXCLUDED.domain_name,
                    columns_metadata = EXCLUDED.columns_metadata,
                    summary_markdown = EXCLUDED.summary_markdown,
                    embedding = EXCLUDED.embedding,
                    updated_at = NOW();
            """, (
                schema_name, tbl_name, b_info["domain"], b_info["grain"],
                b_info["pk"], "", json.dumps(cols), summary_md, emb
            ))
            conn.commit()

        self._initialized = True
        logger.info("✅ [VECTOR-DB] Đã nạp thành công %d bảng vào ai_agent.schema_catalog!", len(table_cols))

    def search_semantic_knowledge(self, user_prompt: str, top_k: int = 5) -> Dict[str, Any]:
        """Perform Vector Cosine Similarity Search over ai_agent.schema_catalog + join relationships."""
        self.ensure_vector_db_ready()
        started = time.perf_counter()
        
        # 1. Compute embedding vector
        query_vec = get_embedding(user_prompt)
        has_vec = any(v != 0.0 for v in query_vec[:10])

        top_tables: List[Dict[str, Any]] = []
        relationships: List[Dict[str, Any]] = []

        try:
            conn = get_db_conn()
            cur = conn.cursor()

            # 2. Vector search via pgvector
            if has_vec:
                cur.execute("""
                    SELECT schema_name, table_name, domain_name, table_grain, primary_key,
                           columns_metadata, summary_markdown,
                           ROUND((1 - (embedding <=> %s::vector))::numeric, 4) AS similarity
                    FROM ai_agent.schema_catalog
                    WHERE embedding IS NOT NULL
                    ORDER BY embedding <=> %s::vector ASC
                    LIMIT %s;
                """, (query_vec, query_vec, top_k))
                top_tables = cur.fetchall()
            else:
                # Text fallback if embedding API failed
                cur.execute("""
                    SELECT schema_name, table_name, domain_name, table_grain, primary_key,
                           columns_metadata, summary_markdown, 1.0 AS similarity
                    FROM ai_agent.schema_catalog
                    ORDER BY id ASC
                    LIMIT %s;
                """, (top_k,))
                top_tables = cur.fetchall()

            # 3. Retrieve relevant join relationships
            cur.execute("""
                SELECT from_table, to_table, join_clause, business_context
                FROM ai_agent.table_relationships;
            """)
            relationships = cur.fetchall()

            cur.close()
            conn.close()
        except Exception as e:
            logger.error("Vector search query error: %s", e)

        latency_ms = int((time.perf_counter() - started) * 1000)

        # 4. Formatted structured logs for user transparency
        logger.info("=" * 65)
        logger.info("📚 [METADATA-CATALOG] Đang truy xuất Metadata & Vector DB: ai_agent.schema_catalog")
        logger.info("🔍 [VECTOR-SEARCH] Embedding câu hỏi (gemini-embedding-001, 768-dim) hoàn tất (%dms)", latency_ms)
        logger.info("🎯 [VECTOR-RAG] Top %d bảng ngữ nghĩa phù hợp nhất với câu hỏi:", len(top_tables))
        for t in top_tables:
            logger.info("   -> [%s.%s] (Similarity: %.2f%%) — %s", 
                        t['schema_name'], t['table_name'], float(t.get('similarity') or 0) * 100, t.get('domain_name'))
        logger.info("🔗 [JOIN-GRAPH] Đã nạp %d đường dẫn liên kết bảng chuẩn từ ai_agent.table_relationships", len(relationships))
        logger.info("=" * 65)

        # 5. Format prompt context for LLM
        schema_context_lines = []
        for t in top_tables:
            schema_context_lines.append(t["summary_markdown"])

        join_lines = []
        for r in relationships:
            join_lines.append(f"- {r['from_table']} -> {r['to_table']}: `{r['join_clause']}` ({r['business_context']})")

        return {
            "top_tables": [f"{t['schema_name']}.{t['table_name']}" for t in top_tables],
            "table_details": top_tables,
            "relationships": relationships,
            "vector_context_text": "\n\n".join(schema_context_lines),
            "join_context_text": "\n".join(join_lines),
            "latency_ms": latency_ms,
        }

    def log_query(self, user_prompt: str, retrieved_tables: List[str], generated_sql: str, status: str, latency_ms: int, error: str = ""):
        """Audit log each query into ai_agent.query_logs."""
        try:
            conn = get_db_conn()
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO ai_agent.query_logs
                (user_prompt, retrieved_tables, generated_sql, execution_status, execution_time_ms, error_message)
                VALUES (%s, %s, %s, %s, %s, %s);
            """, (user_prompt, json.dumps(retrieved_tables), generated_sql, status, latency_ms, error))
            conn.commit()
            cur.close()
            conn.close()
        except Exception as e:
            logger.warning("Could not log to ai_agent.query_logs: %s", e)


vector_rag_service = VectorRagService()
