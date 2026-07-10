"""
Bronze Layer: Raw data ingestion from PostgreSQL → MinIO (Parquet)
Reads raw tables and stores as-is in the Bronze bucket.

VERIFIED SCHEMA:
  orders.don_hang: ma_don_hang, ma_nguoi_dung, co_so_ma, tong_tien,
      dia_chi_giao_hang, phuong_thuc_thanh_toan, trang_thai_don_hang, ngay_tao, ...
  orders.chi_tiet_don_hang: id, ma_don_hang, ma_san_pham(int), ten_san_pham,
      gia_ban, so_luong, kich_co, hinh_anh_url
  orders.shipper_delivery: id, ma_don_hang, shipper_id, status,
      assigned_at, picked_up_at, delivered_at, delivery_fee, ...
"""
import os
import io
import logging
from datetime import datetime

import pandas as pd
import sqlalchemy
import boto3
from botocore.client import Config

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("bronze")

DB_HOST     = os.getenv("DB_HOST", "postgres-db")
DB_PORT     = os.getenv("DB_PORT", "5432")
DB_USER     = os.getenv("DB_USER", "admin")
DB_PASSWORD = os.getenv("DB_PASSWORD", "123")
DB_NAME     = os.getenv("DB_NAME", "avengers_coffee")

MINIO_ENDPOINT   = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin123")
BRONZE_BUCKET    = "avengers-bronze"

RUN_DATE = datetime.now().strftime("%Y/%m/%d")


def get_engine():
    url = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    return sqlalchemy.create_engine(url)


def get_minio():
    return boto3.client(
        "s3", endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
        config=Config(signature_version="s3v4"),
    )


def ensure_bucket(s3, bucket: str):
    try:
        s3.head_bucket(Bucket=bucket)
    except Exception:
        try:
            s3.create_bucket(Bucket=bucket)
        except Exception:
            pass


def upload_parquet(s3, df: pd.DataFrame, key: str):
    ensure_bucket(s3, BRONZE_BUCKET)
    buf = io.BytesIO()
    df.to_parquet(buf, index=False, engine="pyarrow")
    buf.seek(0)
    s3.put_object(Bucket=BRONZE_BUCKET, Key=key, Body=buf.read())
    logger.info(f"Uploaded {len(df)} rows → s3://{BRONZE_BUCKET}/{key}")


# Correct column names verified from entity files
QUERIES = {
    "orders": """
        SELECT
            ma_don_hang::text, ma_nguoi_dung, co_so_ma, tong_tien,
            dia_chi_giao_hang, loai_don_hang, phuong_thuc_thanh_toan,
            trang_thai_thanh_toan, trang_thai_don_hang,
            ghi_chu, ngay_tao, ngay_cap_nhat
        FROM orders.don_hang
    """,
    "order_items": """
        SELECT
            id, ma_don_hang::text, ma_san_pham, ten_san_pham,
            gia_ban, so_luong, kich_co
        FROM orders.chi_tiet_don_hang
    """,
    "shipper_deliveries": """
        SELECT
            id::text, ma_don_hang::text, shipper_id::text,
            status, delivery_address, delivery_fee,
            assigned_at, picked_up_at, delivered_at
        FROM orders.shipper_delivery
    """,
}


def main():
    logger.info("=== Bronze Layer Starting ===")
    engine = get_engine()
    s3 = get_minio()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    for name, sql in QUERIES.items():
        try:
            df = pd.read_sql(sql, engine)
            df["_ingested_at"] = datetime.now().isoformat()
            key = f"{RUN_DATE}/{name}/{name}_{timestamp}.parquet"
            upload_parquet(s3, df, key)
        except Exception as e:
            logger.warning(f"Skipped {name}: {e}")

    logger.info("=== Bronze Layer Done ===")


if __name__ == "__main__":
    main()
