import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots

from utils import query_df, fmt_vnd, RED, COLORS, STATUS_LABELS, PAYMENT_LABELS, get_max_date
from components import render_sidebar, render_section_title, render_kpi_card
from styles import inject_styles, init_plotly_template, apply_layout, PLOTLY_LAYOUT

# ─── Page Config ──────────────────────────────────────────────────────────────
st.set_page_config(page_title="Tổng Quan", page_icon="📊", layout="wide")
inject_styles()
init_plotly_template()
render_sidebar()

st.markdown("<h2 style='margin-bottom:24px; font-weight:800; color:#C0C0D8;'>Tổng Quan Hệ Thống</h2>", unsafe_allow_html=True)
render_section_title("Chỉ số Hiệu năng trong Ngày")

@st.cache_data(ttl=86400, show_spinner=False)
def get_kpi():
        # 1. Fetch max_date first to avoid CTE planner issues
        max_date_df = query_df("SELECT COALESCE(DATE(MAX(ngay_tao)), CURRENT_DATE) as max_date FROM orders.don_hang")
        if max_date_df.empty:
            return pd.DataFrame()
        max_date = max_date_df.iloc[0]["max_date"]
        
        # 2. Inject max_date as a literal to guarantee Index Scan
        return query_df(f"""
            SELECT
                COUNT(*) FILTER (WHERE ngay_tao >= '{max_date}'::date 
                                   AND ngay_tao < '{max_date}'::date + INTERVAL '1 day') AS orders_today,
                COUNT(*) FILTER (WHERE trang_thai_don_hang = 'HOAN_THANH'
                                   AND ngay_tao >= '{max_date}'::date 
                                   AND ngay_tao < '{max_date}'::date + INTERVAL '1 day') AS completed_today,
                COUNT(*) FILTER (WHERE trang_thai_don_hang = 'DA_HUY'
                                   AND ngay_tao >= '{max_date}'::date 
                                   AND ngay_tao < '{max_date}'::date + INTERVAL '1 day') AS cancelled_today,
                COUNT(*) FILTER (WHERE trang_thai_don_hang IN (
                    'DANG_GIAO','MOI_TAO','DA_XAC_NHAN','DANG_CHUAN_BI'
                ) AND ngay_tao >= '{max_date}'::date 
                  AND ngay_tao < '{max_date}'::date + INTERVAL '1 day') AS active_orders,
                COALESCE(SUM(tong_tien) FILTER (
                    WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                      AND ngay_tao >= '{max_date}'::date 
                      AND ngay_tao < '{max_date}'::date + INTERVAL '1 day'
                ), 0) AS revenue_today,
                COALESCE(SUM(tong_tien) FILTER (
                    WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                      AND ngay_tao >= '{max_date}'::date - INTERVAL '1 day'
                      AND ngay_tao < '{max_date}'::date
                ), 0) AS revenue_yesterday,
                COUNT(*) FILTER (WHERE ngay_tao >= '{max_date}'::date - INTERVAL '1 day'
                                   AND ngay_tao < '{max_date}'::date) AS orders_yesterday,
                '{max_date}'::date AS dashboard_date
            FROM orders.don_hang
            WHERE ngay_tao >= '{max_date}'::date - INTERVAL '1 day'
        """)

kpi = get_kpi()
if not kpi.empty:
    row = kpi.iloc[0]
    db_date = row.get("dashboard_date", "")
    if db_date:
        st.caption(f"Dữ liệu cập nhật tính đến ngày: **{db_date}**")
        
    o_today = int(row.get("orders_today", 0))
    o_yesterday = int(row.get("orders_yesterday", 0))
    rev_today = float(row.get("revenue_today", 0))
    rev_yesterday = float(row.get("revenue_yesterday", 0))
    
    order_delta = o_today - o_yesterday
    rev_delta = rev_today - rev_yesterday
    rev_delta_str = fmt_vnd(abs(rev_delta))
    rev_direction = "+" if rev_delta >= 0 else "-"

    c1, c2, c3, c4, c5 = st.columns(5)
    with c1: render_kpi_card("Tổng Đơn Hôm Nay", f"{o_today:,}", f"{'+' if order_delta >= 0 else ''}{order_delta} so với hôm qua")
    with c2: render_kpi_card("Đơn Hoàn Thành", f"{int(row.get('completed_today', 0)):,}")
    with c3: render_kpi_card("Đơn Đang Xử Lý", f"{int(row.get('active_orders', 0)):,}")
    with c4: render_kpi_card("Đơn Đã Hủy", f"{int(row.get('cancelled_today', 0)):,}")
    with c5: render_kpi_card("Doanh Thu Hôm Nay", fmt_vnd(rev_today), f"{rev_direction}{rev_delta_str} so với hôm qua")
else:
    st.warning("Không kết nối được cơ sở dữ liệu.")

st.markdown("<br>", unsafe_allow_html=True)
col_l, col_r = st.columns([3, 2], gap="large")

with col_l:
    render_section_title("Đơn Hàng & Doanh Thu theo Khung Giờ")

    @st.cache_data(ttl=86400, show_spinner=False)
    def get_hourly_orders():
        max_date_df = query_df("SELECT COALESCE(DATE(MAX(ngay_tao)), CURRENT_DATE) as max_date FROM orders.don_hang")
        if max_date_df.empty:
            return pd.DataFrame()
        max_date = max_date_df.iloc[0]["max_date"]
        
        return query_df(f"""
            SELECT EXTRACT(HOUR FROM ngay_tao)::int AS hour,
                   COUNT(*) AS orders,
                   COALESCE(SUM(tong_tien), 0) AS revenue
            FROM orders.don_hang
            WHERE ngay_tao >= '{max_date}'::date
              AND ngay_tao < '{max_date}'::date + INTERVAL '1 day'
            GROUP BY EXTRACT(HOUR FROM ngay_tao)
            ORDER BY hour
        """)

    hourly = get_hourly_orders()
    if not hourly.empty:
        fig = make_subplots(specs=[[{"secondary_y": True}]])
        fig.add_trace(go.Bar(x=hourly["hour"], y=hourly["orders"],
                             name="Số lượng đơn", marker_color=RED, opacity=0.85), secondary_y=False)
        fig.add_trace(go.Scatter(x=hourly["hour"], y=hourly["revenue"],
                                 name="Doanh thu (đ)", mode="lines+markers",
                                 line=dict(color="#2563EB", width=2.5), marker=dict(size=6)),
                      secondary_y=True)
        apply_layout(fig, height=360, margin=dict(l=50, r=60, t=40, b=50))
        fig.update_xaxes(title="Giờ trong ngày", dtick=1, range=[max(0, hourly["hour"].min()-1), min(23, hourly["hour"].max()+1)])
        fig.update_yaxes(title="Số đơn", secondary_y=False)
        fig.update_yaxes(title="Doanh thu (đ)", secondary_y=True)
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("Hôm nay chưa có dữ liệu đơn hàng.")

with col_r:
    render_section_title("Tỷ Lệ Trạng Thái Đơn Hàng (7 ngày)")

    @st.cache_data(ttl=86400, show_spinner=False)
    def get_order_status():
        max_d = get_max_date()
        return query_df(f"""
            SELECT trang_thai_don_hang, COUNT(*) AS count
            FROM orders.don_hang
            WHERE ngay_tao >= '{max_d}'::date - INTERVAL '7 days'
            GROUP BY trang_thai_don_hang
            ORDER BY count DESC
        """)

    status_df = get_order_status()
    if not status_df.empty:
        status_df["label"] = status_df["trang_thai_don_hang"].map(STATUS_LABELS).fillna(status_df["trang_thai_don_hang"])
        fig = px.pie(status_df, values="count", names="label",
                     color_discrete_sequence=COLORS, hole=0.5)
        apply_layout(fig, height=360, margin=dict(l=30, r=30, t=40, b=40))
        fig.update_traces(textposition="inside", textinfo="percent+label")
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("Không có dữ liệu trạng thái.")

st.markdown("<br>", unsafe_allow_html=True)
col_pm, col_rev = st.columns([2, 3], gap="large")

with col_pm:
    render_section_title("Phương Thức Thanh Toán (7 ngày)")
    @st.cache_data(ttl=86400, show_spinner=False)
    def get_payment_methods():
        max_d = get_max_date()
        return query_df(f"""
            SELECT phuong_thuc_thanh_toan, COUNT(*) AS count
            FROM orders.don_hang
            WHERE ngay_tao >= '{max_d}'::date - INTERVAL '7 days'
            GROUP BY phuong_thuc_thanh_toan
        """)
    pm_df = get_payment_methods()
    if not pm_df.empty:
        pm_df["label"] = pm_df["phuong_thuc_thanh_toan"].map(PAYMENT_LABELS).fillna(pm_df["phuong_thuc_thanh_toan"])
        fig_pm = px.pie(pm_df, values="count", names="label", hole=0.4,
                        color_discrete_sequence=["#10B981", "#3B82F6", "#F59E0B", "#EF4444"])
        apply_layout(fig_pm, height=360, margin=dict(l=20, r=20, t=30, b=20))
        st.plotly_chart(fig_pm, use_container_width=True)
    else:
        st.info("Chưa có dữ liệu thanh toán.")

with col_rev:
    render_section_title("Xu Hướng Doanh Thu (7 Ngày Qua)")
    @st.cache_data(ttl=86400, show_spinner=False)
    def get_7d_revenue():
        max_d = get_max_date()
        return query_df(f"""
            SELECT DATE(ngay_tao) AS date, SUM(tong_tien) AS revenue
            FROM orders.don_hang
            WHERE ngay_tao >= '{max_d}'::date - INTERVAL '7 days'
              AND trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
            GROUP BY DATE(ngay_tao)
            ORDER BY date
        """)
    rev7d_df = get_7d_revenue()
    if not rev7d_df.empty:
        fig_rev7 = px.area(rev7d_df, x="date", y="revenue",
                           color_discrete_sequence=["#2ED573"],
                           labels={"revenue": "Doanh thu", "date": "Ngày"})
        fig_rev7.update_traces(fillcolor="rgba(46, 213, 115, 0.15)", line=dict(width=3))
        apply_layout(fig_rev7, height=360, margin=dict(l=50, r=20, t=30, b=40))
        st.plotly_chart(fig_rev7, use_container_width=True)
    else:
        st.info("Chưa có dữ liệu doanh thu.")

st.markdown("<br>", unsafe_allow_html=True)
render_section_title("Danh Sách Đơn Hàng Gần Nhất")

@st.cache_data(ttl=86400, show_spinner=False)
def get_recent_orders():
    return query_df("""
        SELECT
            ma_don_hang::text      AS ma_don,
            trang_thai_don_hang    AS trang_thai,
            phuong_thuc_thanh_toan AS thanh_toan,
            co_so_ma               AS chi_nhanh,
            tong_tien,
            ngay_tao
        FROM orders.don_hang
        ORDER BY ngay_tao DESC
        LIMIT 15
    """)

recent = get_recent_orders()
if not recent.empty:
    display = recent.copy()
    display["ma_don"] = display["ma_don"].str[:8].str.upper()
    display["trang_thai"] = display["trang_thai"].map(STATUS_LABELS).fillna(display["trang_thai"])
    display["thanh_toan"] = display["thanh_toan"].map(PAYMENT_LABELS).fillna(display["thanh_toan"])
    display["tong_tien"] = display["tong_tien"].apply(lambda x: fmt_vnd(x) if pd.notna(x) else "—")
    display["ngay_tao"] = pd.to_datetime(display["ngay_tao"]).dt.strftime("%d/%m %H:%M")
    display.columns = ["Mã Đơn Hàng", "Trạng Thái", "Thanh Toán", "Chi Nhánh", "Tổng Tiền", "Thời Gian Tạo"]
    st.dataframe(display, use_container_width=True, hide_index=True, height=360)
else:
    st.info("Chưa có dữ liệu đơn hàng.")
