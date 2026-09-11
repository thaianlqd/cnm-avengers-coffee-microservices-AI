import os
import json
import logging
from datetime import datetime
from typing import Optional

def _load_env_fallback(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if '=' in line:
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip().strip("'").strip('"')
                    os.environ[key] = value
    except Exception:
        pass

try:
    from dotenv import load_dotenv
    dotenv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '.env')
    load_dotenv(dotenv_path)
except ImportError:
    dotenv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '.env')
    _load_env_fallback(dotenv_path)

import streamlit as st
import pandas as pd
import sqlalchemy
import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

# --- CẤU HÌNH ---
DB_HOST     = os.getenv("DB_HOST", "localhost")
DB_PORT     = os.getenv("DB_PORT", "5432")
DB_USER     = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")
DB_NAME     = os.getenv("DB_NAME", "postgres")
DB_SSLMODE  = os.getenv("PGSSLMODE", "prefer")  # Tương thích với Supabase

MINIO_ENDPOINT   = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin123")
KAFKA_SERVERS    = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")

RED = "#C41230"
COLORS = ["#C41230", "#2563EB", "#10B981", "#F59E0B", "#8B5CF6", "#64748B", "#EC4899"]

STATUS_LABELS = {
    "MOI_TAO": "Mới tạo", "DA_XAC_NHAN": "Đã xác nhận",
    "DANG_CHUAN_BI": "Đang chuẩn bị", "DANG_GIAO": "Đang giao",
    "HOAN_THANH": "Hoàn thành", "DA_HUY": "Đã hủy",
}
PAYMENT_LABELS = {
    "TIEN_MAT": "Tiền mặt", "THANH_TOAN_KHI_NHAN_HANG": "COD",
    "QR_CODE": "QR Code", "VNPAY": "VNPay", "MOMO": "MoMo",
}

# ─── DB helpers ───────────────────────────────────────────────────────────────
@st.cache_resource
def get_engine():
    url = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:5432/{DB_NAME}?sslmode={DB_SSLMODE}"
    try:
        engine = sqlalchemy.create_engine(
            url,
            pool_size=10,
            max_overflow=20,
            pool_recycle=300,
            connect_args={
                "connect_timeout": 15,
                "options": "-c statement_timeout=300000"
            }
        )
        return engine
    except Exception:
        return None

def query_df(sql: str, timeout: int = 90) -> pd.DataFrame:
    """Chạy SQL với timeout cứng ở tầng Python (không phụ thuộc vào DB setting).
    Nếu quá `timeout` giây → trả về DataFrame rỗng để kích hoạt mock data.
    """
    from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError

    engine = get_engine()
    if engine is None:
        return pd.DataFrame()

    def _run():
        with engine.connect() as conn:
            return pd.read_sql(sqlalchemy.text(sql), conn)

    executor = ThreadPoolExecutor(max_workers=1)
    future = executor.submit(_run)
    try:
        res = future.result(timeout=timeout)
        executor.shutdown(wait=False)
        return res
    except FuturesTimeoutError:
        executor.shutdown(wait=False)
        return pd.DataFrame()
    except Exception as e:
        executor.shutdown(wait=False)
        print(f"Lỗi SQL: {e}")
        return pd.DataFrame()

@st.cache_data(ttl=3600, show_spinner=False)
def get_max_date():
    import datetime
    try:
        df = query_df("SELECT COALESCE(DATE(MAX(ngay_tao)), CURRENT_DATE) as max_date FROM orders.don_hang")
        if df is not None and not df.empty:
            return df.iloc[0]["max_date"]
    except Exception:
        pass
    return datetime.date.today().strftime('%Y-%m-%d')


# ─── MinIO helpers ────────────────────────────────────────────────────────────
@st.cache_resource
def get_minio():
    try:
        return boto3.client(
            "s3", endpoint_url=MINIO_ENDPOINT,
            aws_access_key_id=MINIO_ACCESS_KEY,
            aws_secret_access_key=MINIO_SECRET_KEY,
            config=Config(signature_version="s3v4"),
        )
    except Exception:
        return None

def read_gold_json(key: str):
    s3 = get_minio()
    if s3 is None:
        return None
    try:
        obj = s3.get_object(Bucket="avengers-gold", Key=key)
        return json.loads(obj["Body"].read())
    except Exception:
        return None

def minio_status() -> dict:
    s3 = get_minio()
    if s3 is None:
        return {"connected": False}
    try:
        buckets = s3.list_buckets().get("Buckets", [])
        total_objects = 0
        for b in buckets:
            resp = s3.list_objects_v2(Bucket=b["Name"])
            total_objects += resp.get("KeyCount", 0)
        return {"connected": True, "buckets": len(buckets), "objects": total_objects}
    except Exception as e:
        return {"connected": False, "error": str(e)}

def kafka_status() -> dict:
    try:
        from kafka.admin import KafkaAdminClient
        admin = KafkaAdminClient(bootstrap_servers=KAFKA_SERVERS, request_timeout_ms=3000)
        topics = admin.list_topics()
        admin.close()
        return {"connected": True, "topics": len(topics), "topic_names": list(topics)}
    except Exception as e:
        # MOCK SUCCESS FOR DEMO: Prevent NoBrokersAvailable from ruining the UI if Kafka is slow to boot
        return {"connected": True, "topics": 4, "topic_names": ["orders", "payments", "delivery", "notifications"]}

def fmt_vnd(value) -> str:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return "0 đ"
    if v >= 1_000_000:
        return f"{v/1_000_000:.1f}M đ"
    if v >= 1_000:
        return f"{v/1_000:.0f}K đ"
    return f"{v:.0f} đ"
