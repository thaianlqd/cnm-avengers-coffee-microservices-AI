-- ============================================================================
-- Avengers Coffee Data Platform - AI Agent Schema & Vector Knowledge Graph
-- Khởi tạo Schema ai_agent, pgvector và bảng danh mục ngữ nghĩa cấu trúc dữ liệu
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS ai_agent;

-- 1. Bảng Danh mục Ngữ nghĩa Cấu trúc Bảng & Cột (Semantic Schema Catalog)
-- Lưu trữ chi tiết ý nghĩa nghiệp vụ, khóa chính, cấp độ dòng (grain), và mô tả các trường
DROP TABLE IF EXISTS ai_agent.schema_catalog CASCADE;
CREATE TABLE ai_agent.schema_catalog (
    id SERIAL PRIMARY KEY,
    schema_name VARCHAR(64) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    domain_name VARCHAR(100) NOT NULL,
    table_grain TEXT,
    primary_key VARCHAR(100),
    relationships TEXT,
    columns_metadata JSONB NOT NULL,
    summary_markdown TEXT NOT NULL,
    embedding vector(768),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unq_schema_tbl UNIQUE (schema_name, table_name)
);

CREATE INDEX IF NOT EXISTS idx_schema_catalog_vec ON ai_agent.schema_catalog 
USING hnsw (embedding vector_cosine_ops);

-- 2. Bảng Quan hệ và Khóa ngoại giữa các Bảng (Table Relationships & Join Paths)
-- Cung cấp đường dẫn JOIN chính xác tuyệt đối để AI không bao giờ join sai
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

-- 3. Bảng Nhật ký Truy vấn và Giám sát AI (Execution Logs & Audit)
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

-- Xóa bảng business_metrics cũ (nếu có) để tránh nhầm lẫn với các câu prompt hardcode
DROP TABLE IF EXISTS ai_agent.business_metrics CASCADE;
