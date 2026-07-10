"""
Gold Layer: Aggregations from PostgreSQL → MinIO Gold bucket (JSON).
Ready-to-consume datasets for Streamlit dashboard.

Uses VERIFIED column names:
  don_hang: ma_nguoi_dung (NOT khach_hang_id), tong_tien, co_so_ma, etc.
  chi_tiet_don_hang: gia_ban (NOT don_gia), ten_san_pham, ma_san_pham(int)
"""
import os
import io
import json
import logging
from datetime import datetime

import pandas as pd
import boto3
from botocore.client import Config
import sqlalchemy

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("gold")

MINIO_ENDPOINT   = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin123")
GOLD_BUCKET = "avengers-gold"

DB_HOST     = os.getenv("DB_HOST", "postgres-db")
DB_PORT     = os.getenv("DB_PORT", "5432")
DB_USER     = os.getenv("DB_USER", "admin")
DB_PASSWORD = os.getenv("DB_PASSWORD", "123")
DB_NAME     = os.getenv("DB_NAME", "avengers_coffee")


def get_minio():
    return boto3.client(
        "s3", endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
        config=Config(signature_version="s3v4"),
    )


def get_engine():
    return sqlalchemy.create_engine(
        f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    )


def ensure_bucket(s3, bucket: str):
    try:
        s3.head_bucket(Bucket=bucket)
    except Exception:
        try:
            s3.create_bucket(Bucket=bucket)
        except Exception:
            pass


def upload_json(s3, data, key: str):
    ensure_bucket(s3, GOLD_BUCKET)
    body = json.dumps(data, default=str, ensure_ascii=False, indent=2).encode("utf-8")
    s3.put_object(Bucket=GOLD_BUCKET, Key=key, Body=body, ContentType="application/json")
    logger.info(f"Saved JSON → s3://{GOLD_BUCKET}/{key}")


def main():
    logger.info("=== Gold Layer Starting ===")
    s3 = get_minio()
    engine = get_engine()

    # 1. KPI Summary
    try:
        df = pd.read_sql("""
            SELECT
                COUNT(*) FILTER (WHERE DATE(ngay_tao) = CURRENT_DATE) AS orders_today,
                COUNT(*) FILTER (WHERE trang_thai_don_hang = 'HOAN_THANH'
                                   AND DATE(ngay_tao) = CURRENT_DATE) AS completed_today,
                COALESCE(SUM(tong_tien) FILTER (
                    WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                    AND DATE(ngay_tao) = CURRENT_DATE
                ), 0) AS revenue_today,
                COUNT(*) FILTER (WHERE trang_thai_don_hang = 'DANG_GIAO') AS active_deliveries,
                COUNT(*) AS total_orders_all_time,
                COALESCE(SUM(tong_tien) FILTER (
                    WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                ), 0) AS revenue_all_time
            FROM orders.don_hang
        """, engine)
        upload_json(s3, df.to_dict(orient="records")[0], "kpi/latest.json")
    except Exception as e:
        logger.warning(f"KPI error: {e}")

    # 2. Revenue by Day (last 30 days)
    try:
        df = pd.read_sql("""
            SELECT DATE(ngay_tao)::text AS date, COUNT(*) AS total_orders,
                   COALESCE(SUM(tong_tien) FILTER (
                       WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                   ), 0) AS revenue
            FROM orders.don_hang
            WHERE ngay_tao >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY DATE(ngay_tao) ORDER BY date
        """, engine)
        upload_json(s3, df.to_dict(orient="records"), "revenue_daily/latest.json")
    except Exception as e:
        logger.warning(f"Revenue daily error: {e}")

    # 3. Top Products — uses gia_ban
    try:
        df = pd.read_sql("""
            SELECT ct.ma_san_pham, ct.ten_san_pham,
                   SUM(ct.so_luong) AS total_quantity,
                   SUM(ct.so_luong * ct.gia_ban) AS total_revenue
            FROM orders.chi_tiet_don_hang ct
            JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
            WHERE d.ngay_tao >= CURRENT_DATE - INTERVAL '30 days'
              AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
            GROUP BY ct.ma_san_pham, ct.ten_san_pham
            ORDER BY total_quantity DESC LIMIT 20
        """, engine)
        upload_json(s3, df.to_dict(orient="records"), "top_products/latest.json")
    except Exception as e:
        logger.warning(f"Top products error: {e}")

    # 4. Customer Segments — uses ma_nguoi_dung
    try:
        df = pd.read_sql("""
            SELECT ma_nguoi_dung::text AS customer_id,
                   COUNT(*) AS order_count,
                   COALESCE(SUM(tong_tien) FILTER (
                       WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                   ), 0) AS lifetime_value
            FROM orders.don_hang
            WHERE ma_nguoi_dung IS NOT NULL
            GROUP BY ma_nguoi_dung
        """, engine)
        if len(df) > 0:
            df["segment"] = pd.cut(
                df["order_count"], bins=[0, 1, 3, 10, float("inf")],
                labels=["Khách mới", "Thông thường", "Trung thành", "VIP"],
            ).astype(str)
            seg = df.groupby("segment").agg(
                count=("customer_id", "count"),
                avg_ltv=("lifetime_value", "mean"),
            ).reset_index()
            upload_json(s3, seg.to_dict(orient="records"), "customer_segments/latest.json")
    except Exception as e:
        logger.warning(f"Customer segments error: {e}")

    # 5. Shipper Performance
    try:
        df = pd.read_sql("""
            SELECT shipper_id::text, COUNT(*) AS total_deliveries,
                   COUNT(*) FILTER (WHERE status = 'DELIVERED') AS completed,
                   COUNT(*) FILTER (WHERE status = 'FAILED') AS failed,
                   ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'DELIVERED')
                         / NULLIF(COUNT(*), 0), 1) AS success_rate,
                   ROUND(AVG(EXTRACT(EPOCH FROM (delivered_at - assigned_at)) / 60)
                         FILTER (WHERE delivered_at IS NOT NULL), 1) AS avg_delivery_min
            FROM orders.shipper_delivery
            GROUP BY shipper_id ORDER BY completed DESC LIMIT 20
        """, engine)
        upload_json(s3, df.to_dict(orient="records"), "shipper_performance/latest.json")
    except Exception as e:
        logger.warning(f"Shipper performance error: {e}")

    # 6. Order Status Distribution
    try:
        df = pd.read_sql("""
            SELECT trang_thai_don_hang AS status, COUNT(*) AS count,
                   ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
            FROM orders.don_hang
            WHERE ngay_tao >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY trang_thai_don_hang ORDER BY count DESC
        """, engine)
        upload_json(s3, df.to_dict(orient="records"), "order_status/latest.json")
    except Exception as e:
        logger.warning(f"Order status error: {e}")

    # 7. Payment Method Distribution
    try:
        df = pd.read_sql("""
            SELECT phuong_thuc_thanh_toan AS payment_method,
                   COUNT(*) AS count, COALESCE(SUM(tong_tien), 0) AS revenue
            FROM orders.don_hang
            WHERE ngay_tao >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY phuong_thuc_thanh_toan ORDER BY count DESC
        """, engine)
        upload_json(s3, df.to_dict(orient="records"), "payment_methods/latest.json")
    except Exception as e:
        logger.warning(f"Payment method error: {e}")

    # Pipeline metadata
    upload_json(s3, {"last_run": datetime.now().isoformat(), "status": "success"}, "pipeline_meta/latest.json")

    logger.info("=== Gold Layer Done ===")


if __name__ == "__main__":
    main()
