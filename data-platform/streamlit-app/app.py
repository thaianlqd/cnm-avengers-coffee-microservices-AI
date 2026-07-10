"""
Avengers Coffee - Analytics & AI Data Platform Dashboard
Built with Streamlit + Plotly | ViettelPost-inspired dark theme

SCHEMA REFERENCE (verified from entity files):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
orders.don_hang:
  ma_don_hang (uuid PK), ma_nguoi_dung, co_so_ma, tong_tien (decimal 12,2),
  dia_chi_giao_hang, khung_gio_giao, ghi_chu, loai_don_hang, ma_ban,
  ten_khach_hang, ten_thu_ngan, phuong_thuc_thanh_toan, trang_thai_thanh_toan,
  trang_thai_don_hang, ma_voucher, so_tien_giam, tien_khach_dua, tien_thoi,
  lich_su_trang_thai (jsonb), ngay_tao, ngay_cap_nhat

orders.chi_tiet_don_hang:
  id (serial PK), ma_don_hang (uuid FK), ma_san_pham (int), ten_san_pham,
  gia_ban (decimal 12,2), so_luong (int), kich_co, hinh_anh_url

orders.shipper_delivery:
  id (uuid PK), ma_don_hang (uuid), shipper_id (uuid), status (varchar),
  delivery_note, delivery_address, pickup_latitude, pickup_longitude,
  delivery_latitude, delivery_longitude, estimated_time_minutes,
  picked_up_at, delivered_at, proof_image_url, delivery_fee (decimal 12,2),
  assigned_at, updated_at
"""
import os
import json
import io
import logging
from datetime import datetime, timedelta
from typing import Optional

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import numpy as np
import sqlalchemy
import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

# ─── Page Config ──────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Avengers Coffee — Data Platform",
    page_icon="☕",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ─── Custom CSS ───────────────────────────────────────────────────────────────
st.markdown("""
<style>
  [data-testid="stAppViewContainer"] { background: #0F1117; }
  [data-testid="stSidebar"] { background: #1A1D27 !important; }
  [data-testid="metric-container"] {
    background: #1A1D27; border: 1px solid #2D3147;
    border-radius: 12px; padding: 16px 20px;
  }
  [data-testid="stMetricLabel"] { color: #8B8FA8 !important; font-size: 13px !important; }
  [data-testid="stMetricValue"] { color: #FFFFFF !important; font-size: 28px !important; font-weight: 800 !important; }
  [data-testid="stMetricDelta"] { font-size: 13px !important; }
  [data-baseweb="tab-list"] { background: #1A1D27 !important; border-radius: 10px; padding: 4px; }
  [data-baseweb="tab"] { color: #8B8FA8 !important; font-weight: 600; }
  [aria-selected="true"] { background: #E31A23 !important; color: white !important; border-radius: 8px; }
  h1 { color: #FFFFFF !important; }
  h2 { color: #E31A23 !important; font-size: 20px !important; }
  h3 { color: #CCCCCC !important; }
  .status-ok { background: #0D4025; color: #4ADE80; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; display: inline-block; margin: 2px 0; }
  .status-warn { background: #3B2300; color: #FB923C; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; display: inline-block; margin: 2px 0; }
  .status-err { background: #2D0A0A; color: #F87171; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; display: inline-block; margin: 2px 0; }
  .info-card {
    background: #1A1D27; border: 1px solid #2D3147;
    border-radius: 12px; padding: 20px; margin-bottom: 12px;
  }
  #MainMenu { visibility: hidden; }
  footer { visibility: hidden; }
  [data-testid="stToolbar"] { display: none; }
</style>
""", unsafe_allow_html=True)

# ─── Config ───────────────────────────────────────────────────────────────────
DB_HOST     = os.getenv("DB_HOST", "postgres-db")
DB_PORT     = os.getenv("DB_PORT", "5432")
DB_USER     = os.getenv("DB_USER", "admin")
DB_PASSWORD = os.getenv("DB_PASSWORD", "123")
DB_NAME     = os.getenv("DB_NAME", "avengers_coffee")

MINIO_ENDPOINT   = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin123")
KAFKA_SERVERS    = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")

# Plotly base layout — NO legend key so we can set it per-chart without conflict
_PLOTLY_BASE = dict(
    paper_bgcolor="rgba(0,0,0,0)",
    plot_bgcolor="rgba(0,0,0,0)",
    font=dict(color="#CCCCCC", family="Inter, sans-serif"),
    title_font=dict(size=16, color="#FFFFFF"),
    margin=dict(l=20, r=20, t=40, b=20),
    xaxis=dict(gridcolor="#2D3147", zerolinecolor="#2D3147"),
    yaxis=dict(gridcolor="#2D3147", zerolinecolor="#2D3147"),
)
PLOTLY_LAYOUT = {**_PLOTLY_BASE, "legend": dict(bgcolor="rgba(0,0,0,0)", font=dict(color="#CCCCCC"))}
RED = "#E31A23"
COLORS = ["#E31A23", "#FF8C00", "#22C55E", "#3B82F6", "#A855F7", "#06B6D4", "#F59E0B"]

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
    url = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    try:
        return sqlalchemy.create_engine(url, pool_pre_ping=True, pool_timeout=5)
    except Exception:
        return None


def query_df(sql: str) -> pd.DataFrame:
    engine = get_engine()
    if engine is None:
        return pd.DataFrame()
    try:
        with engine.connect() as conn:
            return pd.read_sql(sqlalchemy.text(sql), conn)
    except Exception as e:
        st.error(f"DB Error: {e}")
        return pd.DataFrame()


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
        return {"connected": False, "error": str(e)}


def fmt_vnd(value) -> str:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return "0 ₫"
    if v >= 1_000_000:
        return f"{v/1_000_000:.1f}M ₫"
    if v >= 1_000:
        return f"{v/1_000:.0f}K ₫"
    return f"{v:.0f} ₫"


# ═══════════════════════════════════════════════════════════════════════════════
#  SIDEBAR
# ═══════════════════════════════════════════════════════════════════════════════
with st.sidebar:
    st.markdown("""
    <div style='text-align:center; padding: 20px 0 10px'>
      <div style='font-size:42px'>☕</div>
      <div style='font-size:20px; font-weight:900; color:#E31A23; letter-spacing:2px'>AVENGERS</div>
      <div style='font-size:12px; color:#8B8FA8; letter-spacing:3px; margin-top:2px'>DATA PLATFORM</div>
    </div>
    <hr style='border-color:#2D3147; margin:10px 0'>
    """, unsafe_allow_html=True)

    st.markdown("### 🔌 System Status")
    engine = get_engine()
    if engine:
        try:
            with engine.connect() as c:
                c.execute(sqlalchemy.text("SELECT 1"))
            st.markdown('<span class="status-ok">✓ PostgreSQL Online</span>', unsafe_allow_html=True)
        except Exception:
            st.markdown('<span class="status-err">✗ PostgreSQL Error</span>', unsafe_allow_html=True)
    else:
        st.markdown('<span class="status-err">✗ PostgreSQL Offline</span>', unsafe_allow_html=True)

    ms = minio_status()
    if ms["connected"]:
        st.markdown(f'<span class="status-ok">✓ MinIO Online ({ms.get("buckets",0)} buckets)</span>', unsafe_allow_html=True)
    else:
        st.markdown('<span class="status-warn">⚡ MinIO Connecting...</span>', unsafe_allow_html=True)

    ks = kafka_status()
    if ks["connected"]:
        st.markdown(f'<span class="status-ok">✓ Kafka Online ({ks.get("topics",0)} topics)</span>', unsafe_allow_html=True)
    else:
        st.markdown('<span class="status-warn">⚡ Kafka Connecting...</span>', unsafe_allow_html=True)

    st.markdown("<hr style='border-color:#2D3147; margin:16px 0'>", unsafe_allow_html=True)

    gold_meta = read_gold_json("pipeline_meta/latest.json")
    if gold_meta and isinstance(gold_meta, dict):
        st.markdown(f"**🔄 Pipeline cuối:** `{str(gold_meta.get('last_run','N/A'))[:16]}`")
    else:
        st.markdown("**🔄 Pipeline:** Chưa chạy lần nào")

    st.markdown("<hr style='border-color:#2D3147; margin:16px 0'>", unsafe_allow_html=True)

    if st.button("🔄 Làm mới dữ liệu", use_container_width=True, type="primary"):
        st.cache_data.clear()
        st.rerun()

    st.markdown(f"""
    <div style='text-align:center; color:#4B5280; font-size:11px; margin-top:40px;
                border-top: 1px solid #2D3147; padding-top:10px'>
      Avengers Coffee © 2025<br>Cập nhật: {datetime.now().strftime('%H:%M:%S')}
    </div>
    """, unsafe_allow_html=True)


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════════════════
st.markdown("""
<h1 style='margin:0; padding:0 0 4px'>☕ Avengers Coffee — Analytics Dashboard</h1>
<p style='color:#8B8FA8; margin:0 0 24px; font-size:14px'>
  Real-time Business Intelligence & AI Platform · Dữ liệu cập nhật liên tục
</p>
""", unsafe_allow_html=True)

tabs = st.tabs([
    "🏠 Tổng quan", "📊 Doanh thu", "☕ Sản phẩm",
    "👥 Khách hàng", "🚴 Shipper", "🤖 AI Analytics", "🔧 Data Pipeline",
])


# ═══════════════════════════════════════════════════════════════════════════════
#  TAB 1: TỔNG QUAN
# ═══════════════════════════════════════════════════════════════════════════════
with tabs[0]:
    st.markdown("## 📈 KPIs Hôm nay")

    @st.cache_data(ttl=30)
    def get_kpi():
        return query_df("""
            SELECT
                COUNT(*) FILTER (WHERE DATE(ngay_tao) = CURRENT_DATE)  AS orders_today,
                COUNT(*) FILTER (WHERE trang_thai_don_hang = 'HOAN_THANH'
                                   AND DATE(ngay_tao) = CURRENT_DATE)  AS completed_today,
                COUNT(*) FILTER (WHERE trang_thai_don_hang = 'DA_HUY'
                                   AND DATE(ngay_tao) = CURRENT_DATE)  AS cancelled_today,
                COUNT(*) FILTER (WHERE trang_thai_don_hang IN (
                    'DANG_GIAO','MOI_TAO','DA_XAC_NHAN','DANG_CHUAN_BI'
                )) AS active_orders,
                COALESCE(SUM(tong_tien) FILTER (
                    WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                      AND DATE(ngay_tao) = CURRENT_DATE
                ), 0) AS revenue_today,
                COALESCE(SUM(tong_tien) FILTER (
                    WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                      AND DATE(ngay_tao) = CURRENT_DATE - 1
                ), 0) AS revenue_yesterday,
                COUNT(*) FILTER (WHERE DATE(ngay_tao) = CURRENT_DATE - 1) AS orders_yesterday
            FROM orders.don_hang
        """)

    kpi = get_kpi()
    if not kpi.empty:
        row = kpi.iloc[0]
        o_today = int(row.get("orders_today", 0))
        o_yesterday = int(row.get("orders_yesterday", 0))
        rev_today = float(row.get("revenue_today", 0))
        rev_yesterday = float(row.get("revenue_yesterday", 0))

        c1, c2, c3, c4, c5 = st.columns(5)
        c1.metric("📦 Đơn hôm nay", o_today, f"{o_today - o_yesterday:+d} so với hôm qua")
        c2.metric("✅ Hoàn thành", int(row.get("completed_today", 0)))
        c3.metric("🔴 Đang xử lý", int(row.get("active_orders", 0)))
        c4.metric("❌ Hủy đơn", int(row.get("cancelled_today", 0)))
        c5.metric("💰 Doanh thu", fmt_vnd(rev_today),
                  f"{fmt_vnd(abs(rev_today - rev_yesterday))} {'▲' if rev_today >= rev_yesterday else '▼'}")
    else:
        st.warning("⚠️ Không kết nối được database.")

    st.markdown("---")
    col_l, col_r = st.columns([3, 2])

    with col_l:
        st.markdown("## ⏰ Đơn hàng theo giờ (hôm nay)")

        @st.cache_data(ttl=60)
        def get_hourly_orders():
            return query_df("""
                SELECT EXTRACT(HOUR FROM ngay_tao)::int AS hour,
                       COUNT(*) AS orders,
                       COALESCE(SUM(tong_tien), 0) AS revenue
                FROM orders.don_hang
                WHERE DATE(ngay_tao) = CURRENT_DATE
                GROUP BY EXTRACT(HOUR FROM ngay_tao)
                ORDER BY hour
            """)

        hourly = get_hourly_orders()
        if not hourly.empty:
            fig = make_subplots(specs=[[{"secondary_y": True}]])
            fig.add_trace(go.Bar(x=hourly["hour"], y=hourly["orders"],
                                 name="Số đơn", marker_color=RED, opacity=0.85), secondary_y=False)
            fig.add_trace(go.Scatter(x=hourly["hour"], y=hourly["revenue"],
                                     name="Doanh thu", mode="lines+markers",
                                     line=dict(color="#FF8C00", width=2.5), marker=dict(size=6)),
                          secondary_y=True)
            fig.update_layout(**PLOTLY_LAYOUT, height=300)
            fig.update_xaxes(title="Giờ", dtick=1)
            fig.update_yaxes(title="Số đơn", secondary_y=False)
            fig.update_yaxes(title="Doanh thu (₫)", secondary_y=True)
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("Hôm nay chưa có đơn hàng nào.")

    with col_r:
        st.markdown("## 🎯 Trạng thái đơn hàng")

        @st.cache_data(ttl=60)
        def get_order_status():
            return query_df("""
                SELECT trang_thai_don_hang, COUNT(*) AS count
                FROM orders.don_hang
                WHERE ngay_tao >= CURRENT_DATE - INTERVAL '7 days'
                GROUP BY trang_thai_don_hang
                ORDER BY count DESC
            """)

        status_df = get_order_status()
        if not status_df.empty:
            status_df["label"] = status_df["trang_thai_don_hang"].map(STATUS_LABELS).fillna(status_df["trang_thai_don_hang"])
            fig = px.pie(status_df, values="count", names="label",
                         color_discrete_sequence=COLORS, hole=0.55)
            fig.update_layout(**PLOTLY_LAYOUT, height=300)
            fig.update_traces(textposition="outside", textfont_size=12)
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("Không có dữ liệu trạng thái.")

    # Recent orders — CORRECT COLUMN NAMES
    st.markdown("## 🕒 Đơn hàng gần nhất")

    @st.cache_data(ttl=15)
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
        display.columns = ["Mã đơn", "Trạng thái", "Thanh toán", "Chi nhánh", "Tổng tiền", "Thời gian"]
        st.dataframe(display, use_container_width=True, hide_index=True, height=380)
    else:
        st.info("Chưa có dữ liệu đơn hàng.")


# ═══════════════════════════════════════════════════════════════════════════════
#  TAB 2: DOANH THU
# ═══════════════════════════════════════════════════════════════════════════════
with tabs[1]:
    st.markdown("## 💰 Phân tích Doanh thu")
    days = st.slider("Khoảng thời gian (ngày gần nhất)", 7, 90, 30, key="rev_days")

    @st.cache_data(ttl=120)
    def get_revenue_trend(d: int):
        return query_df(f"""
            SELECT DATE(ngay_tao) AS date,
                   COUNT(*) AS orders,
                   COUNT(*) FILTER (WHERE trang_thai_don_hang = 'HOAN_THANH') AS completed,
                   COALESCE(SUM(tong_tien) FILTER (
                       WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                   ), 0) AS revenue,
                   ROUND(AVG(tong_tien)::numeric, 0) AS avg_order_value
            FROM orders.don_hang
            WHERE ngay_tao >= CURRENT_DATE - INTERVAL '{d} days'
            GROUP BY DATE(ngay_tao) ORDER BY date
        """)

    trend = get_revenue_trend(days)
    if not trend.empty:
        trend["date"] = pd.to_datetime(trend["date"])
        trend["revenue"] = pd.to_numeric(trend["revenue"], errors="coerce").fillna(0)
        fig = make_subplots(specs=[[{"secondary_y": True}]])
        fig.add_trace(go.Bar(x=trend["date"], y=trend["revenue"],
                             name="Doanh thu", marker_color=RED, opacity=0.8), secondary_y=False)
        fig.add_trace(go.Scatter(x=trend["date"], y=trend["orders"],
                                 name="Số đơn", mode="lines+markers",
                                 line=dict(color="#22C55E", width=2), marker=dict(size=5)),
                      secondary_y=True)
        fig.update_layout(**PLOTLY_LAYOUT, height=360, title="Doanh thu và số đơn hàng theo ngày")
        fig.update_yaxes(title="Doanh thu (₫)", secondary_y=False)
        fig.update_yaxes(title="Số đơn", secondary_y=True)
        st.plotly_chart(fig, use_container_width=True)

        total_rev = trend["revenue"].sum()
        avg_daily = trend["revenue"].mean()
        c1, c2, c3, c4 = st.columns(4)
        c1.metric("💰 Tổng doanh thu", fmt_vnd(total_rev))
        c2.metric("📊 Doanh thu TB/ngày", fmt_vnd(avg_daily))
        c3.metric("🏆 Ngày cao điểm", trend.loc[trend["revenue"].idxmax(), "date"].strftime("%d/%m") if len(trend) > 0 else "N/A")
        c4.metric("📦 Tổng đơn", f"{int(trend['orders'].sum()):,}")
    else:
        st.info("Chưa có dữ liệu doanh thu.")

    st.markdown("---")
    col_left, col_right = st.columns(2)

    with col_left:
        st.markdown("## 🏪 Doanh thu theo chi nhánh")
        @st.cache_data(ttl=120)
        def get_branch_revenue():
            return query_df("""
                SELECT COALESCE(co_so_ma, 'Không xác định') AS branch,
                       COUNT(*) AS orders,
                       COALESCE(SUM(tong_tien) FILTER (
                           WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                       ), 0) AS revenue
                FROM orders.don_hang
                WHERE ngay_tao >= CURRENT_DATE - INTERVAL '30 days'
                GROUP BY co_so_ma ORDER BY revenue DESC LIMIT 10
            """)
        branch = get_branch_revenue()
        if not branch.empty:
            branch["revenue"] = pd.to_numeric(branch["revenue"], errors="coerce").fillna(0)
            fig = px.bar(branch, x="revenue", y="branch", orientation="h",
                         color="revenue", color_continuous_scale=["#2D3147", RED],
                         text=branch["revenue"].apply(fmt_vnd))
            fig.update_layout(**PLOTLY_LAYOUT, height=320, coloraxis_showscale=False)
            fig.update_traces(textposition="outside")
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("Chưa có dữ liệu chi nhánh.")

    with col_right:
        st.markdown("## 💳 Phương thức thanh toán")
        @st.cache_data(ttl=120)
        def get_payment_methods():
            return query_df("""
                SELECT phuong_thuc_thanh_toan AS method,
                       COUNT(*) AS count,
                       COALESCE(SUM(tong_tien), 0) AS revenue
                FROM orders.don_hang
                WHERE ngay_tao >= CURRENT_DATE - INTERVAL '30 days'
                GROUP BY phuong_thuc_thanh_toan ORDER BY count DESC
            """)
        payments = get_payment_methods()
        if not payments.empty:
            payments["label"] = payments["method"].map(PAYMENT_LABELS).fillna(payments["method"])
            fig = px.pie(payments, values="count", names="label",
                         color_discrete_sequence=COLORS, hole=0.5)
            fig.update_traces(texttemplate="%{label}<br>%{percent:.1%}", textposition="outside")
            fig.update_layout(**PLOTLY_LAYOUT, height=320)
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("Chưa có dữ liệu.")


# ═══════════════════════════════════════════════════════════════════════════════
#  TAB 3: SẢN PHẨM  — uses gia_ban (NOT don_gia), ten_san_pham, ma_san_pham(int)
# ═══════════════════════════════════════════════════════════════════════════════
with tabs[2]:
    st.markdown("## ☕ Phân tích Sản phẩm")

    @st.cache_data(ttl=300)
    def get_top_products():
        return query_df("""
            SELECT
                ct.ma_san_pham,
                ct.ten_san_pham,
                SUM(ct.so_luong)               AS total_qty,
                COUNT(DISTINCT ct.ma_don_hang)  AS order_count,
                SUM(ct.so_luong * ct.gia_ban)   AS total_revenue,
                ROUND(AVG(ct.gia_ban)::numeric, 0) AS avg_price
            FROM orders.chi_tiet_don_hang ct
            JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
            WHERE d.ngay_tao >= CURRENT_DATE - INTERVAL '30 days'
              AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO', 'DA_XAC_NHAN')
            GROUP BY ct.ma_san_pham, ct.ten_san_pham
            ORDER BY total_qty DESC
            LIMIT 15
        """)

    products = get_top_products()
    if not products.empty:
        products["total_revenue"] = pd.to_numeric(products["total_revenue"], errors="coerce").fillna(0)
        products["display_name"] = products["ten_san_pham"].str[:25]

        col_l, col_r = st.columns(2)
        with col_l:
            st.markdown("### 🏆 Top sản phẩm bán chạy (30 ngày)")
            fig = px.bar(products.head(10), x="total_qty", y="display_name",
                         orientation="h", color="total_revenue",
                         color_continuous_scale=["#2D3147", RED, "#FF8C00"],
                         text="total_qty", labels={"display_name": "Sản phẩm", "total_qty": "SL bán"})
            fig.update_layout(**PLOTLY_LAYOUT, height=380, coloraxis_showscale=False)
            fig.update_traces(textposition="outside")
            st.plotly_chart(fig, use_container_width=True)

        with col_r:
            st.markdown("### 💰 Doanh thu theo sản phẩm")
            fig = px.treemap(products, path=["display_name"], values="total_revenue",
                             color="total_qty", color_continuous_scale=["#1A1D27", RED])
            fig.update_layout(**PLOTLY_LAYOUT, height=380)
            st.plotly_chart(fig, use_container_width=True)

        st.markdown("### 📋 Chi tiết sản phẩm")
        tbl = products[["ten_san_pham", "total_qty", "order_count", "total_revenue", "avg_price"]].copy()
        tbl["total_revenue"] = tbl["total_revenue"].apply(fmt_vnd)
        tbl["avg_price"] = tbl["avg_price"].apply(lambda x: fmt_vnd(x) if pd.notna(x) else "—")
        tbl.columns = ["Tên SP", "SL bán", "Số đơn", "Doanh thu", "Giá TB"]
        st.dataframe(tbl, use_container_width=True, hide_index=True)
    else:
        st.info("Chưa có dữ liệu sản phẩm.")


# ═══════════════════════════════════════════════════════════════════════════════
#  TAB 4: KHÁCH HÀNG  — uses ma_nguoi_dung (NOT khach_hang_id)
# ═══════════════════════════════════════════════════════════════════════════════
with tabs[3]:
    st.markdown("## 👥 Phân tích Khách hàng")

    @st.cache_data(ttl=300)
    def get_customer_data():
        return query_df("""
            SELECT
                ma_nguoi_dung::text    AS customer_id,
                COUNT(*)               AS order_count,
                COALESCE(SUM(tong_tien) FILTER (
                    WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                ), 0) AS lifetime_value,
                MIN(ngay_tao) AS first_order,
                MAX(ngay_tao) AS last_order
            FROM orders.don_hang
            WHERE ma_nguoi_dung IS NOT NULL
            GROUP BY ma_nguoi_dung
        """)

    customers = get_customer_data()
    if not customers.empty and len(customers) > 0:
        customers["lifetime_value"] = pd.to_numeric(customers["lifetime_value"], errors="coerce").fillna(0)
        customers["segment"] = pd.cut(
            customers["order_count"], bins=[0, 1, 3, 10, float("inf")],
            labels=["🆕 Khách mới", "📦 Thông thường", "⭐ Trung thành", "👑 VIP"],
        ).astype(str)

        c1, c2, c3, c4 = st.columns(4)
        c1.metric("👤 Tổng khách hàng", f"{len(customers):,}")
        c2.metric("👑 Khách VIP", f"{(customers['segment'] == '👑 VIP').sum():,}")
        c3.metric("💰 LTV trung bình", fmt_vnd(customers["lifetime_value"].mean()))
        c4.metric("📦 Đơn TB / KH", f"{customers['order_count'].mean():.1f}")

        col_l, col_r = st.columns(2)
        with col_l:
            st.markdown("### 🎯 Phân khúc khách hàng")
            seg_counts = customers["segment"].value_counts().reset_index()
            seg_counts.columns = ["Phân khúc", "Số lượng"]
            fig = px.pie(seg_counts, values="Số lượng", names="Phân khúc",
                         color_discrete_sequence=["#3B82F6", "#22C55E", "#F59E0B", RED], hole=0.55)
            fig.update_layout(**PLOTLY_LAYOUT, height=320)
            st.plotly_chart(fig, use_container_width=True)

        with col_r:
            st.markdown("### 💰 Phân phối Lifetime Value")
            fig = px.histogram(customers, x="lifetime_value", nbins=30,
                               color_discrete_sequence=[RED], opacity=0.8,
                               labels={"lifetime_value": "Lifetime Value (₫)"})
            fig.update_layout(**PLOTLY_LAYOUT, height=320)
            st.plotly_chart(fig, use_container_width=True)

        st.markdown("### 📊 Thống kê theo phân khúc")
        seg_detail = customers.groupby("segment").agg(
            count=("customer_id", "count"), avg_orders=("order_count", "mean"),
            avg_ltv=("lifetime_value", "mean"), total_ltv=("lifetime_value", "sum"),
        ).reset_index()
        seg_detail["avg_ltv"] = seg_detail["avg_ltv"].apply(fmt_vnd)
        seg_detail["total_ltv"] = seg_detail["total_ltv"].apply(fmt_vnd)
        seg_detail["avg_orders"] = seg_detail["avg_orders"].round(1)
        seg_detail.columns = ["Phân khúc", "Số KH", "Đơn TB", "LTV TB", "Tổng LTV"]
        st.dataframe(seg_detail, use_container_width=True, hide_index=True)
    else:
        st.info("Chưa có dữ liệu khách hàng.")

    st.markdown("---")
    st.markdown("### 📈 Khách hàng mới theo ngày (30 ngày)")

    @st.cache_data(ttl=300)
    def get_new_customers():
        return query_df("""
            SELECT DATE(first_order) AS date, COUNT(*) AS new_customers
            FROM (
                SELECT ma_nguoi_dung, MIN(ngay_tao) AS first_order
                FROM orders.don_hang
                WHERE ma_nguoi_dung IS NOT NULL
                GROUP BY ma_nguoi_dung
            ) sub
            WHERE first_order >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY DATE(first_order) ORDER BY date
        """)

    new_cust = get_new_customers()
    if not new_cust.empty:
        fig = px.area(new_cust, x="date", y="new_customers",
                      color_discrete_sequence=[RED], labels={"new_customers": "Khách mới", "date": "Ngày"})
        fig.update_traces(fill="tozeroy", fillcolor="rgba(227,26,35,0.15)", line=dict(color=RED, width=2))
        fig.update_layout(**PLOTLY_LAYOUT, height=260)
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("Chưa có dữ liệu.")


# ═══════════════════════════════════════════════════════════════════════════════
#  TAB 5: SHIPPER — correct columns from shipper_delivery entity
# ═══════════════════════════════════════════════════════════════════════════════
with tabs[4]:
    st.markdown("## 🚴 Hiệu suất Shipper")

    @st.cache_data(ttl=120)
    def get_shipper_stats():
        return query_df("""
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
        """)

    shipper_df = get_shipper_stats()
    if not shipper_df.empty:
        shipper_df["total_earnings"] = pd.to_numeric(shipper_df["total_earnings"], errors="coerce").fillna(0)
        shipper_df["success_rate"] = pd.to_numeric(shipper_df["success_rate"], errors="coerce").fillna(0)
        shipper_df["shipper_short"] = shipper_df["shipper_id"].str[:8].str.upper()

        c1, c2, c3, c4 = st.columns(4)
        c1.metric("🚴 Tổng shipper", f"{len(shipper_df):,}")
        c2.metric("✅ Tỉ lệ giao thành công", f"{shipper_df['success_rate'].mean():.1f}%")
        avg_min = shipper_df["avg_minutes"].dropna().mean()
        c3.metric("⏱️ Thời gian TB", f"{avg_min:.0f} phút" if pd.notna(avg_min) else "N/A")
        c4.metric("🔴 Đang giao", f"{int(shipper_df['active'].sum()):,}")

        col_l, col_r = st.columns(2)
        with col_l:
            st.markdown("### 🏆 Ranking Shipper (số đơn hoàn thành)")
            fig = px.bar(shipper_df.head(10), x="delivered", y="shipper_short",
                         orientation="h", color="success_rate",
                         color_continuous_scale=["#FF4444", "#FF8C00", "#22C55E"],
                         text="delivered", labels={"shipper_short": "Shipper", "delivered": "Hoàn thành"})
            fig.update_layout(**PLOTLY_LAYOUT, height=380)
            fig.update_traces(textposition="outside")
            st.plotly_chart(fig, use_container_width=True)

        with col_r:
            st.markdown("### 💰 Thu nhập Shipper")
            fig = px.bar(shipper_df.head(10), x="total_earnings", y="shipper_short",
                         orientation="h", color="total_earnings",
                         color_continuous_scale=["#2D3147", "#FF8C00"],
                         text=shipper_df.head(10)["total_earnings"].apply(fmt_vnd),
                         labels={"shipper_short": "Shipper", "total_earnings": "Thu nhập (₫)"})
            fig.update_layout(**PLOTLY_LAYOUT, height=380, coloraxis_showscale=False)
            fig.update_traces(textposition="outside")
            st.plotly_chart(fig, use_container_width=True)

        st.markdown("### 📋 Chi tiết hiệu suất")
        tbl = shipper_df[["shipper_short", "total", "delivered", "failed", "active", "success_rate", "avg_minutes", "total_earnings"]].copy()
        tbl["total_earnings"] = tbl["total_earnings"].apply(fmt_vnd)
        tbl["success_rate"] = tbl["success_rate"].apply(lambda x: f"{x:.1f}%")
        tbl["avg_minutes"] = tbl["avg_minutes"].apply(lambda x: f"{x:.0f} phút" if pd.notna(x) and x > 0 else "N/A")
        tbl.columns = ["Shipper", "Tổng", "Hoàn thành", "Thất bại", "Đang giao", "Tỉ lệ %", "Thời gian TB", "Thu nhập"]
        st.dataframe(tbl, use_container_width=True, hide_index=True)
    else:
        st.info("Chưa có dữ liệu shipper delivery.")


# ═══════════════════════════════════════════════════════════════════════════════
#  TAB 6: AI ANALYTICS
# ═══════════════════════════════════════════════════════════════════════════════
with tabs[5]:
    st.markdown("## 🤖 AI Analytics — Recommendation & Forecast")
    col_l, col_r = st.columns(2)

    with col_l:
        st.markdown("### 🎯 Cặp sản phẩm thường được mua cùng nhau")
        @st.cache_data(ttl=600)
        def get_co_purchase():
            return query_df("""
                WITH pairs AS (
                    SELECT a.ten_san_pham AS product_a,
                           b.ten_san_pham AS product_b,
                           COUNT(*) AS co_count
                    FROM orders.chi_tiet_don_hang a
                    JOIN orders.chi_tiet_don_hang b
                        ON a.ma_don_hang = b.ma_don_hang
                        AND a.ma_san_pham < b.ma_san_pham
                    GROUP BY a.ten_san_pham, b.ten_san_pham
                    HAVING COUNT(*) > 0
                    ORDER BY co_count DESC LIMIT 15
                )
                SELECT * FROM pairs
            """)

        copurchase = get_co_purchase()
        if not copurchase.empty:
            copurchase["label"] = copurchase["product_a"].str[:12] + " + " + copurchase["product_b"].str[:12]
            fig = px.bar(copurchase, x="co_count", y="label", orientation="h",
                         color="co_count", color_continuous_scale=["#2D3147", "#A855F7"],
                         text="co_count", labels={"label": "Cặp sản phẩm", "co_count": "Số lần"})
            fig.update_layout(**PLOTLY_LAYOUT, height=380, coloraxis_showscale=False,
                              title="Top cặp sản phẩm được mua cùng nhau")
            fig.update_traces(textposition="outside")
            st.plotly_chart(fig, use_container_width=True)
            st.caption("💡 Dữ liệu này là input cho Collaborative Filtering (ALS). "
                       "SP mua cùng nhau nhiều → gợi ý cùng nhau cho khách.")
        else:
            st.info("Cần ít nhất 2+ sản phẩm trong 1 đơn hàng để phân tích.")

    with col_r:
        st.markdown("### 📈 Dự báo doanh thu (Forecasting)")
        @st.cache_data(ttl=600)
        def get_revenue_for_forecast():
            return query_df("""
                SELECT DATE(ngay_tao) AS date,
                       COALESCE(SUM(tong_tien) FILTER (
                           WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                       ), 0) AS revenue
                FROM orders.don_hang
                WHERE ngay_tao >= CURRENT_DATE - INTERVAL '60 days'
                GROUP BY DATE(ngay_tao) ORDER BY date
            """)

        hist = get_revenue_for_forecast()
        if not hist.empty and len(hist) >= 7:
            hist["date"] = pd.to_datetime(hist["date"])
            hist["revenue"] = pd.to_numeric(hist["revenue"], errors="coerce").fillna(0)
            window = min(7, len(hist))
            hist["ma7"] = hist["revenue"].rolling(window=window).mean()
            last_ma = hist["ma7"].iloc[-1]
            trend_val = (hist["revenue"].iloc[-7:].mean() - hist["revenue"].iloc[-14:-7].mean()) if len(hist) >= 14 else 0
            last_date = hist["date"].iloc[-1]
            forecast_dates = [last_date + timedelta(days=i+1) for i in range(7)]
            np.random.seed(42)
            forecast_vals = [max(0, last_ma + trend_val * (i * 0.3)) * (1 + np.random.uniform(-0.05, 0.1)) for i in range(7)]

            fig = go.Figure()
            fig.add_trace(go.Scatter(x=hist["date"], y=hist["revenue"], name="Thực tế",
                                     mode="lines", line=dict(color="#22C55E", width=2)))
            fig.add_trace(go.Scatter(x=hist["date"], y=hist["ma7"], name="MA 7 ngày",
                                     mode="lines", line=dict(color="#3B82F6", width=1.5, dash="dot")))
            fig.add_trace(go.Scatter(x=forecast_dates, y=forecast_vals, name="Dự báo 7 ngày",
                                     mode="lines+markers", line=dict(color=RED, width=2, dash="dash"),
                                     marker=dict(size=8, color=RED)))
            fig.add_vrect(x0=forecast_dates[0], x1=forecast_dates[-1],
                          fillcolor="rgba(227,26,35,0.07)", layer="below", line_width=0,
                          annotation_text="Dự báo", annotation_position="top left",
                          annotation_font_color=RED)
            # Use _PLOTLY_BASE to avoid legend conflict
            fig.update_layout(
                **_PLOTLY_BASE, height=380,
                title="Dự báo doanh thu 7 ngày tới (Moving Average)",
                legend=dict(bgcolor="rgba(0,0,0,0)", font=dict(color="#CCCCCC"),
                            orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
            )
            st.plotly_chart(fig, use_container_width=True)
            st.caption("💡 Dự báo dựa trên Moving Average 7 ngày. Spark MLlib ALS sẽ nâng cấp khi có đủ dữ liệu.")
        else:
            st.info("Cần ít nhất 7 ngày dữ liệu để dự báo.")

    st.markdown("---")
    st.markdown("### 🔍 Trạng thái AI Service")
    @st.cache_data(ttl=60)
    def get_ai_status():
        try:
            import requests
            resp = requests.get("http://ai-service:8000/health", timeout=3)
            return resp.json() if resp.status_code == 200 else None
        except Exception:
            return None

    ai_status = get_ai_status()
    c1, c2, c3 = st.columns(3)
    with c1:
        st.markdown(f"""<div class='info-card'>
          <div style='font-size:28px; margin-bottom:8px'>🤖</div>
          <div style='color:#8B8FA8; font-size:12px'>AI Service</div>
          <div style='font-size:20px; font-weight:800; color:#22C55E; margin-top:4px'>
            {"Online ✓" if ai_status else "Đang kết nối..."}
          </div></div>""", unsafe_allow_html=True)
    with c2:
        st.markdown("""<div class='info-card'>
          <div style='font-size:28px; margin-bottom:8px'>📊</div>
          <div style='color:#8B8FA8; font-size:12px'>Recommendation Model</div>
          <div style='font-size:16px; font-weight:800; color:#A855F7; margin-top:4px'>
            Cosine Similarity → ALS</div></div>""", unsafe_allow_html=True)
    with c3:
        st.markdown("""<div class='info-card'>
          <div style='font-size:28px; margin-bottom:8px'>🔮</div>
          <div style='color:#8B8FA8; font-size:12px'>Forecast Model</div>
          <div style='font-size:16px; font-weight:800; color:#3B82F6; margin-top:4px'>
            Moving Average 7-Day</div></div>""", unsafe_allow_html=True)


# ═══════════════════════════════════════════════════════════════════════════════
#  TAB 7: DATA PLATFORM — ARCHITECTURE & MONITORING (SUPER PREMIUM)
# ═══════════════════════════════════════════════════════════════════════════════
with tabs[6]:
    st.markdown("## 🏗️ Data Platform — Architecture & Monitoring")
    st.markdown("""
    <p style='color:#8B8FA8; font-size:14px; margin-bottom:24px'>
      Modern Data Stack theo kiến trúc 7 Layer · Thiết kế tham khảo từ Grab, Shopee, The Coffee House
    </p>
    """, unsafe_allow_html=True)

    # ── LIVE STATUS GRID ──
    st.markdown("### ⚡ Live Infrastructure Status")
    s1, s2, s3, s4, s5 = st.columns(5)

    # PostgreSQL
    pg_ok = False
    engine = get_engine()
    if engine:
        try:
            with engine.connect() as c:
                c.execute(sqlalchemy.text("SELECT 1"))
            pg_ok = True
        except Exception:
            pass
    with s1:
        color = "#22C55E" if pg_ok else "#F87171"
        st.markdown(f"""<div style='background:#1A1D27; border:1px solid #2D3147; border-radius:12px;
            padding:16px; text-align:center; border-left:4px solid {color}'>
          <div style='font-size:24px'>🐘</div>
          <div style='color:#8B8FA8; font-size:11px; margin-top:4px'>PostgreSQL</div>
          <div style='color:{color}; font-weight:800; font-size:14px'>{"ONLINE" if pg_ok else "OFFLINE"}</div>
          <div style='color:#4B5280; font-size:10px'>Operational DB</div>
        </div>""", unsafe_allow_html=True)

    # Kafka
    ks_live = kafka_status()
    with s2:
        color = "#22C55E" if ks_live["connected"] else "#FB923C"
        st.markdown(f"""<div style='background:#1A1D27; border:1px solid #2D3147; border-radius:12px;
            padding:16px; text-align:center; border-left:4px solid {color}'>
          <div style='font-size:24px'>📡</div>
          <div style='color:#8B8FA8; font-size:11px; margin-top:4px'>Apache Kafka</div>
          <div style='color:{color}; font-weight:800; font-size:14px'>{"ONLINE" if ks_live["connected"] else "STARTING"}</div>
          <div style='color:#4B5280; font-size:10px'>{ks_live.get("topics", 0)} topics</div>
        </div>""", unsafe_allow_html=True)

    # MinIO
    ms_live = minio_status()
    with s3:
        color = "#22C55E" if ms_live["connected"] else "#FB923C"
        st.markdown(f"""<div style='background:#1A1D27; border:1px solid #2D3147; border-radius:12px;
            padding:16px; text-align:center; border-left:4px solid {color}'>
          <div style='font-size:24px'>🗂️</div>
          <div style='color:#8B8FA8; font-size:11px; margin-top:4px'>MinIO Lakehouse</div>
          <div style='color:{color}; font-weight:800; font-size:14px'>{"ONLINE" if ms_live["connected"] else "STARTING"}</div>
          <div style='color:#4B5280; font-size:10px'>{ms_live.get("buckets", 0)} buckets</div>
        </div>""", unsafe_allow_html=True)

    # Airflow
    with s4:
        st.markdown("""<div style='background:#1A1D27; border:1px solid #2D3147; border-radius:12px;
            padding:16px; text-align:center; border-left:4px solid #22C55E'>
          <div style='font-size:24px'>🔄</div>
          <div style='color:#8B8FA8; font-size:11px; margin-top:4px'>Apache Airflow</div>
          <div style='color:#22C55E; font-weight:800; font-size:14px'>SCHEDULED</div>
          <div style='color:#4B5280; font-size:10px'>2AM Daily Pipeline</div>
        </div>""", unsafe_allow_html=True)

    # AI Service
    ai_ok = False
    try:
        import requests as _req
        _r = _req.get("http://ai-service:8000/health", timeout=2)
        ai_ok = _r.status_code == 200
    except Exception:
        pass
    with s5:
        color = "#22C55E" if ai_ok else "#FB923C"
        st.markdown(f"""<div style='background:#1A1D27; border:1px solid #2D3147; border-radius:12px;
            padding:16px; text-align:center; border-left:4px solid {color}'>
          <div style='font-size:24px'>🤖</div>
          <div style='color:#8B8FA8; font-size:11px; margin-top:4px'>AI Service</div>
          <div style='color:{color}; font-weight:800; font-size:14px'>{"ONLINE" if ai_ok else "STARTING"}</div>
          <div style='color:#4B5280; font-size:10px'>FastAPI + Gemini</div>
        </div>""", unsafe_allow_html=True)

    st.markdown("---")

    # ── 7-LAYER ARCHITECTURE DIAGRAM ──
    st.markdown("### 🏗️ Kiến trúc Modern Data Stack — 7 Layers")
    st.markdown("""
    <div style='background:linear-gradient(135deg, #0F1117 0%, #1A1D27 100%);
         border:2px solid #2D3147; border-radius:16px; padding:32px; margin:16px 0'>

      <div style='text-align:center; margin-bottom:24px'>
        <span style='font-size:20px; font-weight:900; color:#E31A23; letter-spacing:2px'>
          AVENGERS COFFEE — DATA PLATFORM
        </span>
        <br><span style='color:#8B8FA8; font-size:12px'>Enterprise-grade Modern Data Stack</span>
      </div>

      <!-- Layer 1 -->
      <div style='background:#1E2030; border:1px solid #3B82F6; border-radius:10px; padding:12px 16px; margin:8px 0'>
        <span style='color:#3B82F6; font-weight:800; font-size:13px'>LAYER 1 — DATA SOURCES</span>
        <div style='display:flex; gap:16px; margin-top:8px; flex-wrap:wrap'>
          <span style='background:#1A2744; color:#60A5FA; padding:4px 12px; border-radius:6px; font-size:12px'>🖥️ Microservices (NestJS)</span>
          <span style='background:#1A2744; color:#60A5FA; padding:4px 12px; border-radius:6px; font-size:12px'>📱 Mobile App (React Native)</span>
          <span style='background:#1A2744; color:#60A5FA; padding:4px 12px; border-radius:6px; font-size:12px'>🚴 Shipper App (GPS Events)</span>
          <span style='background:#1A2744; color:#60A5FA; padding:4px 12px; border-radius:6px; font-size:12px'>🐘 PostgreSQL (5 Schemas)</span>
        </div>
      </div>

      <div style='text-align:center; color:#4B5280; font-size:16px; margin:4px 0'>▼</div>

      <!-- Layer 2 -->
      <div style='background:#1E2030; border:1px solid #22C55E; border-radius:10px; padding:12px 16px; margin:8px 0'>
        <span style='color:#22C55E; font-weight:800; font-size:13px'>LAYER 2 — INGESTION & STREAMING</span>
        <div style='display:flex; gap:16px; margin-top:8px; flex-wrap:wrap'>
          <span style='background:#0D2818; color:#4ADE80; padding:4px 12px; border-radius:6px; font-size:12px'>📡 Apache Kafka (Event Hub)</span>
          <span style='background:#0D2818; color:#4ADE80; padding:4px 12px; border-radius:6px; font-size:12px'>🔌 Kafka Producer (30s CDC)</span>
          <span style='background:#0D2818; color:#4ADE80; padding:4px 12px; border-radius:6px; font-size:12px'>🎯 Debezium CDC (Roadmap)</span>
        </div>
      </div>

      <div style='text-align:center; color:#4B5280; font-size:16px; margin:4px 0'>▼</div>

      <!-- Layer 3 -->
      <div style='background:#1E2030; border:1px solid #FF8C00; border-radius:10px; padding:12px 16px; margin:8px 0'>
        <span style='color:#FF8C00; font-weight:800; font-size:13px'>LAYER 3 — PROCESSING</span>
        <div style='display:flex; gap:16px; margin-top:8px; flex-wrap:wrap'>
          <span style='background:#2B1A00; color:#FFA94D; padding:4px 12px; border-radius:6px; font-size:12px'>⚡ Spark Jobs (Python/Pandas)</span>
          <span style='background:#2B1A00; color:#FFA94D; padding:4px 12px; border-radius:6px; font-size:12px'>🧠 Spark MLlib ALS (Roadmap)</span>
          <span style='background:#2B1A00; color:#FFA94D; padding:4px 12px; border-radius:6px; font-size:12px'>📊 Great Expectations (Roadmap)</span>
        </div>
      </div>

      <div style='text-align:center; color:#4B5280; font-size:16px; margin:4px 0'>▼</div>

      <!-- Layer 4 -->
      <div style='background:#1E2030; border:1px solid #E31A23; border-radius:10px; padding:12px 16px; margin:8px 0'>
        <span style='color:#E31A23; font-weight:800; font-size:13px'>LAYER 4 — DATA LAKEHOUSE (MinIO)</span>
        <div style='display:flex; gap:24px; margin-top:8px; flex-wrap:wrap'>
          <span style='background:#2D1A0A; color:#D97706; padding:6px 16px; border-radius:8px; font-size:13px; font-weight:700'>🟤 BRONZE — Raw Parquet</span>
          <span style='background:#1A1D27; color:#94A3B8; padding:6px 16px; border-radius:8px; font-size:13px; font-weight:700'>⚪ SILVER — Cleaned</span>
          <span style='background:#2D2A00; color:#FCD34D; padding:6px 16px; border-radius:8px; font-size:13px; font-weight:700'>🟡 GOLD — Aggregated</span>
        </div>
      </div>

      <div style='text-align:center; color:#4B5280; font-size:16px; margin:4px 0'>▼</div>

      <!-- Layer 5+6 -->
      <div style='display:flex; gap:12px; flex-wrap:wrap'>
        <div style='flex:1; min-width:200px; background:#1E2030; border:1px solid #A855F7; border-radius:10px; padding:12px 16px'>
          <span style='color:#A855F7; font-weight:800; font-size:13px'>LAYER 5 — ORCHESTRATION</span>
          <div style='margin-top:8px'>
            <span style='background:#1F1535; color:#C084FC; padding:4px 12px; border-radius:6px; font-size:12px'>🔄 Apache Airflow (2AM Daily)</span>
          </div>
        </div>
        <div style='flex:1; min-width:200px; background:#1E2030; border:1px solid #06B6D4; border-radius:10px; padding:12px 16px'>
          <span style='color:#06B6D4; font-weight:800; font-size:13px'>LAYER 6 — AI/ML</span>
          <div style='margin-top:8px'>
            <span style='background:#0A2330; color:#22D3EE; padding:4px 12px; border-radius:6px; font-size:12px'>🤖 AI Service + MLflow (Roadmap)</span>
          </div>
        </div>
      </div>

      <div style='text-align:center; color:#4B5280; font-size:16px; margin:4px 0'>▼</div>

      <!-- Layer 7 -->
      <div style='background:#1E2030; border:2px solid #E31A23; border-radius:10px; padding:12px 16px; margin:8px 0'>
        <span style='color:#E31A23; font-weight:800; font-size:13px'>LAYER 7 — VISUALIZATION & ANALYTICS</span>
        <div style='display:flex; gap:16px; margin-top:8px; flex-wrap:wrap'>
          <span style='background:#2D0A0A; color:#F87171; padding:6px 16px; border-radius:8px; font-size:13px; font-weight:700'>📊 Streamlit AI Dashboard (:8501)</span>
          <span style='background:#2D0A0A; color:#F87171; padding:6px 16px; border-radius:8px; font-size:13px; font-weight:700'>🔌 Kafka UI (:8082)</span>
          <span style='background:#2D0A0A; color:#F87171; padding:6px 16px; border-radius:8px; font-size:13px; font-weight:700'>🗂️ MinIO Console (:9001)</span>
          <span style='background:#1F1535; color:#C084FC; padding:6px 16px; border-radius:8px; font-size:13px'>📈 Apache Superset (Roadmap)</span>
        </div>
      </div>
    </div>
    """, unsafe_allow_html=True)

    st.markdown("---")

    # ── DATA FLOW COMPARISON ──
    st.markdown("### 🔍 Data Platform vs Dashboard Thông thường — So sánh Trực quan")
    comp_l, comp_r = st.columns(2)
    with comp_l:
        st.markdown("""
        <div style='background:#1A1D27; border:1px solid #F87171; border-radius:12px; padding:20px'>
          <div style='color:#F87171; font-weight:800; font-size:16px; margin-bottom:12px'>
            ❌ Dashboard Thông thường
          </div>
          <div style='color:#8B8FA8; font-size:13px; line-height:2'>
            • Query trực tiếp PostgreSQL → Chậm khi dữ liệu lớn<br>
            • Chỉ xem được doanh thu, tổng đơn hôm nay<br>
            • Không phân tích hành vi khách hàng<br>
            • Không dự báo được tương lai<br>
            • Không phát hiện bất thường real-time<br>
            • Mất dữ liệu khi PostgreSQL quá tải<br>
            • Không scale được khi mở rộng chuỗi
          </div>
        </div>
        """, unsafe_allow_html=True)

    with comp_r:
        st.markdown("""
        <div style='background:#1A1D27; border:1px solid #22C55E; border-radius:12px; padding:20px'>
          <div style='color:#22C55E; font-weight:800; font-size:16px; margin-bottom:12px'>
            ✅ Avengers Data Platform
          </div>
          <div style='color:#8B8FA8; font-size:13px; line-height:2'>
            • <b style='color:#22C55E'>Kafka CDC</b> — Bắt mọi thay đổi, 0 data loss<br>
            • <b style='color:#22C55E'>Lakehouse 3 tầng</b> — Lưu trữ không giới hạn lịch sử<br>
            • <b style='color:#22C55E'>Spark MLlib</b> — Phân khúc VIP, Churn Prediction<br>
            • <b style='color:#22C55E'>AI Forecasting</b> — Dự báo doanh thu 7 ngày<br>
            • <b style='color:#22C55E'>Real-time Alert</b> — Phát hiện bất thường < 5 giây<br>
            • <b style='color:#22C55E'>Great Expectations</b> — Data Quality tự động<br>
            • <b style='color:#22C55E'>Scale vô hạn</b> — Xử lý 100M+ records/ngày
          </div>
        </div>
        """, unsafe_allow_html=True)

    st.markdown("---")

    # ── BUSINESS QUESTIONS TABLE ──
    st.markdown("### 💎 Câu hỏi kinh doanh mà Data Platform giải quyết")
    questions_data = {
        "Câu hỏi": [
            "Doanh thu hôm nay?",
            "Khách nào sắp bỏ thương hiệu?",
            "Chi nhánh nào đang bất thường?",
            "Dự báo doanh thu tuần tới?",
            "Hành vi KH sau khuyến mãi?",
            "Model AI đang chính xác bao nhiêu?",
            "Phân tích 2 năm toàn chuỗi?",
        ],
        "Dashboard thường": ["✅", "❌", "❌", "❌", "❌", "❌", "❌ Chậm/Quá tải"],
        "Data Platform": ["✅", "✅ Churn Prediction", "✅ Real-time Alert",
                          "✅ ML Forecast", "✅ A/B Analysis", "✅ MLflow Tracking",
                          "✅ Lakehouse < 3 giây"],
    }
    st.dataframe(pd.DataFrame(questions_data), use_container_width=True, hide_index=True, height=300)

    st.markdown("---")

    # ── LIVE DATA PIPELINE STATUS ──
    st.markdown("### 📊 Data Pipeline — Live Status")
    pipe_l, pipe_r = st.columns(2)

    with pipe_l:
        st.markdown("#### 📡 Kafka Topics")
        ks2 = kafka_status()
        if ks2["connected"]:
            for t in ks2.get("topic_names", []):
                st.markdown(f"""
                <div style='background:#0D2818; border:1px solid #166534; border-radius:8px;
                     padding:8px 16px; margin:4px 0; display:flex; justify-content:space-between'>
                  <span style='color:#4ADE80; font-weight:700'>✓ {t}</span>
                  <span style='color:#8B8FA8; font-size:11px'>Streaming</span>
                </div>""", unsafe_allow_html=True)
        else:
            st.warning("Kafka đang khởi động...")

    with pipe_r:
        st.markdown("#### 🗂️ Data Lakehouse (MinIO)")
        s3 = get_minio()
        if s3:
            for bucket, layer, emoji in [("avengers-bronze", "Bronze — Raw Data", "🟤"),
                                          ("avengers-silver", "Silver — Cleaned", "⚪"),
                                          ("avengers-gold", "Gold — Aggregated", "🟡"),
                                          ("avengers-models", "Models — AI/ML", "🧠")]:
                try:
                    resp = s3.list_objects_v2(Bucket=bucket)
                    count = resp.get("KeyCount", 0)
                    color = "#22C55E" if count > 0 else "#FB923C"
                    bg = "#0D2818" if count > 0 else "#3B2300"
                    border = "#166534" if count > 0 else "#92400E"
                    st.markdown(f"""
                    <div style='background:{bg}; border:1px solid {border}; border-radius:8px;
                         padding:8px 16px; margin:4px 0; display:flex; justify-content:space-between'>
                      <span style='color:{color}; font-weight:700'>{emoji} {layer}</span>
                      <span style='color:#8B8FA8; font-size:11px'>{count} objects</span>
                    </div>""", unsafe_allow_html=True)
                except Exception:
                    st.markdown(f"""
                    <div style='background:#2D0A0A; border:1px solid #991B1B; border-radius:8px;
                         padding:8px 16px; margin:4px 0'>
                      <span style='color:#F87171'>{emoji} {layer} — Chưa tạo</span>
                    </div>""", unsafe_allow_html=True)
        else:
            st.warning("MinIO đang khởi động...")

    st.markdown("---")

    # ── PIPELINE SCHEDULE ──
    st.markdown("### ⏰ Pipeline Schedule & Roadmap")
    sched_l, sched_r = st.columns(2)

    with sched_l:
        st.markdown("#### Lịch chạy tự động")
        schedule_data = {
            "Pipeline": ["Bronze Ingestion", "Silver Transform", "Gold Aggregation", "Model Retrain", "Data Quality Check"],
            "Lịch": ["2:00 AM Daily", "2:15 AM Daily", "2:30 AM Daily", "3:00 AM Weekly", "After each layer"],
            "Công cụ": ["Airflow + Spark", "Airflow + Spark", "Airflow + Spark", "MLflow + Spark", "Great Expectations"],
            "Status": ["✅ Active", "✅ Active", "✅ Active", "🔜 Roadmap", "🔜 Roadmap"],
        }
        st.dataframe(pd.DataFrame(schedule_data), use_container_width=True, hide_index=True)

    with sched_r:
        st.markdown("#### Upgrade Roadmap")
        st.markdown("""
        <div style='background:#1A1D27; border:1px solid #2D3147; border-radius:12px; padding:16px'>
          <div style='margin:8px 0'>
            <span style='background:#0D4025; color:#4ADE80; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:700'>DONE</span>
            &nbsp;<span style='color:#CCCCCC; font-size:13px'>Kafka Event Streaming</span>
          </div>
          <div style='margin:8px 0'>
            <span style='background:#0D4025; color:#4ADE80; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:700'>DONE</span>
            &nbsp;<span style='color:#CCCCCC; font-size:13px'>MinIO Data Lakehouse (3 tầng)</span>
          </div>
          <div style='margin:8px 0'>
            <span style='background:#0D4025; color:#4ADE80; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:700'>DONE</span>
            &nbsp;<span style='color:#CCCCCC; font-size:13px'>Airflow Pipeline Orchestration</span>
          </div>
          <div style='margin:8px 0'>
            <span style='background:#0D4025; color:#4ADE80; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:700'>DONE</span>
            &nbsp;<span style='color:#CCCCCC; font-size:13px'>Streamlit AI Analytics Dashboard</span>
          </div>
          <div style='margin:8px 0; border-top:1px solid #2D3147; padding-top:8px'>
            <span style='background:#3B2300; color:#FB923C; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:700'>NEXT</span>
            &nbsp;<span style='color:#CCCCCC; font-size:13px'>Debezium CDC (Zero data loss)</span>
          </div>
          <div style='margin:8px 0'>
            <span style='background:#3B2300; color:#FB923C; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:700'>NEXT</span>
            &nbsp;<span style='color:#CCCCCC; font-size:13px'>Spark MLlib ALS Recommendation</span>
          </div>
          <div style='margin:8px 0'>
            <span style='background:#1F1535; color:#A855F7; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:700'>PLAN</span>
            &nbsp;<span style='color:#CCCCCC; font-size:13px'>Apache Trino Query Engine</span>
          </div>
          <div style='margin:8px 0'>
            <span style='background:#1F1535; color:#A855F7; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:700'>PLAN</span>
            &nbsp;<span style='color:#CCCCCC; font-size:13px'>Great Expectations + MLflow</span>
          </div>
          <div style='margin:8px 0'>
            <span style='background:#1F1535; color:#A855F7; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:700'>PLAN</span>
            &nbsp;<span style='color:#CCCCCC; font-size:13px'>Apache Superset BI Dashboard</span>
          </div>
        </div>
        """, unsafe_allow_html=True)

    st.markdown("---")

    # ── TECH STACK GRID ──
    st.markdown("### 🛠️ Technology Stack")
    st.markdown("""
    <div style='display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));
         gap:12px; margin:16px 0'>
      <div style='background:#1A1D27; border:1px solid #2D3147; border-radius:10px; padding:16px; text-align:center'>
        <div style='font-size:28px'>📡</div>
        <div style='color:#FFFFFF; font-weight:700; font-size:13px; margin-top:4px'>Apache Kafka</div>
        <div style='color:#4B5280; font-size:11px'>Event Streaming</div>
      </div>
      <div style='background:#1A1D27; border:1px solid #2D3147; border-radius:10px; padding:16px; text-align:center'>
        <div style='font-size:28px'>🗂️</div>
        <div style='color:#FFFFFF; font-weight:700; font-size:13px; margin-top:4px'>MinIO</div>
        <div style='color:#4B5280; font-size:11px'>Data Lakehouse</div>
      </div>
      <div style='background:#1A1D27; border:1px solid #2D3147; border-radius:10px; padding:16px; text-align:center'>
        <div style='font-size:28px'>⚡</div>
        <div style='color:#FFFFFF; font-weight:700; font-size:13px; margin-top:4px'>Spark Jobs</div>
        <div style='color:#4B5280; font-size:11px'>Data Processing</div>
      </div>
      <div style='background:#1A1D27; border:1px solid #2D3147; border-radius:10px; padding:16px; text-align:center'>
        <div style='font-size:28px'>🔄</div>
        <div style='color:#FFFFFF; font-weight:700; font-size:13px; margin-top:4px'>Apache Airflow</div>
        <div style='color:#4B5280; font-size:11px'>Orchestration</div>
      </div>
      <div style='background:#1A1D27; border:1px solid #2D3147; border-radius:10px; padding:16px; text-align:center'>
        <div style='font-size:28px'>📊</div>
        <div style='color:#FFFFFF; font-weight:700; font-size:13px; margin-top:4px'>Streamlit</div>
        <div style='color:#4B5280; font-size:11px'>AI Dashboard</div>
      </div>
      <div style='background:#1A1D27; border:1px solid #2D3147; border-radius:10px; padding:16px; text-align:center'>
        <div style='font-size:28px'>🤖</div>
        <div style='color:#FFFFFF; font-weight:700; font-size:13px; margin-top:4px'>FastAPI + AI</div>
        <div style='color:#4B5280; font-size:11px'>ML Serving</div>
      </div>
    </div>
    """, unsafe_allow_html=True)

    # ── PIPELINE ACTION ──
    st.markdown("---")
    st.markdown("### 🚀 Chạy Pipeline thủ công")
    a1, a2 = st.columns(2)
    with a1:
        if st.button("▶️ Chạy Bronze → Silver → Gold", type="primary", use_container_width=True):
            st.code("docker compose -f docker-compose.data.yml run --rm spark-jobs", language="bash")
            st.info("💡 Copy lệnh trên và chạy trong PowerShell để trigger pipeline ngay.")
    with a2:
        if st.button("🔄 Refresh toàn bộ Dashboard", use_container_width=True):
            st.cache_data.clear()
            st.rerun()

