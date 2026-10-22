"""Gold from an explicit Silver run, immutable objects and transactional DB version pointer."""
import json
import logging
import math
from datetime import datetime
import pandas as pd

from bronze_ingestion import get_minio, get_engine
from batch_runtime import LayerRun, existing_run, read_frame, publish_gold_database, run_arguments
from pipeline_runtime import read_manifest, PipelineContractError, fingerprint
from silver_transform import CONTRACT as SILVER_CONTRACT

logger = logging.getLogger('gold')
SILVER_BUCKET = 'avengers-silver'
GOLD_BUCKET = 'avengers-gold'
REQUIRED = ['kpi','revenue_daily','top_products','customer_segments']
OPTIONAL = ['shipper_performance','order_status','payment_methods','taste_analytics.branch_taste_profile',
            'taste_analytics.time_of_day_taste','taste_analytics.branch_product_heatmap',
            'wallet_analytics.payment_adoption','wallet_analytics.wallet_transactions',
            'wallet_analytics.wallet_vs_cod_comparison','logistics_analytics.delivery_method_performance',
            'logistics_analytics.delivery_mode_adoption']
CONTRACT = {'version':'3.4.0','layer':'gold','required_outputs':REQUIRED,'optional_outputs':OPTIONAL,
            'revenue_statuses':['HOAN_THANH','DANG_GIAO'],'calculation_version':'3.4.0',
            'business_definitions':'Existing batch aggregates; canonical Analyst metrics remain governed by the semantic catalog',
            'database_publication':'analytics.gold_dataset_versions + transactional pipeline_publications pointer'}


def run_silver_aggregations(orders, items, deliveries, wallet_tx, deliv_track, *, emit, persist, as_of, errors):
    """Run all 16 aggregations directly from Silver DataFrames (True Medallion Architecture)."""
    logger.info("Computing Gold datasets directly from Silver Parquet...")
    orders = orders.copy()
    if "ngay_tao" in orders.columns and not pd.api.types.is_datetime64_any_dtype(orders["ngay_tao"]):
        orders["ngay_tao"] = pd.to_datetime(orders["ngay_tao"], errors="coerce")
    if "date" not in orders.columns and "ngay_tao" in orders.columns:
        orders["date"] = orders["ngay_tao"].dt.date
    if "tong_tien" in orders.columns:
        orders["tong_tien"] = pd.to_numeric(orders["tong_tien"], errors="coerce").fillna(0)

    today = as_of.date()
    valid_statuses = ['HOAN_THANH', 'DANG_GIAO']

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
        emit(kpi_data, "kpi/latest.json")
        persist(pd.DataFrame([kpi_data]), "kpi_summary")
    except Exception as e:
        errors.append(type(e).__name__)

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
            emit(rev_daily.to_dict(orient="records"), "revenue_daily/latest.json")
            persist(rev_daily, "revenue_daily")
    except Exception as e:
        errors.append(type(e).__name__)

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
            emit(top_prod.to_dict(orient="records"), "top_products/latest.json")
            persist(top_prod, "top_products")
        except Exception as e:
            errors.append(type(e).__name__)

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
            emit(seg.to_dict(orient="records"), "customer_segments/latest.json")
            persist(seg, "customer_segments")
    except Exception as e:
        errors.append(type(e).__name__)

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
            emit(shipper_stats.to_dict(orient="records"), "shipper_performance/latest.json")
            persist(shipper_stats, "shipper_performance")
        except Exception as e:
            errors.append(type(e).__name__)

    # 6. Order Status Distribution
    try:
        status_dist = orders.groupby("trang_thai_don_hang").agg(count=("ma_don_hang", "count")).reset_index()
        status_dist.rename(columns={"trang_thai_don_hang": "status"}, inplace=True)
        total_cnt = status_dist["count"].sum()
        status_dist["pct"] = (100.0 * status_dist["count"] / (total_cnt if total_cnt > 0 else 1)).round(1)
        emit(status_dist.to_dict(orient="records"), "order_status/latest.json")
        persist(status_dist, "order_status_distribution")
    except Exception as e:
        errors.append(type(e).__name__)

    # 7. Payment Method Distribution
    try:
        pay_dist = orders.groupby("phuong_thuc_thanh_toan").agg(
            count=("ma_don_hang", "count"),
            revenue=("tong_tien", "sum")
        ).reset_index().rename(columns={"phuong_thuc_thanh_toan": "payment_method"}).sort_values("count", ascending=False)
        emit(pay_dist.to_dict(orient="records"), "payment_methods/latest.json")
        persist(pay_dist, "payment_methods_distribution")
    except Exception as e:
        errors.append(type(e).__name__)

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
            emit(branch_taste.to_dict(orient="records"), "taste_analytics/branch_taste_profile/latest.json")
            persist(branch_taste, "branch_taste_profile")
        except Exception as e:
            errors.append(type(e).__name__)

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
            emit(time_taste.to_dict(orient="records"), "taste_analytics/time_of_day_taste/latest.json")
        except Exception as e:
            errors.append(type(e).__name__)

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
            emit(heat_df.to_dict(orient="records"), "taste_analytics/branch_product_heatmap/latest.json")
        except Exception as e:
            errors.append(type(e).__name__)

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
            emit(padopt.to_dict(orient="records"), "wallet_analytics/payment_adoption/latest.json")
    except Exception as e:
        errors.append(type(e).__name__)

    # 12. Wallet transactions
    if wallet_tx is not None and not wallet_tx.empty:
        try:
            w_success = wallet_tx[wallet_tx.get("status") == "SUCCESS"] if "status" in wallet_tx.columns else wallet_tx
            w_agg = w_success.groupby(["customer_id", "type"]).agg(
                tx_count=("id", "count"),
                total_amount=("amount", "sum"),
                avg_amount=("amount", "mean")
            ).reset_index()
            emit(w_agg.to_dict(orient="records"), "wallet_analytics/wallet_transactions/latest.json")
        except Exception as e:
            errors.append(type(e).__name__)

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
            emit(w_summary.to_dict(orient="records"), "wallet_analytics/wallet_vs_cod_comparison/latest.json")
    except Exception as e:
        errors.append(type(e).__name__)

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
            emit(l_perf.to_dict(orient="records"), "logistics_analytics/delivery_method_performance/latest.json")
            # 16. Mode adoption
            if "delivery_mode" in dt.columns:
                l_mode = dt.groupby(["delivery_mode", "branch_code"]).agg(
                    order_count=("id", "count"),
                    avg_fee=("delivery_fee", "mean")
                ).reset_index().round(2)
                emit(l_mode.to_dict(orient="records"), "logistics_analytics/delivery_mode_adoption/latest.json")
        except Exception as e:
            errors.append(type(e).__name__)



def nullable_json(value):
    if isinstance(value, float):
        if math.isnan(value): return None
        if not math.isfinite(value): raise PipelineContractError('Nonfinite aggregate cannot be published')
    if isinstance(value, dict): return {str(k): nullable_json(v) for k,v in value.items()}
    if isinstance(value, list): return [nullable_json(v) for v in value]
    if isinstance(value, datetime): return value.isoformat()
    return value


def main(run_id=None, as_of=None, input_run=None):
    s3 = get_minio()
    old = existing_run(s3, GOLD_BUCKET, run_id, as_of, CONTRACT)
    if old is not None and old.get('input_run_id') != input_run:
        raise PipelineContractError('Existing Gold run has different inputs')
    if old is None:
        if not input_run: raise PipelineContractError('Explicit committed Silver input run required')
        upstream = read_manifest(s3, SILVER_BUCKET, input_run, fingerprint(SILVER_CONTRACT))
        names = ['orders_clean','items_clean','deliveries_clean','wallet_transactions_clean','delivery_tracking_clean']
        if set(names)-set(upstream['outputs']): raise PipelineContractError('Required Silver inputs absent')
        frames = [read_frame(s3, SILVER_BUCKET, upstream, name) for name in names]
        if sum(int(frame.memory_usage(index=True,deep=True).sum()) for frame in frames)>256000000:
            raise PipelineContractError('Combined Silver frames exceed bounded batch capacity')
        run = LayerRun(s3, GOLD_BUCKET, 'batch.gold', run_id, as_of, CONTRACT,
                       {'silver': upstream['manifest_fingerprint']})
        run.manifest['input_run_id'] = input_run
        errors = []
        def emit(data, key):
            name = key.removesuffix('/latest.json').replace('/','.')
            run.json(name, nullable_json(data))
        run_silver_aggregations(*frames, emit=emit, persist=lambda frame,name: None, as_of=run.as_of, errors=errors)
        orders, items = frames[:2]
        # Explicit empty populations are measured no_data, never borrowed from a
        # previous run or SQL fallback. Other missing required results fail.
        if not orders['trang_thai_don_hang'].isin(['HOAN_THANH','DANG_GIAO']).any() and 'revenue_daily' not in run.outputs:
            run.json('revenue_daily', [])
        if items.empty and 'top_products' not in run.outputs: run.json('top_products', [])
        if not orders['ma_nguoi_dung'].notna().any() and 'customer_segments' not in run.outputs:
            run.json('customer_segments', [])
        old = run.finish(optional=OPTIONAL, errors=errors)
    # Retry a failed DB publication using the existing immutable object run.
    engine = get_engine()
    connection = engine.raw_connection()
    try:
        publish_gold_database(connection, s3, GOLD_BUCKET, old)
    finally:
        connection.close()
        engine.dispose()
    return old


if __name__ == '__main__':
    arguments = run_arguments('Governed batch publication')
    try:
        main(**arguments)
    except Exception as error:
        logging.getLogger(__name__).error('Layer failed: %s', type(error).__name__)
        raise SystemExit(1) from None
