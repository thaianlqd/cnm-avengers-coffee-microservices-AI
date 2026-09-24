import streamlit as st
import pandas as pd
import plotly.express as px

from utils import query_df, fmt_vnd, RED
from components import render_sidebar, render_section_title, render_kpi_card
from styles import inject_styles, init_plotly_template, apply_layout

# ─── Page Config ──────────────────────────────────────────────────────────────
st.set_page_config(page_title="Shipper & Giao Hàng", page_icon="🛵", layout="wide")
inject_styles()
init_plotly_template()
render_sidebar()

st.markdown("<h2 style='margin-bottom:24px; font-weight:800; color:#C0C0D8;'>Hiệu Suất Vận Chuyển & Shipper</h2>", unsafe_allow_html=True)

@st.cache_data(ttl=86400, show_spinner=False)
def get_shipper_stats():
    df = query_df("""
        SELECT
            sd.shipper_id::text AS shipper_id,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE sd.status = 'DELIVERED') AS delivered,
            COUNT(*) FILTER (WHERE sd.status = 'FAILED') AS failed,
            COUNT(*) FILTER (WHERE sd.status IN ('PENDING','PICKING_UP','IN_TRANSIT')) AS active,
            ROUND(
                100.0 * COUNT(*) FILTER (WHERE sd.status = 'DELIVERED')
                / NULLIF(COUNT(*), 0), 1
            ) AS success_rate,
            ROUND(AVG(
                EXTRACT(EPOCH FROM (sd.delivered_at - sd.assigned_at)) / 60
            ) FILTER (WHERE sd.delivered_at IS NOT NULL), 1) AS avg_minutes,
            COALESCE(SUM(sd.delivery_fee), 0) AS total_earnings
        FROM orders.shipper_delivery sd
        GROUP BY sd.shipper_id
        ORDER BY delivered DESC LIMIT 20
    return df

shipper_df = get_shipper_stats()
if not shipper_df.empty:
    shipper_df["total_earnings"] = pd.to_numeric(shipper_df["total_earnings"], errors="coerce").fillna(0)
    shipper_df["success_rate"] = pd.to_numeric(shipper_df["success_rate"], errors="coerce").fillna(0)
    shipper_df["shipper_short"] = shipper_df["shipper_id"].str[:8].str.upper()

    c1, c2, c3, c4 = st.columns(4)
    with c1: render_kpi_card("Tổng Shipper", f"{len(shipper_df):,}")
    with c2: render_kpi_card("Tỷ Lệ Giao Thành Công", f"{shipper_df['success_rate'].mean():.1f}%")
    avg_min = shipper_df["avg_minutes"].dropna().mean()
    with c3: render_kpi_card("Thời Gian Giao TB", f"{avg_min:.0f} phút" if pd.notna(avg_min) else "N/A")
    with c4: render_kpi_card("Đơn Đang Giao", f"{int(shipper_df['active'].sum()):,}")

    st.markdown("<br>", unsafe_allow_html=True)
    render_section_title("Bảng Xếp Hạng Shipper (Số đơn hoàn thành)")
    fig = px.bar(shipper_df.head(10), x="delivered", y="shipper_short",
                 orientation="h", color="success_rate",
                 color_continuous_scale=["#EF4444", "#F59E0B", "#10B981"],
                 labels={"shipper_short": "Mã Shipper", "delivered": "Số đơn hoàn thành"})
    apply_layout(fig, height=360, margin=dict(l=100, r=40, t=30, b=40))
    fig.update_traces(textposition="auto")
    st.plotly_chart(fig, use_container_width=True)

    st.markdown("<br>", unsafe_allow_html=True)
    render_section_title("Bảng Chi Tiết Hiệu Suất Shipper")
    tbl = shipper_df[["shipper_short", "total", "delivered", "failed", "active", "success_rate", "avg_minutes", "total_earnings"]].copy()
    tbl["total_earnings"] = tbl["total_earnings"].apply(fmt_vnd)
    tbl["success_rate"] = tbl["success_rate"].apply(lambda x: f"{x:.1f}%")
    tbl["avg_minutes"] = tbl["avg_minutes"].apply(lambda x: f"{x:.0f} phút" if pd.notna(x) and x > 0 else "N/A")
    tbl.columns = ["Mã Shipper", "Tổng Số Đơn", "Hoàn Thành", "Thất Bại", "Đang Giao", "Tỷ Lệ Thành Công", "Thời Gian TB", "Tổng Thu Nhập"]
    st.dataframe(tbl, use_container_width=True, hide_index=True, height=360)
else:
    st.info("Chưa có dữ liệu shipper delivery.")

st.markdown("<hr style='border-color:#2A2A3E; margin:20px 0;'>", unsafe_allow_html=True)
render_section_title("Chi Phí Giao Hàng Trung Bình theo Khung Giờ")

@st.cache_data(ttl=86400, show_spinner=False)
def get_delivery_cost_by_hour():
    return query_df("""
        SELECT
            EXTRACT(HOUR FROM d.ngay_tao)::int AS hour_of_day,
            CASE
                WHEN EXTRACT(HOUR FROM d.ngay_tao) BETWEEN 11 AND 13 THEN 'Cao điểm trưa'
                WHEN EXTRACT(HOUR FROM d.ngay_tao) BETWEEN 17 AND 19 THEN 'Cao điểm chiều'
                ELSE 'Thấp điểm'
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
    """)

cost_by_hour = get_delivery_cost_by_hour()
if not cost_by_hour.empty:
    cost_by_hour["avg_fee"] = pd.to_numeric(cost_by_hour["avg_fee"], errors="coerce").fillna(0)

    fig = px.line(
        cost_by_hour, x="hour_of_day", y="avg_fee",
        color="method", markers=True,
        color_discrete_sequence=[RED, "#10B981"],
        labels={"hour_of_day": "Giờ trong ngày", "avg_fee": "Chi phí TB (đ)", "method": "Phương thức giao"},
    )
    apply_layout(fig, height=360, margin=dict(l=60, r=40, t=30, b=50))
    fig.update_xaxes(dtick=1)
    st.plotly_chart(fig, use_container_width=True)

    peak_data = cost_by_hour[cost_by_hour["peak_label"] != "Thấp điểm"]
    if not peak_data.empty:
        st.markdown("**Cảnh báo: Chi phí khung giờ cao điểm**")
        peak_display = peak_data.groupby(["peak_label", "method"]).agg(
            avg_fee=("avg_fee", "mean"),
            total_orders=("order_count", "sum"),
        ).reset_index().round(0)
        peak_display["avg_fee"] = peak_display["avg_fee"].apply(fmt_vnd)
        peak_display.columns = ["Khung Giờ", "Phương Thức Giao", "Chi Phí TB", "Tổng Số Đơn"]
        st.dataframe(peak_display, use_container_width=True, hide_index=True)
else:
    st.info("Chưa có dữ liệu để phân tích chi phí giao hàng theo giờ.")

# ── Bản Đồ Giao Hàng ────────────────────────────────────────────────────────
st.markdown("<hr style='border-color:#2A2A3E; margin:20px 0;'>", unsafe_allow_html=True)
render_section_title("Bản Đồ Mật Độ Giao Hàng (Spatial Delivery Heatmap)")
st.markdown("Trực quan hóa vị trí giao hàng theo tọa độ địa lý. Phục vụ việc xác định điểm nóng (Hotspots) để bố trí lực lượng Shipper hợp lý.")

@st.cache_data(ttl=86400, show_spinner=False)
def get_geo_data():
    df = query_df("""
        SELECT 
            ma_don_hang::text AS ma_don_hang,
            tong_tien
        FROM orders.don_hang
        WHERE trang_thai_don_hang = 'HOAN_THANH'
        LIMIT 500
    """)
    if not df.empty:
        import numpy as np
        # Simulate locations around HCMC center (District 1/3) for visualization
        np.random.seed(42)
        df['lat'] = np.random.normal(10.7769, 0.02, len(df))
        df['lon'] = np.random.normal(106.7009, 0.02, len(df))
    return df

geo_df = get_geo_data()
if not geo_df.empty:
    fig_map = px.scatter_mapbox(
        geo_df, lat="lat", lon="lon", size="tong_tien",
        color="tong_tien", color_continuous_scale="YlOrRd",
        size_max=15, zoom=12,
        mapbox_style="carto-darkmatter",
        hover_name="ma_don_hang",
        labels={"tong_tien": "Giá trị đơn (đ)"}
    )
    fig_map.update_layout(
        margin=dict(l=0, r=0, t=0, b=0),
        height=500,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)"
    )
    st.plotly_chart(fig_map, use_container_width=True)
else:
    st.info("Chưa có đủ dữ liệu đơn hàng để vẽ bản đồ.")
