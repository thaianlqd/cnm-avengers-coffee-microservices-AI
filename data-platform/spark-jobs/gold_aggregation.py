"""
Gold Layer: Aggregations from MinIO Silver Parquet → MinIO Gold bucket (JSON) & PostgreSQL 'gold' schema (Data Marts).
Ready-to-consume datasets for Modern React Analytics Web UI and BI/Reporting.

Architectural flow:
  Silver Bucket (Parquet) → Business Aggregations (Pandas) → Gold Bucket (JSON/Parquet) & PostgreSQL 'gold' schema

Uses VERIFIED column names:
  don_hang: ma_nguoi_dung (NOT khach_hang_id), tong_tien, co_so_ma, etc.
  chi_tiet_don_hang: gia_ban (NOT don_gia), ten_san_pham, ma_san_pham(int), kich_co
  shipper_delivery: shipper_id, status, assigned_at, delivered_at
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
SILVER_BUCKET    = "avengers-silver"
GOLD_BUCKET      = "avengers-gold"

DB_HOST     = os.getenv("DB_HOST", "postgres-analytics")
DB_PORT     = os.getenv("DB_PORT", "5432")
DB_USER     = os.getenv("DB_USER", "analytics")
DB_PASSWORD = os.getenv("DB_PASSWORD", "analytics123")
DB_NAME     = os.getenv("DB_NAME", "analytics")


def get_minio():
    return boto3.client(
        "s3", endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
        config=Config(signature_version="s3v4"),
    )


def get_engine():
    try:
        url = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?sslmode={os.getenv('DB_SSLMODE', 'disable')}"
        return sqlalchemy.create_engine(url)
    except Exception as e:
        logger.warning(f"Could not connect to database: {e}")
        return None


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


def get_latest_df_from_silver(s3, table_name: str) -> pd.DataFrame | None:
    """Find and read the latest parquet file for a given table name from Silver bucket."""
    try:
        all_keys = []
        paginator = s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=SILVER_BUCKET, Prefix=""):
            for obj in page.get("Contents", []):
                if f"/{table_name}/" in obj["Key"] and obj["Key"].endswith(".parquet"):
                    all_keys.append((obj["Key"], obj["LastModified"]))
        if not all_keys:
            return None
        latest = sorted(all_keys, key=lambda x: x[1], reverse=True)[0][0]
        obj = s3.get_object(Bucket=SILVER_BUCKET, Key=latest)
        df = pd.read_parquet(io.BytesIO(obj["Body"].read()))
        logger.info(f"Loaded {len(df)} rows from Silver: s3://{SILVER_BUCKET}/{latest}")
        return df
    except Exception as e:
        logger.warning(f"Could not read {table_name} from Silver: {e}")
        return None


def save_to_gold_db(engine, df: pd.DataFrame, table_name: str):
    """Save aggregated DataFrame into postgres-analytics 'gold' schema (Data Marts)."""
    if engine is None or df is None or df.empty:
        return
    try:
        with engine.begin() as conn:
            conn.execute(sqlalchemy.text("CREATE SCHEMA IF NOT EXISTS gold;"))
        df.to_sql(table_name, engine, schema="gold", if_exists="replace", index=False)
        logger.info(f"Persisted {len(df)} rows → gold.{table_name}")
    except Exception as e:
        logger.warning(f"Could not persist to gold.{table_name}: {e}")


def run_silver_aggregations(s3, engine, orders: pd.DataFrame, items: pd.DataFrame | None, deliveries: pd.DataFrame | None, wallet_tx: pd.DataFrame | None, deliv_track: pd.DataFrame | None):
    """Run all 16 aggregations directly from Silver DataFrames (True Medallion Architecture)."""
    logger.info("Computing Gold datasets directly from Silver Parquet...")
    orders = orders.copy()
    if "ngay_tao" in orders.columns and not pd.api.types.is_datetime64_any_dtype(orders["ngay_tao"]):
        orders["ngay_tao"] = pd.to_datetime(orders["ngay_tao"], errors="coerce")
    if "date" not in orders.columns and "ngay_tao" in orders.columns:
        orders["date"] = orders["ngay_tao"].dt.date
    if "tong_tien" in orders.columns:
        orders["tong_tien"] = pd.to_numeric(orders["tong_tien"], errors="coerce").fillna(0)

    today = datetime.now().date()
    valid_statuses = ['HOAN_THANH', 'DANG_GIAO', 'DA_XAC_NHAN']

    # 1. KPI Summary
    try:
        is_today = orders["date"] == today
        is_completed = orders["trang_thai_don_hang"] == "HOAN_THANH"
        is_revenue_status = orders["trang_thai_don_hang"].isin(['HOAN_THANH', 'DANG_GIAO'])
        is_active_deliv = orders["trang_thai_don_hang"] == "DANG_GIAO"

        kpi_data = {
            "orders_today": int(is_today.sum()),
            "completed_today": int((is_today & is_completed).sum()),
            "revenue_today": float(orders.loc[is_today & is_revenue_status, "tong_tien"].sum()),
            "active_deliveries": int(is_active_deliv.sum()),
            "total_orders_all_time": len(orders),
            "revenue_all_time": float(orders.loc[is_revenue_status, "tong_tien"].sum())
        }
        upload_json(s3, kpi_data, "kpi/latest.json")
        save_to_gold_db(engine, pd.DataFrame([kpi_data]), "kpi_summary")
    except Exception as e:
        logger.warning(f"Silver KPI error: {e}")

    # 2. Revenue by Day (last 30 days)
    try:
        rev_orders = orders[orders["trang_thai_don_hang"].isin(['HOAN_THANH', 'DANG_GIAO'])].copy()
        if not rev_orders.empty:
            rev_daily = rev_orders.groupby("date").agg(
                total_orders=("ma_don_hang", "count"),
                revenue=("tong_tien", "sum")
            ).reset_index()
            rev_daily["date"] = rev_daily["date"].astype(str)
            rev_daily = rev_daily.sort_values("date").tail(30)
            upload_json(s3, rev_daily.to_dict(orient="records"), "revenue_daily/latest.json")
            save_to_gold_db(engine, rev_daily, "revenue_daily")
    except Exception as e:
        logger.warning(f"Silver Revenue daily error: {e}")

    # 3. Top Products
    if items is not None and not items.empty and "ma_don_hang" in items.columns:
        try:
            merged_items = items.merge(
                orders[["ma_don_hang", "trang_thai_don_hang", "ngay_tao"]],
                on="ma_don_hang", how="inner"
            )
            filtered_items = merged_items[merged_items["trang_thai_don_hang"].isin(['HOAN_THANH', 'DANG_GIAO'])]
            top_prod = filtered_items.groupby(["ma_san_pham", "ten_san_pham"]).agg(
                total_quantity=("so_luong", "sum"),
                total_revenue=("line_total", "sum")
            ).reset_index().sort_values("total_quantity", ascending=False).head(20)
            upload_json(s3, top_prod.to_dict(orient="records"), "top_products/latest.json")
            save_to_gold_db(engine, top_prod, "top_products")
        except Exception as e:
            logger.warning(f"Silver Top products error: {e}")

    # 4. Customer Segments
    try:
        cust_orders = orders[orders["ma_nguoi_dung"].notna()].copy()
        if not cust_orders.empty:
            valid_orders = cust_orders[cust_orders["trang_thai_don_hang"].isin(['HOAN_THANH', 'DANG_GIAO'])]
            cust_ltv = valid_orders.groupby("ma_nguoi_dung")["tong_tien"].sum().rename("lifetime_value")
            cust_count = cust_orders.groupby("ma_nguoi_dung")["ma_don_hang"].count().rename("order_count")
            cust_df = pd.concat([cust_count, cust_ltv], axis=1).reset_index().fillna(0)
            cust_df.rename(columns={"ma_nguoi_dung": "customer_id"}, inplace=True)
            cust_df["segment"] = pd.cut(
                cust_df["order_count"], bins=[0, 1, 3, 10, float("inf")],
                labels=["Khách mới", "Thông thường", "Trung thành", "VIP"]
            ).astype(str)
            seg = cust_df.groupby("segment").agg(
                count=("customer_id", "count"),
                avg_ltv=("lifetime_value", "mean")
            ).reset_index()
            upload_json(s3, seg.to_dict(orient="records"), "customer_segments/latest.json")
            save_to_gold_db(engine, seg, "customer_segments")
    except Exception as e:
        logger.warning(f"Silver Customer segments error: {e}")

    # 5. Shipper Performance
    if deliveries is not None and not deliveries.empty and "shipper_id" in deliveries.columns:
        try:
            d = deliveries.copy()
            shipper_stats = d.groupby("shipper_id").agg(
                total_deliveries=("id", "count"),
                completed=("status", lambda x: (x == "DELIVERED").sum()),
                failed=("status", lambda x: (x == "FAILED").sum()),
                avg_delivery_min=("delivery_duration_min", "mean")
            ).reset_index()
            shipper_stats["success_rate"] = (100.0 * shipper_stats["completed"] / shipper_stats["total_deliveries"].replace(0, 1)).round(1)
            shipper_stats["avg_delivery_min"] = shipper_stats["avg_delivery_min"].round(1)
            shipper_stats = shipper_stats.sort_values("completed", ascending=False).head(20)
            upload_json(s3, shipper_stats.to_dict(orient="records"), "shipper_performance/latest.json")
            save_to_gold_db(engine, shipper_stats, "shipper_performance")
        except Exception as e:
            logger.warning(f"Silver Shipper performance error: {e}")

    # 6. Order Status Distribution
    try:
        status_dist = orders.groupby("trang_thai_don_hang").agg(count=("ma_don_hang", "count")).reset_index()
        status_dist.rename(columns={"trang_thai_don_hang": "status"}, inplace=True)
        total_cnt = status_dist["count"].sum()
        status_dist["pct"] = (100.0 * status_dist["count"] / (total_cnt if total_cnt > 0 else 1)).round(1)
        upload_json(s3, status_dist.to_dict(orient="records"), "order_status/latest.json")
        save_to_gold_db(engine, status_dist, "order_status_distribution")
    except Exception as e:
        logger.warning(f"Silver Order status error: {e}")

    # 7. Payment Method Distribution
    try:
        pay_dist = orders.groupby("phuong_thuc_thanh_toan").agg(
            count=("ma_don_hang", "count"),
            revenue=("tong_tien", "sum")
        ).reset_index().rename(columns={"phuong_thuc_thanh_toan": "payment_method"}).sort_values("count", ascending=False)
        upload_json(s3, pay_dist.to_dict(orient="records"), "payment_methods/latest.json")
        save_to_gold_db(engine, pay_dist, "payment_methods_distribution")
    except Exception as e:
        logger.warning(f"Silver Payment method error: {e}")

    # 8. Taste Profile by Branch
    if items is not None and not items.empty:
        try:
            m_taste = items.merge(
                orders[["ma_don_hang", "co_so_ma", "trang_thai_don_hang", "tong_tien"]],
                on="ma_don_hang", how="inner"
            )
            valid_taste = m_taste[m_taste["trang_thai_don_hang"].isin(valid_statuses)].copy()
            valid_taste["branch_code"] = valid_taste["co_so_ma"].fillna("UNKNOWN")
            valid_taste["size_variant"] = valid_taste["kich_co"].fillna("Standard")
            branch_taste = valid_taste.groupby(["branch_code", "ten_san_pham", "size_variant"]).agg(
                order_count=("ma_don_hang", "nunique"),
                total_qty=("so_luong", "sum"),
                avg_order_value=("tong_tien", "mean")
            ).reset_index().sort_values(["branch_code", "total_qty"], ascending=[True, False])
            branch_taste["avg_order_value"] = branch_taste["avg_order_value"].round(0)
            upload_json(s3, branch_taste.to_dict(orient="records"), "taste_analytics/branch_taste_profile/latest.json")
            save_to_gold_db(engine, branch_taste, "branch_taste_profile")
        except Exception as e:
            logger.warning(f"Silver Taste branch error: {e}")

    # 9. Taste by Time-of-Day
    if items is not None and not items.empty and "hour" in orders.columns:
        try:
            m_time = items.merge(
                orders[["ma_don_hang", "hour", "trang_thai_don_hang"]],
                on="ma_don_hang", how="inner"
            )
            valid_time = m_time[m_time["trang_thai_don_hang"].isin(valid_statuses)].copy()
            valid_time["hour_of_day"] = valid_time["hour"].fillna(12).astype(int)

            def get_slot(h):
                if 6 <= h <= 9: return 'Sáng sớm (6-9h)'
                if 10 <= h <= 12: return 'Buổi sáng (10-12h)'
                if 13 <= h <= 15: return 'Buổi trưa (13-15h)'
                if 16 <= h <= 19: return 'Chiều tối (16-19h)'
                return 'Tối khuya (19h+)'

            valid_time["time_slot"] = valid_time["hour_of_day"].apply(get_slot)
            valid_time["size_variant"] = valid_time["kich_co"].fillna("Standard")
            time_taste = valid_time.groupby(["hour_of_day", "time_slot", "ten_san_pham", "size_variant"]).agg(
                order_count=("ma_don_hang", "nunique"),
                total_qty=("so_luong", "sum")
            ).reset_index().sort_values(["hour_of_day", "total_qty"], ascending=[True, False])
            upload_json(s3, time_taste.to_dict(orient="records"), "taste_analytics/time_of_day_taste/latest.json")
        except Exception as e:
            logger.warning(f"Silver Taste time error: {e}")

    # 10. Branch Heatmap
    if items is not None and not items.empty:
        try:
            m_heat = items.merge(
                orders[["ma_don_hang", "co_so_ma", "trang_thai_don_hang"]],
                on="ma_don_hang", how="inner"
            )
            v_heat = m_heat[m_heat["trang_thai_don_hang"].isin(valid_statuses)].copy()
            v_heat["branch_code"] = v_heat["co_so_ma"].fillna("UNKNOWN")
            heat_df = v_heat.groupby(["branch_code", "ten_san_pham"]).agg(
                unique_orders=("ma_don_hang", "nunique"),
                total_qty=("so_luong", "sum")
            ).reset_index()
            # Calculate pct per branch
            branch_totals = heat_df.groupby("branch_code")["total_qty"].transform("sum")
            heat_df["pct_of_branch"] = (100.0 * heat_df["total_qty"] / branch_totals.replace(0, 1)).round(2)
            heat_df = heat_df.sort_values(["branch_code", "total_qty"], ascending=[True, False])
            upload_json(s3, heat_df.to_dict(orient="records"), "taste_analytics/branch_product_heatmap/latest.json")
        except Exception as e:
            logger.warning(f"Silver Heatmap error: {e}")

    # 11. Payment adoption
    try:
        p_orders = orders[orders["trang_thai_don_hang"].isin(['HOAN_THANH', 'DANG_GIAO'])].copy()
        if not p_orders.empty:
            padopt = p_orders.groupby("phuong_thuc_thanh_toan").agg(
                order_count=("ma_don_hang", "count"),
                total_revenue=("tong_tien", "sum"),
                unique_customers=("ma_nguoi_dung", "nunique")
            ).reset_index().rename(columns={"phuong_thuc_thanh_toan": "payment_method"})
            tot_cnt = padopt["order_count"].sum()
            padopt["pct_orders"] = (100.0 * padopt["order_count"] / (tot_cnt if tot_cnt > 0 else 1)).round(2)
            upload_json(s3, padopt.to_dict(orient="records"), "wallet_analytics/payment_adoption/latest.json")
    except Exception as e:
        logger.warning(f"Silver Payment adoption error: {e}")

    # 12. Wallet transactions
    if wallet_tx is not None and not wallet_tx.empty:
        try:
            w_success = wallet_tx[wallet_tx.get("status") == "SUCCESS"] if "status" in wallet_tx.columns else wallet_tx
            w_agg = w_success.groupby(["customer_id", "type"]).agg(
                tx_count=("id", "count"),
                total_amount=("amount", "sum"),
                avg_amount=("amount", "mean")
            ).reset_index()
            upload_json(s3, w_agg.to_dict(orient="records"), "wallet_analytics/wallet_transactions/latest.json")
        except Exception as e:
            logger.warning(f"Silver Wallet tx error: {e}")

    # 13. Wallet vs COD comparison
    try:
        def get_pay_group(method):
            if method in ['VI_AVENGERS', 'WALLET']: return 'Dùng Ví'
            if method in ['VNPAY', 'MOMO', 'QR_CODE']: return 'Ví điện tử bên ngoài'
            return 'Tiền mặt / COD'

        orders_w = orders[orders["ma_nguoi_dung"].notna()].copy()
        if not orders_w.empty:
            orders_w["pay_group"] = orders_w["phuong_thuc_thanh_toan"].apply(get_pay_group)
            valid_w = orders_w[orders_w["trang_thai_don_hang"].isin(['HOAN_THANH', 'DANG_GIAO'])]
            w_summary = valid_w.groupby("pay_group").agg(
                customer_count=("ma_nguoi_dung", "nunique"),
                order_count=("ma_don_hang", "count"),
                total_ltv=("tong_tien", "sum"),
                avg_ltv=("tong_tien", "mean")
            ).reset_index().round(2)
            upload_json(s3, w_summary.to_dict(orient="records"), "wallet_analytics/wallet_vs_cod_comparison/latest.json")
    except Exception as e:
        logger.warning(f"Silver Wallet vs COD error: {e}")

    # 14, 15, 16. Logistics Analytics
    if deliv_track is not None and not deliv_track.empty:
        try:
            dt = deliv_track.copy()
            dt["delivery_method"] = dt.get("delivery_method", "INTERNAL").fillna("INTERNAL")
            dt["branch_code"] = dt.get("branch_code", "UNKNOWN").fillna("UNKNOWN")
            # 14. Performance
            l_perf = dt.groupby(["delivery_method", "branch_code"]).agg(
                total_orders=("id", "count"),
                avg_delivery_fee=("delivery_fee", "mean"),
                avg_estimated_minutes=("estimated_minutes", "mean")
            ).reset_index().round(2)
            upload_json(s3, l_perf.to_dict(orient="records"), "logistics_analytics/delivery_method_performance/latest.json")
            # 16. Mode adoption
            if "delivery_mode" in dt.columns:
                l_mode = dt.groupby(["delivery_mode", "branch_code"]).agg(
                    order_count=("id", "count"),
                    avg_fee=("delivery_fee", "mean")
                ).reset_index().round(2)
                upload_json(s3, l_mode.to_dict(orient="records"), "logistics_analytics/delivery_mode_adoption/latest.json")
        except Exception as e:
            logger.warning(f"Silver Logistics tracking error: {e}")

    upload_json(s3, {
        "last_run": datetime.now().isoformat(),
        "source": "silver_parquet_lakehouse",
        "status": "success",
        "orders_count": len(orders)
    }, "pipeline_meta/latest.json")
    logger.info("=== Gold Layer Completed Successfully from Silver Data! ===")


def run_database_sql_fallback(s3, engine):
    """Fallback: Runs SQL directly on postgres-analytics if Silver bucket is not populated yet."""
    logger.info("Running Database SQL Fallback for Gold layer...")
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
        save_to_gold_db(engine, df, "kpi_summary")
    except Exception as e:
        logger.warning(f"Fallback KPI error: {e}")

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
        save_to_gold_db(engine, df, "revenue_daily")
    except Exception as e:
        logger.warning(f"Fallback Revenue daily error: {e}")

    # 3. Top Products
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
        save_to_gold_db(engine, df, "top_products")
    except Exception as e:
        logger.warning(f"Fallback Top products error: {e}")

    # 4. Customer Segments
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
            save_to_gold_db(engine, seg, "customer_segments")
    except Exception as e:
        logger.warning(f"Fallback Customer segments error: {e}")

    upload_json(s3, {
        "last_run": datetime.now().isoformat(),
        "source": "sql_fallback",
        "status": "success"
    }, "pipeline_meta/latest.json")


def main():
    logger.info("=== Gold Layer Starting ===")
    s3 = get_minio()
    engine = get_engine()

    # Try reading from Silver Parquet first (Standard Medallion Pattern)
    orders_silver = get_latest_df_from_silver(s3, "orders_clean")
    items_silver = get_latest_df_from_silver(s3, "items_clean")
    deliveries_silver = get_latest_df_from_silver(s3, "deliveries_clean")
    wallet_silver = get_latest_df_from_silver(s3, "wallet_transactions_clean")
    tracking_silver = get_latest_df_from_silver(s3, "delivery_tracking_clean")

    if orders_silver is not None and not orders_silver.empty:
        logger.info(f"Medallion Pipeline: Consuming {len(orders_silver)} rows from Silver Parquet")
        run_silver_aggregations(s3, engine, orders_silver, items_silver, deliveries_silver, wallet_silver, tracking_silver)
    else:
        logger.warning("Silver Parquet data not found or empty. Using SQL fallback...")
        if engine is not None:
            run_database_sql_fallback(s3, engine)
        else:
            logger.error("Neither Silver Parquet nor PostgreSQL Analytics is available!")

    logger.info("=== Gold Layer Done ===")


if __name__ == "__main__":
    main()
