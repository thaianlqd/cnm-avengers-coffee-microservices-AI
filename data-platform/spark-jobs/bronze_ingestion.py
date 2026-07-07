"""
Bronze Layer: Raw data ingestion from PostgreSQL → MinIO (Parquet)
Reads raw tables and stores as-is in the Bronze bucket.
"""
import os
import json
import logging
from datetime import datetime

import pandas as pd
import sqlalchemy
import boto3
from botocore.client import Config

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("bronze")

# ─── Config ───────────────────────────────────────────────────────────────────
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
        "s3",
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
        config=Config(signature_version="s3v4"),
    )


def upload_parquet(s3, df: pd.DataFrame, key: str):
    import io
    buf = io.BytesIO()
    df.to_parquet(buf, index=False, engine="pyarrow")
    buf.seek(0)
    s3.put_object(Bucket=BRONZE_BUCKET, Key=key, Body=buf.read())
    logger.info(f"Uploaded {len(df)} rows → s3://{BRONZE_BUCKET}/{key}")


QUERIES = {
    "orders": """
        SELECT
            ma_don_hang::text AS ma_don_hang,
            khach_hang_id::text AS khach_hang_id,
            trang_thai_don_hang,
            phuong_thuc_thanh_toan,
            loai_don,
            tong_tien,
            co_so_ma,
            ghi_chu,
            ngay_tao,
            ngay_cap_nhat
        FROM orders.don_hang
    """,
    "order_items": """
        SELECT
            ma_chi_tiet::text AS ma_chi_tiet,
            ma_don_hang::text AS ma_don_hang,
            ma_san_pham::text AS ma_san_pham,
            so_luong,
            don_gia,
            ghi_chu
        FROM orders.chi_tiet_don_hang
    """,
    "shipper_deliveries": """
        SELECT
            id::text AS id,
            ma_don_hang::text AS ma_don_hang,
            shipper_id::text AS shipper_id,
            status,
            assigned_at,
            picked_up_at,
            delivered_at,
            delivery_fee,
            cod_amount,
            fail_reason,
            delivery_address
        FROM orders.shipper_delivery
    """,
}

IDENTITY_QUERIES = {
    "users": """
        SELECT
            id::text AS id,
            ho_ten,
            email,
            so_dien_thoai,
            vai_tro,
            trang_thai,
            ngay_tao
        FROM identity.nguoi_dung
    """,
}

MENU_QUERIES = {
    "products": """
        SELECT
            ma_san_pham::text AS ma_san_pham,
            ten_san_pham,
            gia,
            danh_muc,
            trang_thai,
            mo_ta
        FROM menu.san_pham
    """,
}


def main():
    logger.info("=== Bronze Layer Starting ===")
    engine = get_engine()
    s3 = get_minio()

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    for name, sql in {**QUERIES, **IDENTITY_QUERIES, **MENU_QUERIES}.items():
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
