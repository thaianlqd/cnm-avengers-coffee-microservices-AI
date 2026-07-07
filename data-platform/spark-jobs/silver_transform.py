"""
Silver Layer: Clean, normalize, and join data from Bronze → Silver bucket.
Produces joined, clean datasets ready for analytics.
"""
import os
import io
import logging
from datetime import datetime

import pandas as pd
import boto3
from botocore.client import Config

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("silver")

MINIO_ENDPOINT   = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin123")
BRONZE_BUCKET = "avengers-bronze"
SILVER_BUCKET = "avengers-silver"


def get_minio():
    return boto3.client(
        "s3",
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
        config=Config(signature_version="s3v4"),
    )


def read_latest_parquet(s3, prefix: str) -> pd.DataFrame | None:
    """Find and read the latest parquet file under prefix."""
    try:
        resp = s3.list_objects_v2(Bucket=BRONZE_BUCKET, Prefix=prefix)
        if "Contents" not in resp:
            return None
        # Sort by LastModified descending
        files = sorted(resp["Contents"], key=lambda x: x["LastModified"], reverse=True)
        key = files[0]["Key"]
        obj = s3.get_object(Bucket=BRONZE_BUCKET, Key=key)
        df = pd.read_parquet(io.BytesIO(obj["Body"].read()))
        logger.info(f"Read {len(df)} rows from s3://{BRONZE_BUCKET}/{key}")
        return df
    except Exception as e:
        logger.warning(f"Could not read {prefix}: {e}")
        return None


def upload_parquet(s3, df: pd.DataFrame, bucket: str, key: str):
    buf = io.BytesIO()
    df.to_parquet(buf, index=False, engine="pyarrow")
    buf.seek(0)
    s3.put_object(Bucket=bucket, Key=key, Body=buf.read())
    logger.info(f"Saved {len(df)} rows → s3://{bucket}/{key}")


def main():
    logger.info("=== Silver Layer Starting ===")
    s3 = get_minio()
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    today = datetime.now().strftime("%Y/%m/%d")

    # Read Bronze data
    orders_df = read_latest_parquet(s3, "")

    # Try to find latest files for each table
    paginator = s3.get_paginator("list_objects_v2")

    def get_latest_df(table_name: str) -> pd.DataFrame | None:
        all_keys = []
        for page in paginator.paginate(Bucket=BRONZE_BUCKET, Prefix=""):
            for obj in page.get("Contents", []):
                if f"/{table_name}/" in obj["Key"] and obj["Key"].endswith(".parquet"):
                    all_keys.append((obj["Key"], obj["LastModified"]))
        if not all_keys:
            return None
        latest = sorted(all_keys, key=lambda x: x[1], reverse=True)[0][0]
        obj = s3.get_object(Bucket=BRONZE_BUCKET, Key=latest)
        return pd.read_parquet(io.BytesIO(obj["Body"].read()))

    orders      = get_latest_df("orders")
    items       = get_latest_df("order_items")
    deliveries  = get_latest_df("shipper_deliveries")
    users       = get_latest_df("users")
    products    = get_latest_df("products")

    if orders is None:
        logger.warning("No orders data found in Bronze. Skipping Silver.")
        return

    # ── Clean Orders ───────────────────────────────────────────────────────────
    orders = orders.copy()
    if "ngay_tao" in orders.columns:
        orders["ngay_tao"] = pd.to_datetime(orders["ngay_tao"], errors="coerce")
        orders["date"] = orders["ngay_tao"].dt.date
        orders["hour"] = orders["ngay_tao"].dt.hour
        orders["month"] = orders["ngay_tao"].dt.to_period("M").astype(str)
    if "tong_tien" in orders.columns:
        orders["tong_tien"] = pd.to_numeric(orders["tong_tien"], errors="coerce").fillna(0)
    orders["_processed_at"] = datetime.now().isoformat()
    upload_parquet(s3, orders, SILVER_BUCKET, f"{today}/orders_clean/{ts}.parquet")

    # ── Enriched Orders (join with items summary) ──────────────────────────────
    if items is not None and "ma_don_hang" in items.columns:
        items["so_luong"] = pd.to_numeric(items.get("so_luong", 0), errors="coerce").fillna(0)
        items["don_gia"]  = pd.to_numeric(items.get("don_gia", 0), errors="coerce").fillna(0)
        items["line_total"] = items["so_luong"] * items["don_gia"]
        items_summary = items.groupby("ma_don_hang").agg(
            total_items=("so_luong", "sum"),
            line_total=("line_total", "sum"),
        ).reset_index()
        enriched = orders.merge(items_summary, on="ma_don_hang", how="left")
        upload_parquet(s3, enriched, SILVER_BUCKET, f"{today}/orders_enriched/{ts}.parquet")

    # ── Delivery metrics ───────────────────────────────────────────────────────
    if deliveries is not None:
        d = deliveries.copy()
        for col in ["assigned_at", "picked_up_at", "delivered_at"]:
            if col in d.columns:
                d[col] = pd.to_datetime(d[col], errors="coerce")
        if "assigned_at" in d.columns and "delivered_at" in d.columns:
            d["delivery_duration_min"] = (
                (d["delivered_at"] - d["assigned_at"]).dt.total_seconds() / 60
            ).round(2)
        d["_processed_at"] = datetime.now().isoformat()
        upload_parquet(s3, d, SILVER_BUCKET, f"{today}/deliveries_clean/{ts}.parquet")

    logger.info("=== Silver Layer Done ===")


if __name__ == "__main__":
    main()
