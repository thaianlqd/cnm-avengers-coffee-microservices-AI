import time
from datetime import datetime
from fastapi import APIRouter, HTTPException, Request
from uuid import uuid4
from db import get_db_conn
from common import PipelineTriggerRequest

router = APIRouter(tags=["Platform Architecture & Infrastructure"])


NOT_MEASURED = "not_measured"
CONFIGURED = "configured"
_TOPICS = (("order-items-events", "Luồng Chi Tiết Món Đặt"),
           ("orders-events", "Luồng Đơn Hàng Giao Dịch"),
           ("shipper-events", "Luồng Vận Chuyển & Tài Xế"))
_BUCKETS = (("avengers-bronze", "Tầng Bronze: Dữ Liệu Thô", "JSON / NDJSON"),
            ("avengers-silver", "Tầng Silver: Dữ Liệu Chuẩn Hóa", "Apache Parquet"),
            ("avengers-gold", "Tầng Gold: Tập Dữ Liệu Tinh Chế", "Parquet & JSON"))
# Configured topology only: hosts/roles come from compose, never from a liveness probe.
_INFRASTRUCTURE = (("Kafka Event Broker", "avengers_kafka:9092", "Message Streaming"),
                   ("MinIO S3 Lakehouse", "avengers_minio:9000", "Medallion Storage"),
                   ("PostgreSQL Analytics", "postgres-analytics:5432", "Data Marts DWH"),
                   ("Spark Processing Engine", "avengers_spark_jobs", "PySpark Batch ETL"),
                   ("Kafka Consumer Service", "avengers_kafka_consumer", "Event Ingestion"),
                   ("Data Sync Service", "avengers_data_sync", "Replication"))
_JOBS = (("job-bronze-ingest", "Bronze Ingestion Job", "bronze_ingestion.py", "Bronze",
          "Đọc dữ liệu nguồn và ghi bản ghi thô bất biến cho Bronze"),
         ("job-silver-transform", "Silver Transformation Job", "silver_transform.py", "Silver",
          "Làm sạch, khử trùng lặp và ghi Parquet cho Silver"),
         ("job-gold-aggregation", "Gold Aggregation Job", "gold_aggregation.py", "Gold",
          "Tính KPI, khẩu vị chi nhánh và phân khúc RFM cho Gold"))
_DAG_ID, _DAG_SCHEDULE = "avengers_daily_pipeline", "0 2 * * *"


def _fail():
    # Never echo driver/DB exception text over HTTP.
    raise HTTPException(status_code=500, detail="Không đọc được dữ liệu nền tảng")


def _publications(cur):
    """Committed publication pointers only; they do not prove manifests, jobs or schedule health."""
    try:
        cur.execute("SELECT pipeline, run_id, published_at::text AS published_at "
                    "FROM analytics.pipeline_publications ORDER BY published_at DESC")
        return [dict(r) for r in cur.fetchall()]
    except Exception:
        try:
            cur.connection.rollback()
        except Exception:
            pass
        return None


def _quality_summary():
    try:
        from services import data_coverage_service
        snap = data_coverage_service.quality_snapshot() or {}
    except Exception:
        snap = {}
    return {"health_score": snap.get("overall_score"), "rules_checked": None,
            "violations_count": None, "status": snap.get("status") or "unknown",
            "scope": "measured_checks_only"}


# ─── 1. PLATFORM OVERVIEW & HEALTH ───
@router.get("/api/platform/overview")
def get_platform_overview():
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT COALESCE(SUM(n_live_tup), 0) AS total_rows
                    FROM pg_stat_user_tables
                    WHERE schemaname IN ('gold', 'orders', 'identity', 'menu', 'inventory', 'news', 'public');
                """)
                total_rows = cur.fetchone()["total_rows"]
                cur.execute("""
                    SELECT
                        COUNT(*) AS total_orders,
                        COALESCE(SUM(tong_tien) FILTER (WHERE trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')), 0) AS total_revenue,
                        COUNT(*) FILTER (WHERE trang_thai_don_hang = 'DANG_GIAO') AS active_deliveries
                    FROM silver.don_hang;
                """)
                orders_meta = cur.fetchone()
                cur.execute("SELECT COUNT(*) AS total_events FROM public.realtime_events;")
                events_meta = cur.fetchone()
                cur.execute("SELECT COUNT(*) AS total_branches FROM silver.chi_nhanh;")
                branches_count = cur.fetchone()["total_branches"]
                cur.execute("SELECT COUNT(*) AS total_products FROM silver.san_pham;")
                products_count = cur.fetchone()["total_products"]
                cur.execute("""
                    SELECT COUNT(*) AS total_tables
                    FROM information_schema.tables
                    WHERE table_schema IN ('gold', 'orders', 'identity', 'menu', 'inventory', 'news');
                """)
                tables_count = cur.fetchone()["total_tables"]
                publications = _publications(cur)
        last_run = publications[0]["published_at"] if publications else None
        return {
            "warehouse": {
                "total_rows": int(total_rows),
                "total_orders": int(orders_meta["total_orders"]),
                "total_revenue": float(orders_meta["total_revenue"]),
                "active_deliveries": int(orders_meta["active_deliveries"]),
                # projection row count: not a Kafka/Bronze object count
                "total_events": int(events_meta["total_events"]),
                "total_tables": int(tables_count),
                "total_branches": int(branches_count),
                "total_products": int(products_count),
            },
            "storage": {
                key.split("-")[1]: {"name": key, "label": label, "format": fmt, "size_mb": None,
                                    "objects": None, "retention": None, "status": NOT_MEASURED}
                for key, label, fmt in _BUCKETS
            },
            "streaming": {"topics_count": len(_TOPICS), "partitions_count": None, "active_consumers": None,
                          "throughput_msg_per_sec": None, "consumer_lag": None, "status": NOT_MEASURED},
            "pipeline": {"last_batch_run": last_run, "status": "committed_publication" if last_run else NOT_MEASURED,
                         "sla_health": NOT_MEASURED, "active_jobs": None,
                         "next_scheduled_run": f"{_DAG_SCHEDULE} (cấu hình DAG {_DAG_ID}, chưa quan sát)"},
            "quality": _quality_summary(),
            "infrastructure": [{"name": n, "host": h, "role": r, "status": CONFIGURED}
                               for n, h, r in _INFRASTRUCTURE],
        }
    except HTTPException:
        raise
    except Exception:
        _fail()


# ─── 2. DATA ARCHITECTURE & LINEAGE MAP (configured topology, no measurements) ───
@router.get("/api/platform/lineage")
def get_data_lineage():
    def node(**kw):
        return {**kw, "status": CONFIGURED}
    return {
        "title": "Kiến Trúc Dòng Chảy Dữ Liệu (cấu hình, chưa kèm số đo)",
        "layers": [
            {"id": "layer_oltp", "index": 1, "name": "Tầng 1: CSDL Nguồn Giao Dịch", "sub": "Microservices PostgreSQL",
             "type": "OLTP RDBMS", "nodes": [
                 node(id="orders_db", name="Dịch Vụ Đơn Hàng", table="orders.don_hang", records=None),
                 node(id="items_db", name="Chi Tiết Món Đặt", table="orders.chi_tiet_don_hang", records=None),
                 node(id="menu_db", name="Thực Đơn & Món", table="menu.san_pham", records=None),
                 node(id="identity_db", name="Chi Nhánh", table="identity.chi_nhanh", records=None)]},
            {"id": "layer_streaming", "index": 2, "name": "Tầng 2: Luồng Sự Kiện", "sub": "Apache Kafka",
             "type": "Event Stream", "nodes": [node(id="topic_" + t.split("-")[0], name="Topic " + t, records=None,
                                                    partitions=None, throughput=None) for t, _ in _TOPICS]},
            {"id": "layer_bronze", "index": 3, "name": "Tầng 3: Lakehouse Bronze (Thô)", "sub": "MinIO S3",
             "type": "Object Storage Raw", "nodes": [node(id="s3_bronze", name="Bucket avengers-bronze",
                                                           format="JSON / NDJSON", size=None, records=None)]},
            {"id": "layer_processing", "index": 4, "name": "Tầng 4: Xử Lý Batch", "sub": "Spark jobs & Airflow",
             "type": "Compute & Cleanse", "nodes": [
                 node(id="spark_cleanse", name="Khử Trùng Lặp & Ép Schema", tech="Spark job", duration=None),
                 node(id="airflow_dag", name=f"Airflow DAG {_DAG_ID}", tech="Airflow", frequency=_DAG_SCHEDULE)]},
            {"id": "layer_silver", "index": 5, "name": "Tầng 5: Lakehouse Silver (Chuẩn Hóa)", "sub": "MinIO S3 Parquet",
             "type": "Columnar Parquet", "nodes": [node(id="silver_orders", name="silver.don_hang", format="Parquet", size=None),
                                                   node(id="silver_items", name="silver.chi_tiet_don_hang", format="Parquet", size=None)]},
            {"id": "layer_gold", "index": 6, "name": "Tầng 6: Data Marts (Gold)", "sub": "PostgreSQL Analytics",
             "type": "Data Warehouse", "nodes": [
                 node(id="gold_kpi", name="gold.kpi_summary", desc="Chỉ số doanh thu & đơn hàng"),
                 node(id="gold_revenue", name="gold.revenue_daily", desc="Doanh thu theo ngày"),
                 node(id="gold_taste", name="gold.branch_taste_profile", desc="Khẩu vị theo chi nhánh"),
                 node(id="gold_rfm", name="gold.customer_segments", desc="Phân khúc RFM")]},
            {"id": "layer_serving", "index": 7, "name": "Tầng 7: Trực Quan Hóa & Phục Vụ", "sub": "React Data Console",
             "type": "Presentation Layer", "nodes": [node(id="web_portal", name="Data Control Center", desc="Bảng điều khiển & truy vấn")]},
        ],
    }


# ─── 3. LAKEHOUSE & STORAGE CENTER (configured buckets; sizes/objects not measured) ───
@router.get("/api/platform/lakehouse")
def get_lakehouse_details():
    return {
        "overview": {"lakehouse_engine": "MinIO S3 Compatible Object Storage", "total_buckets": len(_BUCKETS),
                     "total_storage_mb": None, "health": NOT_MEASURED},
        "buckets": [{"name": n, "label": label, "file_format": fmt, "size_mb": None, "object_count": None,
                     "retention_policy": None, "status": NOT_MEASURED} for n, label, fmt in _BUCKETS],
        "tables": [],
    }


# ─── 4. KAFKA EVENT STREAMING HUB ───
@router.get("/api/platform/streaming")
def get_streaming_details():
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT topic, COUNT(*) AS total_count, MAX(received_at)::text AS latest_received
                    FROM public.realtime_events GROUP BY topic;
                """)
                by_topic = {t["topic"]: t for t in cur.fetchall()}
                cur.execute("""
                    SELECT id, topic, event_key, event_type, payload, received_at::text
                    FROM public.realtime_events ORDER BY id DESC LIMIT 50;
                """)
                recent_events = cur.fetchall()
        return {
            # counts/timestamps are DB projection facts; partitions/throughput/lag are not measured here
            "topics": [{"topic": t, "label": label, "partitions": None, "replication": None,
                        "total_messages": int(by_topic[t]["total_count"]) if t in by_topic else None,
                        "throughput": None,
                        "latest_timestamp": by_topic[t]["latest_received"] if t in by_topic else None,
                        "consumer_group": None, "lag": None, "status": NOT_MEASURED} for t, label in _TOPICS],
            "consumer_groups": [],
            "live_events": [dict(e) for e in recent_events],
        }
    except HTTPException:
        raise
    except Exception:
        _fail()


# ─── 5. PIPELINES & SPARK JOBS ORCHESTRATION ───
@router.get("/api/platform/pipelines")
def get_pipelines():
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                publications = _publications(cur)
    except Exception:
        publications = None
    return {
        "engine": "Spark batch jobs + Airflow (cấu hình)",
        "active_jobs_count": None,
        "cluster_status": NOT_MEASURED,
        "observation_status": NOT_MEASURED if publications is None else "committed_publications_only",
        "committed_publications": publications or [],
        "jobs": [{"id": i, "name": n, "description": d, "script": s, "layer": l, "schedule": None,
                  "last_run": None, "duration_seconds": None, "rows_processed": None, "status": NOT_MEASURED}
                 for i, n, s, l, d in _JOBS],
        "dags": [{"dag_id": _DAG_ID, "description": "Điều phối Bronze -> Silver -> Gold (cấu hình)",
                  "schedule_interval": _DAG_SCHEDULE, "is_paused": None, "last_run_state": None,
                  "next_execution": None, "sla_met": None}],
    }


@router.post("/api/platform/pipelines/trigger")
def trigger_pipeline(req: PipelineTriggerRequest, request: Request = None):
    from services.report_sql_policy import require_sql_admin
    from services.access_policy import active_principal,current_principal,require_permission
    factory=get_db_conn
    if active_principal.get() is not None:
        principal=current_principal(required=True)
        require_permission(principal,'pipeline.trigger')
        from services.telemetry import audit
        audit('pipeline.trigger','pipeline')
        from db import get_pipeline_writer_conn
        factory=get_pipeline_writer_conn
    else:
        require_sql_admin(request)
    if req.target_layer not in {None, 'gold'}:
        raise HTTPException(422, 'Thao tác này chỉ ghi ảnh chụp KPI Gold từ PostgreSQL.')
    start_time = time.time()
    try:
        with factory() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO gold.kpi_summary (orders_today, completed_today, revenue_today, active_deliveries, total_orders_all_time, revenue_all_time)
                    SELECT
                        COUNT(*) FILTER (WHERE DATE(ngay_tao) = CURRENT_DATE),
                        COUNT(*) FILTER (WHERE trang_thai_don_hang = 'HOAN_THANH' AND DATE(ngay_tao) = CURRENT_DATE),
                        COALESCE(SUM(tong_tien) FILTER (WHERE trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO') AND DATE(ngay_tao) = CURRENT_DATE), 0),
                        COUNT(*) FILTER (WHERE trang_thai_don_hang = 'DANG_GIAO'),
                        COUNT(*),
                        COALESCE(SUM(tong_tien) FILTER (WHERE trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')), 0)
                    FROM silver.don_hang;
                """)
                conn.commit()

        duration = round((time.time() - start_time) * 1000, 2)
        return {
            "success": True,
            "message": "Đã ghi ảnh chụp KPI từ PostgreSQL hiện có. Đây không phải một lượt chạy DAG Bronze/Silver/Gold.",
            "action": "append_gold_kpi_snapshot",
            "operation_id": "kpi_" + uuid4().hex,
            "source": "postgres-analytics:silver.don_hang",
            "pipeline_executed": False,
            "execution_time_ms": duration,
            "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
            "logs": [
                "[Nguồn] Đọc dữ liệu silver.don_hang trong PostgreSQL analytics.",
                "[Kết quả] Ghi ảnh chụp vào gold.kpi_summary và commit thành công.",
                f"[Hoàn tất thao tác KPI] {duration} ms."
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── 6. DATA QUALITY & GOVERNANCE ───
@router.get("/api/platform/quality")
def get_data_quality():
    from services.data_coverage_service import quality_snapshot
    return quality_snapshot()


# ─── 7. DATA CATALOG & SCHEMA BROWSER ───
@router.get("/api/platform/catalog")
def get_platform_catalog():
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        t.table_schema,
                        t.table_name,
                        COALESCE(s.n_live_tup, 0) as row_count
                    FROM information_schema.tables t
                    LEFT JOIN pg_stat_user_tables s 
                        ON t.table_schema = s.schemaname AND t.table_name = s.relname
                    WHERE t.table_schema IN ('gold', 'orders', 'identity', 'menu', 'inventory', 'news')
                    ORDER BY t.table_schema, row_count DESC;
                """)
                tables = cur.fetchall()

                schema_labels = {
                    "gold": "Tầng Dữ Liệu Tinh Chế (Data Marts)",
                    "orders": "Nghiệp Vụ Đơn Hàng & Giao Dịch",
                    "identity": "Tài Khoản & Chi Nhánh Cửa Hàng",
                    "menu": "Danh Mục Món Ăn & Thức Uống",
                    "inventory": "Quản Lý Kho Hàng & Tồn Kho",
                    "news": "Truyền Thông & Tin Tức Tiếp Thị"
                }

                grouped = {}
                for r in tables:
                    s = r["table_schema"]
                    if s not in grouped:
                        grouped[s] = {
                            "schema": s,
                            "label": schema_labels.get(s, s),
                            "tables_count": 0,
                            "tables": []
                        }
                    grouped[s]["tables_count"] += 1
                    grouped[s]["tables"].append({
                        "name": r["table_name"],
                        "full_name": f"{s}.{r['table_name']}",
                        "row_count": int(r["row_count"]),
                    })

                return list(grouped.values())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/platform/table-columns/{schema_name}/{table_name}")
def get_table_columns(schema_name: str, table_name: str):
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        column_name,
                        data_type,
                        is_nullable,
                        column_default
                    FROM information_schema.columns
                    WHERE table_schema = %s AND table_name = %s
                    ORDER BY ordinal_position;
                """, (schema_name, table_name))
                cols = cur.fetchall()
                return [dict(c) for c in cols]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── LEGACY REST ENDPOINTS FOR COMPATIBILITY ───
@router.get("/api/kpi")
def get_kpis():
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM gold.kpi_summary LIMIT 1;")
                row = cur.fetchone()
                if row:
                    return dict(row)
                cur.execute("""
                    SELECT
                        COUNT(*) AS total_orders_all_time,
                        COALESCE(SUM(tong_tien) FILTER (WHERE trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')), 0) AS revenue_all_time,
                        COUNT(*) FILTER (WHERE DATE(ngay_tao) = CURRENT_DATE) AS orders_today,
                        COALESCE(SUM(tong_tien) FILTER (WHERE trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO') AND DATE(ngay_tao) = CURRENT_DATE), 0) AS revenue_today,
                        COUNT(*) FILTER (WHERE trang_thai_don_hang = 'DANG_GIAO') AS active_deliveries
                    FROM silver.don_hang;
                """)
                return dict(cur.fetchone())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/revenue-trend")
def get_revenue_trend():
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT date::text, total_orders, revenue FROM gold.revenue_daily ORDER BY date ASC LIMIT 30;")
                rows = cur.fetchall()
                return [dict(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/top-products")
def get_top_products():
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT ma_san_pham, ten_san_pham, total_quantity, total_revenue FROM gold.top_products ORDER BY total_quantity DESC LIMIT 15;")
                return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/payment-methods")
def get_payment_methods():
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT payment_method, count, revenue FROM gold.payment_methods_distribution ORDER BY count DESC;")
                return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/branch-taste")
def get_branch_taste():
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT branch_code, ten_san_pham, size_variant, order_count, total_qty, avg_order_value FROM gold.branch_taste_profile ORDER BY total_qty DESC LIMIT 50;")
                return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/realtime-events")
def get_realtime_events():
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, topic, event_key, event_type, payload, received_at::text
                    FROM public.realtime_events
                    ORDER BY id DESC LIMIT 50;
                """)
                return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
