"""
Silver Layer: Clean, normalize, and join data from Bronze → Silver bucket.
Uses verified column names from entity files.
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
        "s3", endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
        config=Config(signature_version="s3v4"),
    )


def get_latest_df(s3, table_name: str) -> pd.DataFrame | None:
    """Find and read the latest parquet file for a given table name."""
    try:
        all_keys = []
        paginator = s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=BRONZE_BUCKET, Prefix=""):
            for obj in page.get("Contents", []):
                if f"/{table_name}/" in obj["Key"] and obj["Key"].endswith(".parquet"):
                    all_keys.append((obj["Key"], obj["LastModified"]))
        if not all_keys:
            return None
        latest = sorted(all_keys, key=lambda x: x[1], reverse=True)[0][0]
        obj = s3.get_object(Bucket=BRONZE_BUCKET, Key=latest)
        df = pd.read_parquet(io.BytesIO(obj["Body"].read()))
        logger.info(f"Read {len(df)} rows from s3://{BRONZE_BUCKET}/{latest}")
        return df
    except Exception as e:
        logger.warning(f"Could not read {table_name}: {e}")
        return None


def ensure_bucket(s3, bucket: str):
    try:
        s3.head_bucket(Bucket=bucket)
    except Exception:
        try:
            s3.create_bucket(Bucket=bucket)
        except Exception:
            pass


def upload_parquet(s3, df: pd.DataFrame, bucket: str, key: str):
    ensure_bucket(s3, bucket)
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

    orders      = get_latest_df(s3, "orders")
    items       = get_latest_df(s3, "order_items")
    deliveries  = get_latest_df(s3, "shipper_deliveries")

    if orders is None:
        logger.warning("No orders data found in Bronze. Skipping Silver.")
        return

    # 1. Clean Orders
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

    # 2. Clean Items & Enriched Orders
    if items is not None and "ma_don_hang" in items.columns:
        items = items.copy()
        items["so_luong"] = pd.to_numeric(items.get("so_luong", 0), errors="coerce").fillna(0).astype(int)
        items["gia_ban"]  = pd.to_numeric(items.get("gia_ban", 0), errors="coerce").fillna(0)
        items["line_total"] = items["so_luong"] * items["gia_ban"]
        items["kich_co"] = items["kich_co"].fillna("Standard") if "kich_co" in items.columns else "Standard"
        items["_processed_at"] = datetime.now().isoformat()
        upload_parquet(s3, items, SILVER_BUCKET, f"{today}/items_clean/{ts}.parquet")

        items_summary = items.groupby("ma_don_hang").agg(
            total_items=("so_luong", "sum"),
            line_total=("line_total", "sum"),
        ).reset_index()
        enriched = orders.merge(items_summary, on="ma_don_hang", how="left")
        upload_parquet(s3, enriched, SILVER_BUCKET, f"{today}/orders_enriched/{ts}.parquet")

    # 3. Clean Delivery metrics
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

    # 4. Clean Wallet Transactions (if present in Bronze)
    wallet_tx = get_latest_df(s3, "wallet_transactions")
    if wallet_tx is not None:
        try:
            w = wallet_tx.copy()
            if "amount" in w.columns:
                w["amount"] = pd.to_numeric(w["amount"], errors="coerce").fillna(0)
            if "created_at" in w.columns:
                w["created_at"] = pd.to_datetime(w["created_at"], errors="coerce")
            w["_processed_at"] = datetime.now().isoformat()
            upload_parquet(s3, w, SILVER_BUCKET, f"{today}/wallet_transactions_clean/{ts}.parquet")
        except Exception as e:
            logger.warning(f"Error processing wallet transactions in Silver: {e}")

    # 5. Clean Delivery Tracking (if present in Bronze)
    deliv_track = get_latest_df(s3, "delivery_tracking")
    if deliv_track is not None:
        try:
            dt = deliv_track.copy()
            if "delivery_fee" in dt.columns:
                dt["delivery_fee"] = pd.to_numeric(dt["delivery_fee"], errors="coerce").fillna(0)
            if "estimated_minutes" in dt.columns:
                dt["estimated_minutes"] = pd.to_numeric(dt["estimated_minutes"], errors="coerce").fillna(0)
            if "created_at" in dt.columns:
                dt["created_at"] = pd.to_datetime(dt["created_at"], errors="coerce")
            dt["_processed_at"] = datetime.now().isoformat()
            upload_parquet(s3, dt, SILVER_BUCKET, f"{today}/delivery_tracking_clean/{ts}.parquet")
        except Exception as e:
            logger.warning(f"Error processing delivery tracking in Silver: {e}")

    logger.info("=== Silver Layer Done ===")


if __name__ == "__main__":
    main()
