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
        f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?sslmode={os.getenv('DB_SSLMODE', 'disable')}"
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

    # ══════════════════════════════════════════════════════════════
    # HƯỚNG 1: TASTE ANALYTICS — Phân tích Khẩu vị theo Địa lý
    # Nguồn: chi_tiet_don_hang.kich_co  (mapping = Size/Customization)
    #        don_hang.co_so_ma           (Chi nhánh / Địa lý)
    #        don_hang.khung_gio_giao     (Khung giờ đặt hàng)
    # ══════════════════════════════════════════════════════════════
    try:
        # 8. Taste Profile by Branch — Top sản phẩm + size/variant mỗi chi nhánh
        df = pd.read_sql("""
            SELECT
                COALESCE(d.co_so_ma, 'UNKNOWN') AS branch_code,
                ct.ten_san_pham,
                COALESCE(ct.kich_co, 'Standard') AS size_variant,
                COUNT(*) AS order_count,
                SUM(ct.so_luong) AS total_qty,
                ROUND(AVG(d.tong_tien)::numeric, 0) AS avg_order_value
            FROM orders.chi_tiet_don_hang ct
            JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
            WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO', 'DA_XAC_NHAN')
              AND d.ngay_tao >= CURRENT_DATE - INTERVAL '90 days'
            GROUP BY d.co_so_ma, ct.ten_san_pham, ct.kich_co
            ORDER BY branch_code, total_qty DESC
        """, engine)
        upload_json(s3, df.to_dict(orient="records"), "taste_analytics/branch_taste_profile/latest.json")
        logger.info(f"Taste by branch: {len(df)} rows")
    except Exception as e:
        logger.warning(f"Taste branch error: {e}")

    try:
        # 9. Taste by Time-of-Day — Khẩu vị thay đổi theo khung giờ
        df = pd.read_sql("""
            SELECT
                EXTRACT(HOUR FROM d.ngay_tao)::int AS hour_of_day,
                CASE
                    WHEN EXTRACT(HOUR FROM d.ngay_tao) BETWEEN 6 AND 9   THEN 'Sáng sớm (6-9h)'
                    WHEN EXTRACT(HOUR FROM d.ngay_tao) BETWEEN 10 AND 12 THEN 'Buổi sáng (10-12h)'
                    WHEN EXTRACT(HOUR FROM d.ngay_tao) BETWEEN 13 AND 15 THEN 'Buổi trưa (13-15h)'
                    WHEN EXTRACT(HOUR FROM d.ngay_tao) BETWEEN 16 AND 19 THEN 'Chiều tối (16-19h)'
                    ELSE 'Tối khuya (19h+)'
                END AS time_slot,
                ct.ten_san_pham,
                COALESCE(ct.kich_co, 'Standard') AS size_variant,
                COUNT(*) AS order_count,
                SUM(ct.so_luong) AS total_qty
            FROM orders.chi_tiet_don_hang ct
            JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
            WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO', 'DA_XAC_NHAN')
              AND d.ngay_tao >= CURRENT_DATE - INTERVAL '90 days'
            GROUP BY hour_of_day, time_slot, ct.ten_san_pham, ct.kich_co
            ORDER BY hour_of_day, total_qty DESC
        """, engine)
        upload_json(s3, df.to_dict(orient="records"), "taste_analytics/time_of_day_taste/latest.json")
        logger.info(f"Taste by time: {len(df)} rows")
    except Exception as e:
        logger.warning(f"Taste time error: {e}")

    try:
        # 10. Product Category Popularity by Branch (Heatmap data)
        df = pd.read_sql("""
            SELECT
                COALESCE(d.co_so_ma, 'UNKNOWN') AS branch_code,
                ct.ten_san_pham,
                COUNT(DISTINCT ct.ma_don_hang) AS unique_orders,
                SUM(ct.so_luong) AS total_qty,
                ROUND(100.0 * SUM(ct.so_luong) /
                    SUM(SUM(ct.so_luong)) OVER (PARTITION BY d.co_so_ma), 2
                ) AS pct_of_branch
            FROM orders.chi_tiet_don_hang ct
            JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
            WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO', 'DA_XAC_NHAN')
              AND d.ngay_tao >= CURRENT_DATE - INTERVAL '90 days'
            GROUP BY d.co_so_ma, ct.ten_san_pham
            ORDER BY branch_code, total_qty DESC
        """, engine)
        upload_json(s3, df.to_dict(orient="records"), "taste_analytics/branch_product_heatmap/latest.json")
        logger.info(f"Branch heatmap: {len(df)} rows")
    except Exception as e:
        logger.warning(f"Branch heatmap error: {e}")

    # ══════════════════════════════════════════════════════════════
    # HƯỚNG 2: CUSTOMER WALLET ANALYTICS — Phân tích Dòng tiền Ví
    # Nguồn: orders.customer_wallet_transaction
    #        orders.don_hang.phuong_thuc_thanh_toan
    # ══════════════════════════════════════════════════════════════
    try:
        # 11. Wallet adoption rate — Tỷ lệ dùng Ví vs các phương thức khác
        df = pd.read_sql("""
            SELECT
                phuong_thuc_thanh_toan AS payment_method,
                COUNT(*) AS order_count,
                COALESCE(SUM(tong_tien), 0) AS total_revenue,
                ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS pct_orders,
                COUNT(DISTINCT ma_nguoi_dung) AS unique_customers
            FROM orders.don_hang
            WHERE trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
              AND ngay_tao >= CURRENT_DATE - INTERVAL '90 days'
            GROUP BY phuong_thuc_thanh_toan
            ORDER BY order_count DESC
        """, engine)
        upload_json(s3, df.to_dict(orient="records"), "wallet_analytics/payment_adoption/latest.json")
        logger.info(f"Payment adoption: {len(df)} rows")
    except Exception as e:
        logger.warning(f"Wallet adoption error: {e}")

    try:
        # 12. Wallet transaction analysis — Top-up behavior & frequency
        df = pd.read_sql("""
            SELECT
                customer_id::text,
                type AS transaction_type,
                status,
                COUNT(*) AS tx_count,
                COALESCE(SUM(amount), 0) AS total_amount,
                ROUND(AVG(amount)::numeric, 0) AS avg_amount,
                MIN(created_at) AS first_tx,
                MAX(created_at) AS last_tx
            FROM orders.customer_wallet_transaction
            WHERE status = 'SUCCESS'
            GROUP BY customer_id, type, status
            ORDER BY total_amount DESC
        """, engine)
        upload_json(s3, df.to_dict(orient="records"), "wallet_analytics/wallet_transactions/latest.json")
        logger.info(f"Wallet transactions: {len(df)} rows")
    except Exception as e:
        logger.warning(f"Wallet tx error: {e}")

    try:
        # 13. Customer value comparison — Wallet users vs COD users
        df = pd.read_sql("""
            SELECT
                ma_nguoi_dung::text AS customer_id,
                CASE
                    WHEN MAX(phuong_thuc_thanh_toan) IN ('VI_AVENGERS', 'WALLET') THEN 'Dùng Ví'
                    WHEN MAX(phuong_thuc_thanh_toan) IN ('VNPAY', 'MOMO', 'QR_CODE') THEN 'Ví điện tử bên ngoài'
                    ELSE 'Tiền mặt / COD'
                END AS payment_group,
                COUNT(*) AS order_count,
                COALESCE(SUM(tong_tien) FILTER (
                    WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                ), 0) AS lifetime_value,
                MAX(ngay_tao) AS last_order_date,
                CURRENT_DATE - MAX(ngay_tao)::date AS days_since_last_order
            FROM orders.don_hang
            WHERE ma_nguoi_dung IS NOT NULL
            GROUP BY ma_nguoi_dung
        """, engine)
        # Aggregate by payment group
        if len(df) > 0:
            df["lifetime_value"] = pd.to_numeric(df["lifetime_value"], errors="coerce").fillna(0)
            df["days_since_last_order"] = pd.to_numeric(df["days_since_last_order"], errors="coerce").fillna(0)
            summary = df.groupby("payment_group").agg(
                customer_count=("customer_id", "count"),
                avg_order_count=("order_count", "mean"),
                avg_ltv=("lifetime_value", "mean"),
                total_ltv=("lifetime_value", "sum"),
                avg_days_inactive=("days_since_last_order", "mean"),
            ).reset_index().round(2)
            upload_json(s3, summary.to_dict(orient="records"), "wallet_analytics/wallet_vs_cod_comparison/latest.json")
            logger.info(f"Wallet vs COD comparison: {len(summary)} groups")
    except Exception as e:
        logger.warning(f"Wallet comparison error: {e}")

    # ══════════════════════════════════════════════════════════════
    # HƯỚNG 3: LOGISTICS ANALYTICS — Phân tích Lalamove vs Shipper Nội bộ
    # Nguồn: orders.delivery_tracking (bảng của features_thaian)
    #        orders.shipper_delivery   (bảng gốc)
    # ══════════════════════════════════════════════════════════════
    try:
        # 14. Delivery method performance comparison
        df = pd.read_sql("""
            SELECT
                COALESCE(dt.delivery_method, 'INTERNAL') AS delivery_method,
                dt.delivery_mode,
                COUNT(*) AS total_orders,
                COUNT(*) FILTER (WHERE dt.lalamove_status IN ('COMPLETED','DELIVERED')) AS completed,
                COALESCE(AVG(dt.delivery_fee), 0) AS avg_delivery_fee,
                COALESCE(AVG(dt.estimated_minutes), 0) AS avg_estimated_minutes,
                COALESCE(dt.branch_code, 'UNKNOWN') AS branch_code
            FROM orders.delivery_tracking dt
            WHERE dt.created_at >= CURRENT_DATE - INTERVAL '90 days'
            GROUP BY dt.delivery_method, dt.delivery_mode, dt.branch_code
            ORDER BY total_orders DESC
        """, engine)
        upload_json(s3, df.to_dict(orient="records"), "logistics_analytics/delivery_method_performance/latest.json")
        logger.info(f"Delivery method performance: {len(df)} rows")
    except Exception as e:
        logger.warning(f"Logistics performance error: {e}")

    try:
        # 15. Delivery cost by hour — Chi phí giao theo khung giờ
        df = pd.read_sql("""
            SELECT
                EXTRACT(HOUR FROM d.ngay_tao)::int AS hour_of_day,
                CASE
                    WHEN EXTRACT(HOUR FROM d.ngay_tao) BETWEEN 11 AND 13 THEN 'Giờ cao điểm trưa'
                    WHEN EXTRACT(HOUR FROM d.ngay_tao) BETWEEN 17 AND 19 THEN 'Giờ cao điểm chiều'
                    ELSE 'Giờ thấp điểm'
                END AS peak_label,
                COALESCE(dt.delivery_method, 'INTERNAL') AS method,
                COUNT(*) AS order_count,
                COALESCE(AVG(dt.delivery_fee), 0) AS avg_fee,
                COALESCE(AVG(dt.estimated_minutes), 0) AS avg_minutes
            FROM orders.delivery_tracking dt
            JOIN orders.don_hang d ON dt.ma_don_hang = d.ma_don_hang
            WHERE d.ngay_tao >= CURRENT_DATE - INTERVAL '90 days'
            GROUP BY hour_of_day, peak_label, dt.delivery_method
            ORDER BY hour_of_day
        """, engine)
        upload_json(s3, df.to_dict(orient="records"), "logistics_analytics/cost_by_hour/latest.json")
        logger.info(f"Delivery cost by hour: {len(df)} rows")
    except Exception as e:
        logger.warning(f"Logistics hour error: {e}")

    try:
        # 16. Delivery mode adoption — Tỷ lệ khách chọn giao tận nơi vs tự lấy
        df = pd.read_sql("""
            SELECT
                delivery_mode,
                COALESCE(branch_code, 'UNKNOWN') AS branch_code,
                COUNT(*) AS order_count,
                ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY branch_code), 2) AS pct_of_branch,
                COALESCE(AVG(delivery_fee), 0) AS avg_fee
            FROM orders.delivery_tracking
            WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
            GROUP BY delivery_mode, branch_code
            ORDER BY branch_code, order_count DESC
        """, engine)
        upload_json(s3, df.to_dict(orient="records"), "logistics_analytics/delivery_mode_adoption/latest.json")
        logger.info(f"Delivery mode adoption: {len(df)} rows")
    except Exception as e:
        logger.warning(f"Logistics mode error: {e}")

    # Pipeline metadata
    upload_json(s3, {"last_run": datetime.now().isoformat(), "status": "success"}, "pipeline_meta/latest.json")

    logger.info("=== Gold Layer Done ===")


if __name__ == "__main__":
    main()
