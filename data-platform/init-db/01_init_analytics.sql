-- ============================================================================
-- Avengers Coffee Analytics Database - Schema Initialization
-- Chạy tự động khi postgres-analytics khởi động lần đầu
-- ============================================================================

-- Tạo các schema giống production (Supabase)
CREATE SCHEMA IF NOT EXISTS orders;
CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS menu;
CREATE SCHEMA IF NOT EXISTS inventory;
CREATE SCHEMA IF NOT EXISTS news;
CREATE SCHEMA IF NOT EXISTS ai;

-- Schema phục vụ Data Marts / Data Warehouse / Gold layer
CREATE SCHEMA IF NOT EXISTS gold;
CREATE SCHEMA IF NOT EXISTS dwh;

-- Bảng theo dõi tiến trình sync
CREATE TABLE IF NOT EXISTS public.sync_metadata (
    schema_name TEXT NOT NULL,
    table_name TEXT NOT NULL,
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    rows_synced BIGINT DEFAULT 0,
    sync_duration_ms BIGINT DEFAULT 0,
    sync_type TEXT DEFAULT 'full',
    error_message TEXT,
    PRIMARY KEY (schema_name, table_name)
);

-- Bảng log lịch sử sync
CREATE TABLE IF NOT EXISTS public.sync_history (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    total_tables INT DEFAULT 0,
    total_rows BIGINT DEFAULT 0,
    status TEXT DEFAULT 'running',
    error_message TEXT
);

-- Bảng lưu trữ Real-time Events từ Kafka Consumer
CREATE TABLE IF NOT EXISTS public.realtime_events (
    id BIGSERIAL PRIMARY KEY,
    topic VARCHAR(100) NOT NULL,
    event_key VARCHAR(255),
    event_type VARCHAR(100),
    payload JSONB NOT NULL,
    received_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_realtime_events_topic ON public.realtime_events(topic);
CREATE INDEX IF NOT EXISTS idx_realtime_events_received ON public.realtime_events(received_at DESC);

-- Bảng lưu trữ Dynamic Analytics Modules (do AI Agent hoặc Admin tạo)
CREATE TABLE IF NOT EXISTS public.saved_modules (
    id SERIAL PRIMARY KEY,
    module_id VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) DEFAULT 'Tùy Chỉnh',
    icon VARCHAR(50) DEFAULT 'bar-chart-2',
    config JSONB NOT NULL,
    created_by VARCHAR(100) DEFAULT 'AI_AGENT',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_saved_modules_active ON public.saved_modules(is_active);

-- Full configuration for AI-generated reports. Existing rows remain valid with NULL.
CREATE SCHEMA IF NOT EXISTS analytics;
ALTER TABLE IF EXISTS analytics.saved_reports
    ADD COLUMN IF NOT EXISTS module_config JSONB;
