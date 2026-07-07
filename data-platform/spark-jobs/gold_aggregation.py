"""
Gold Layer: Aggregations → ready-to-consume datasets for dashboards.
Reads from Silver, produces Gold aggregations in MinIO.
"""
import os
import io
import json
import logging
from datetime import datetime, timedelta

import pandas as pd
import boto3
from botocore.client import Config
import sqlalchemy

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("gold")

MINIO_ENDPOINT   = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin123")
SILVER_BUCKET = "avengers-silver"
GOLD_BUCKET   = "avengers-gold"

DB_HOST     = os.getenv("DB_HOST", "postgres-db")
DB_PORT     = os.getenv("DB_PORT", "5432")
DB_USER     = os.getenv("DB_USER", "admin")
DB_PASSWORD = os.getenv("DB_PASSWORD", "123")
DB_NAME     = os.getenv("DB_NAME", "avengers_coffee")


def get_minio():
    return boto3.client(
        "s3",
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
        config=Config(signature_version="s3v4"),
    )


def get_engine():
    url = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    return sqlalchemy.create_engine(url)


def upload_json(s3, data, bucket: str, key: str):
    body = json.dumps(data, default=str, ensure_ascii=False, indent=2).encode("utf-8")
    s3.put_object(Bucket=bucket, Key=key, Body=body, ContentType="application/json")
    logger.info(f"Saved JSON → s3://{bucket}/{key}")


def upload_parquet(s3, df: pd.DataFrame, bucket: str, key: str):
    buf = io.BytesIO()
    df.to_parquet(buf, index=False)
    buf.seek(0)
    s3.put_object(Bucket=bucket, Key=key, Body=buf.read())
    logger.info(f"Saved {len(df)} rows → s3://{bucket}/{key}")


def main():
    logger.info("=== Gold Layer Starting ===")
    s3 = get_minio()
    engine = get_engine()
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    today = datetime.now().strftime("%Y/%m/%d")

    # All aggregations read from PostgreSQL directly (most accurate for Gold)
    gold = {}

    # ── 1. KPI Summary ─────────────────────────────────────────────────────────
    try:
        kpi_sql = """
            SELECT
                COUNT(*) FILTER (WHERE DATE(ngay_tao) = CURRENT_DATE)            AS orders_today,
                COUNT(*) FILTER (WHERE trang_thai_don_hang = 'HOAN_THANH'
                                   AND DATE(ngay_tao) = CURRENT_DATE)            AS completed_today,
                COALESCE(SUM(tong_tien) FILTER (
                    WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                    AND DATE(ngay_tao) = CURRENT_DATE
                ), 0)                                                              AS revenue_today,
                COUNT(*) FILTER (WHERE trang_thai_don_hang = 'DANG_GIAO')         AS active_deliveries,
                COUNT(*) FILTER (WHERE trang_thai_don_hang = 'MOI_TAO')           AS pending_orders,
                COUNT(*) FILTER (WHERE trang_thai_don_hang = 'DA_HUY'
                                   AND DATE(ngay_tao) = CURRENT_DATE)            AS cancelled_today,
                COUNT(DISTINCT DATE(ngay_tao))                                    AS total_active_days,
                COUNT(*)                                                           AS total_orders_all_time,
                COALESCE(SUM(tong_tien) FILTER (
                    WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                ), 0)                                                              AS revenue_all_time
            FROM orders.don_hang
        """
        df = pd.read_sql(kpi_sql, engine)
        gold["kpi"] = df.to_dict(orient="records")[0]
        upload_json(s3, gold["kpi"], GOLD_BUCKET, f"kpi/latest.json")
    except Exception as e:
        logger.warning(f"KPI error: {e}")

    # ── 2. Revenue by Day (last 30 days) ───────────────────────────────────────
    try:
        sql = """
            SELECT
                DATE(ngay_tao)::text AS date,
                COUNT(*) AS total_orders,
                COUNT(*) FILTER (WHERE trang_thai_don_hang = 'HOAN_THANH') AS completed,
                COALESCE(SUM(tong_tien) FILTER (
                    WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                ), 0) AS revenue
            FROM orders.don_hang
            WHERE ngay_tao >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY DATE(ngay_tao)
            ORDER BY DATE(ngay_tao)
        """
        df = pd.read_sql(sql, engine)
        upload_parquet(s3, df, GOLD_BUCKET, f"revenue_daily/{ts}.parquet")
        upload_json(s3, df.to_dict(orient="records"), GOLD_BUCKET, "revenue_daily/latest.json")
    except Exception as e:
        logger.warning(f"Revenue daily error: {e}")

    # ── 3. Revenue by Hour (today) ─────────────────────────────────────────────
    try:
        sql = """
            SELECT
                EXTRACT(HOUR FROM ngay_tao)::int AS hour,
                COUNT(*) AS total_orders,
                COALESCE(SUM(tong_tien), 0) AS revenue
            FROM orders.don_hang
            WHERE DATE(ngay_tao) = CURRENT_DATE
            GROUP BY EXTRACT(HOUR FROM ngay_tao)
            ORDER BY hour
        """
        df = pd.read_sql(sql, engine)
        upload_json(s3, df.to_dict(orient="records"), GOLD_BUCKET, "revenue_hourly/latest.json")
    except Exception as e:
        logger.warning(f"Revenue hourly error: {e}")

    # ── 4. Revenue by Branch ───────────────────────────────────────────────────
    try:
        sql = """
            SELECT
                COALESCE(co_so_ma, 'Unknown') AS branch,
                COUNT(*) AS total_orders,
                COALESCE(SUM(tong_tien) FILTER (
                    WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                ), 0) AS revenue,
                ROUND(AVG(tong_tien)::numeric, 0) AS avg_order_value
            FROM orders.don_hang
            WHERE ngay_tao >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY co_so_ma
            ORDER BY revenue DESC
        """
        df = pd.read_sql(sql, engine)
        upload_json(s3, df.to_dict(orient="records"), GOLD_BUCKET, "revenue_by_branch/latest.json")
    except Exception as e:
        logger.warning(f"Revenue by branch error: {e}")

    # ── 5. Top Products ────────────────────────────────────────────────────────
    try:
        sql = """
            SELECT
                ct.ma_san_pham::text AS product_id,
                COUNT(*) AS times_ordered,
                SUM(ct.so_luong) AS total_quantity,
                SUM(ct.so_luong * ct.don_gia) AS total_revenue
            FROM orders.chi_tiet_don_hang ct
            JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
            WHERE d.ngay_tao >= CURRENT_DATE - INTERVAL '30 days'
              AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
            GROUP BY ct.ma_san_pham
            ORDER BY total_quantity DESC
            LIMIT 20
        """
        df = pd.read_sql(sql, engine)
        upload_json(s3, df.to_dict(orient="records"), GOLD_BUCKET, "top_products/latest.json")
    except Exception as e:
        logger.warning(f"Top products error: {e}")

    # ── 6. Customer Segments ───────────────────────────────────────────────────
    try:
        sql = """
            SELECT
                khach_hang_id::text,
                COUNT(*) AS order_count,
                COALESCE(SUM(tong_tien) FILTER (
                    WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                ), 0) AS lifetime_value,
                MIN(ngay_tao) AS first_order,
                MAX(ngay_tao) AS last_order
            FROM orders.don_hang
            WHERE khach_hang_id IS NOT NULL
            GROUP BY khach_hang_id
        """
        df = pd.read_sql(sql, engine)
        if len(df) > 0:
            df["segment"] = pd.cut(
                df["order_count"],
                bins=[0, 1, 3, 10, float("inf")],
                labels=["Khách mới", "Thông thường", "Trung thành", "VIP"],
            ).astype(str)
            seg_summary = df.groupby("segment").agg(
                count=("khach_hang_id", "count"),
                avg_ltv=("lifetime_value", "mean"),
            ).reset_index()
            upload_json(s3, seg_summary.to_dict(orient="records"), GOLD_BUCKET, "customer_segments/latest.json")
    except Exception as e:
        logger.warning(f"Customer segments error: {e}")

    # ── 7. Shipper Performance ─────────────────────────────────────────────────
    try:
        sql = """
            SELECT
                sd.shipper_id::text,
                COUNT(*) AS total_deliveries,
                COUNT(*) FILTER (WHERE sd.status = 'DELIVERED') AS completed,
                COUNT(*) FILTER (WHERE sd.status = 'FAILED') AS failed,
                ROUND(
                    100.0 * COUNT(*) FILTER (WHERE sd.status = 'DELIVERED')
                    / NULLIF(COUNT(*), 0)
                , 1) AS success_rate,
                ROUND(AVG(
                    EXTRACT(EPOCH FROM (sd.delivered_at - sd.assigned_at)) / 60
                ) FILTER (WHERE sd.delivered_at IS NOT NULL AND sd.assigned_at IS NOT NULL), 1) AS avg_delivery_min
            FROM orders.shipper_delivery sd
            GROUP BY sd.shipper_id
            ORDER BY completed DESC
            LIMIT 20
        """
        df = pd.read_sql(sql, engine)
        upload_json(s3, df.to_dict(orient="records"), GOLD_BUCKET, "shipper_performance/latest.json")
    except Exception as e:
        logger.warning(f"Shipper performance error: {e}")

    # ── 8. Order Status Distribution ───────────────────────────────────────────
    try:
        sql = """
            SELECT
                trang_thai_don_hang AS status,
                COUNT(*) AS count,
                ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
            FROM orders.don_hang
            WHERE ngay_tao >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY trang_thai_don_hang
            ORDER BY count DESC
        """
        df = pd.read_sql(sql, engine)
        upload_json(s3, df.to_dict(orient="records"), GOLD_BUCKET, "order_status/latest.json")
    except Exception as e:
        logger.warning(f"Order status error: {e}")

    # ── 9. Payment Method Distribution ────────────────────────────────────────
    try:
        sql = """
            SELECT
                phuong_thuc_thanh_toan AS payment_method,
                COUNT(*) AS count,
                COALESCE(SUM(tong_tien), 0) AS revenue
            FROM orders.don_hang
            WHERE ngay_tao >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY phuong_thuc_thanh_toan
            ORDER BY count DESC
        """
        df = pd.read_sql(sql, engine)
        upload_json(s3, df.to_dict(orient="records"), GOLD_BUCKET, "payment_methods/latest.json")
    except Exception as e:
        logger.warning(f"Payment method error: {e}")

    # ── 10. Pipeline Metadata ──────────────────────────────────────────────────
    meta = {
        "last_run": datetime.now().isoformat(),
        "status": "success",
        "datasets": list(gold.keys()),
    }
    upload_json(s3, meta, GOLD_BUCKET, "pipeline_meta/latest.json")

    logger.info("=== Gold Layer Done ===")


if __name__ == "__main__":
    main()
