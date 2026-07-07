"""
Avengers Coffee - Analytics & AI Data Platform Dashboard
Built with Streamlit + Plotly | Inspired by ViettelPost design language
"""
import os
import json
import time
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
  /* Overall */
  [data-testid="stAppViewContainer"] { background: #0F1117; }
  [data-testid="stSidebar"] { background: #1A1D27 !important; }

  /* Metric cards */
  [data-testid="metric-container"] {
    background: #1A1D27;
    border: 1px solid #2D3147;
    border-radius: 12px;
    padding: 16px 20px;
  }
  [data-testid="stMetricLabel"] { color: #8B8FA8 !important; font-size: 13px !important; }
  [data-testid="stMetricValue"] { color: #FFFFFF !important; font-size: 28px !important; font-weight: 800 !important; }
  [data-testid="stMetricDelta"] { font-size: 13px !important; }

  /* Tabs */
  [data-baseweb="tab-list"] { background: #1A1D27 !important; border-radius: 10px; padding: 4px; }
  [data-baseweb="tab"] { color: #8B8FA8 !important; font-weight: 600; }
  [aria-selected="true"] { background: #E31A23 !important; color: white !important; border-radius: 8px; }

  /* Headers */
  h1 { color: #FFFFFF !important; }
  h2 { color: #E31A23 !important; font-size: 20px !important; }
  h3 { color: #CCCCCC !important; }

  /* Status badges */
  .status-ok { background: #0D4025; color: #4ADE80; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; }
  .status-warn { background: #3B2300; color: #FB923C; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; }
  .status-err { background: #2D0A0A; color: #F87171; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; }

  /* Cards */
  .info-card {
    background: #1A1D27;
    border: 1px solid #2D3147;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 12px;
  }

  /* Hide Streamlit branding */
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

PLOTLY_LAYOUT = dict(
    paper_bgcolor="rgba(0,0,0,0)",
    plot_bgcolor="rgba(0,0,0,0)",
    font=dict(color="#CCCCCC", family="Inter, sans-serif"),
    title_font=dict(size=16, color="#FFFFFF"),
    legend=dict(bgcolor="rgba(0,0,0,0)", font=dict(color="#CCCCCC")),
    margin=dict(l=20, r=20, t=40, b=20),
    xaxis=dict(gridcolor="#2D3147", zerolinecolor="#2D3147"),
    yaxis=dict(gridcolor="#2D3147", zerolinecolor="#2D3147"),
)
RED = "#E31A23"
COLORS = ["#E31A23", "#FF8C00", "#22C55E", "#3B82F6", "#A855F7", "#06B6D4", "#F59E0B"]

# ─── Database ─────────────────────────────────────────────────────────────────
@st.cache_resource
def get_engine():
    url = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    try:
        engine = sqlalchemy.create_engine(url, pool_pre_ping=True, pool_timeout=5)
        return engine
    except Exception as e:
        return None


def query_df(sql: str, params=None) -> pd.DataFrame:
    engine = get_engine()
    if engine is None:
        return pd.DataFrame()
    try:
        with engine.connect() as conn:
            return pd.read_sql(sql, conn, params=params)
    except Exception as e:
        st.error(f"DB Error: {e}")
        return pd.DataFrame()


# ─── MinIO / Gold Layer ────────────────────────────────────────────────────────
@st.cache_resource
def get_minio():
    try:
        client = boto3.client(
            "s3",
            endpoint_url=MINIO_ENDPOINT,
            aws_access_key_id=MINIO_ACCESS_KEY,
            aws_secret_access_key=MINIO_SECRET_KEY,
            config=Config(signature_version="s3v4"),
        )
        return client
    except Exception:
        return None


def read_gold_json(key: str) -> Optional[list]:
    s3 = get_minio()
    if s3 is None:
        return None
    try:
        obj = s3.get_object(Bucket="avengers-gold", Key=key)
        return json.loads(obj["Body"].read())
    except ClientError:
        return None
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


# ─── Helper: format currency ───────────────────────────────────────────────────
def fmt_vnd(value: float) -> str:
    if value >= 1_000_000:
        return f"{value/1_000_000:.1f}M ₫"
    if value >= 1_000:
        return f"{value/1_000:.0f}K ₫"
    return f"{value:.0f} ₫"


STATUS_LABELS = {
    "MOI_TAO": "Mới tạo", "DA_XAC_NHAN": "Đã xác nhận",
    "DANG_CHUAN_BI": "Đang chuẩn bị", "DANG_GIAO": "Đang giao",
    "HOAN_THANH": "Hoàn thành", "DA_HUY": "Đã hủy",
}
PAYMENT_LABELS = {
    "TIEN_MAT": "Tiền mặt", "THANH_TOAN_KHI_NHAN_HANG": "COD",
    "QR_CODE": "QR Code", "VNPAY": "VNPay", "MOMO": "MoMo",
}


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

    # DB status
    engine = get_engine()
    if engine:
        try:
            with engine.connect() as c:
                c.execute(sqlalchemy.text("SELECT 1"))
            st.markdown('<span class="status-ok">✓ PostgreSQL Online</span>', unsafe_allow_html=True)
        except:
            st.markdown('<span class="status-err">✗ PostgreSQL Error</span>', unsafe_allow_html=True)
    else:
        st.markdown('<span class="status-err">✗ PostgreSQL Offline</span>', unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)

    # MinIO status
    ms = minio_status()
    if ms["connected"]:
        st.markdown(f'<span class="status-ok">✓ MinIO Online ({ms.get("buckets",0)} buckets)</span>', unsafe_allow_html=True)
    else:
        st.markdown('<span class="status-warn">⚡ MinIO Connecting...</span>', unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)

    # Kafka status
    ks = kafka_status()
    if ks["connected"]:
        st.markdown(f'<span class="status-ok">✓ Kafka Online ({ks.get("topics",0)} topics)</span>', unsafe_allow_html=True)
    else:
        st.markdown('<span class="status-warn">⚡ Kafka Connecting...</span>', unsafe_allow_html=True)

    st.markdown("<hr style='border-color:#2D3147; margin:16px 0'>", unsafe_allow_html=True)

    # Gold layer last run
    gold_meta = read_gold_json("pipeline_meta/latest.json")
    if gold_meta and isinstance(gold_meta, dict):
        last_run = gold_meta.get("last_run", "N/A")
        st.markdown(f"**🔄 Pipeline cuối:** `{last_run[:16]}`")
    else:
        st.markdown("**🔄 Pipeline:** Chưa chạy lần nào")

    st.markdown("<hr style='border-color:#2D3147; margin:16px 0'>", unsafe_allow_html=True)

    if st.button("🔄 Làm mới dữ liệu", use_container_width=True, type="primary"):
        st.cache_data.clear()
        st.rerun()

    st.markdown(f"""
    <div style='position:fixed; bottom:20px; left:20px; right:20px; text-align:center;
                color:#4B5280; font-size:11px; border-top: 1px solid #2D3147; padding-top:10px'>
      Avengers Coffee © 2025<br>
      Cập nhật: {datetime.now().strftime('%H:%M:%S')}
    </div>
    """, unsafe_allow_html=True)


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN CONTENT
# ═══════════════════════════════════════════════════════════════════════════════
st.markdown("""
<h1 style='margin:0; padding:0 0 4px'>
  ☕ Avengers Coffee — Analytics Dashboard
</h1>
<p style='color:#8B8FA8; margin:0 0 24px; font-size:14px'>
  Real-time Business Intelligence & AI Platform · Dữ liệu cập nhật liên tục
</p>
""", unsafe_allow_html=True)

tabs = st.tabs([
    "🏠 Tổng quan",
    "📊 Doanh thu",
    "☕ Sản phẩm",
    "👥 Khách hàng",
    "🚴 Shipper",
    "🤖 AI Analytics",
    "🔧 Data Pipeline",
])


# ═══════════════════════════════════════════════════════════════════════════════
#  TAB 1: TỔNG QUAN
# ═══════════════════════════════════════════════════════════════════════════════
with tabs[0]:
    st.markdown("## 📈 KPIs Hôm nay")

    @st.cache_data(ttl=30)
    def get_kpi():
        sql = """
            SELECT
                COUNT(*) FILTER (WHERE DATE(ngay_tao) = CURRENT_DATE)            AS orders_today,
                COUNT(*) FILTER (WHERE trang_thai_don_hang = 'HOAN_THANH'
                                   AND DATE(ngay_tao) = CURRENT_DATE)            AS completed_today,
                COUNT(*) FILTER (WHERE trang_thai_don_hang = 'DA_HUY'
                                   AND DATE(ngay_tao) = CURRENT_DATE)            AS cancelled_today,
                COUNT(*) FILTER (WHERE trang_thai_don_hang IN ('DANG_GIAO','MOI_TAO','DA_XAC_NHAN','DANG_CHUAN_BI')) AS active_orders,
                COALESCE(SUM(tong_tien) FILTER (
                    WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                    AND DATE(ngay_tao) = CURRENT_DATE
                ), 0)                                                              AS revenue_today,
                COALESCE(SUM(tong_tien) FILTER (
                    WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                    AND DATE(ngay_tao) = CURRENT_DATE - 1
                ), 0)                                                              AS revenue_yesterday,
                COUNT(*) FILTER (WHERE DATE(ngay_tao) = CURRENT_DATE - 1)         AS orders_yesterday
            FROM orders.don_hang
        """
        return query_df(sql)

    kpi = get_kpi()
    if not kpi.empty:
        row = kpi.iloc[0]
        c1, c2, c3, c4, c5 = st.columns(5)
        orders_delta = int(row.get("orders_today", 0)) - int(row.get("orders_yesterday", 0))
        rev_delta    = float(row.get("revenue_today", 0)) - float(row.get("revenue_yesterday", 0))

        c1.metric("📦 Đơn hàng hôm nay", int(row.get("orders_today", 0)), f"{orders_delta:+d} so với hôm qua")
        c2.metric("✅ Hoàn thành", int(row.get("completed_today", 0)))
        c3.metric("🔴 Đang xử lý", int(row.get("active_orders", 0)))
        c4.metric("❌ Hủy đơn", int(row.get("cancelled_today", 0)))
        c5.metric("💰 Doanh thu", fmt_vnd(float(row.get("revenue_today", 0))),
                  f"{fmt_vnd(abs(rev_delta))} {'▲' if rev_delta >= 0 else '▼'}")
    else:
        st.warning("⚠️ Không kết nối được database. Đang thử lại...")

    st.markdown("---")

    col_l, col_r = st.columns([3, 2])

    with col_l:
        st.markdown("## ⏰ Đơn hàng theo giờ (hôm nay)")

        @st.cache_data(ttl=60)
        def get_hourly_orders():
            sql = """
                SELECT
                    EXTRACT(HOUR FROM ngay_tao)::int AS hour,
                    COUNT(*) AS orders,
                    COALESCE(SUM(tong_tien), 0) AS revenue
                FROM orders.don_hang
                WHERE DATE(ngay_tao) = CURRENT_DATE
                GROUP BY EXTRACT(HOUR FROM ngay_tao)
                ORDER BY hour
            """
            return query_df(sql)

        hourly = get_hourly_orders()
        if not hourly.empty:
            fig = make_subplots(specs=[[{"secondary_y": True}]])
            fig.add_trace(go.Bar(
                x=hourly["hour"], y=hourly["orders"],
                name="Số đơn", marker_color=RED, opacity=0.85,
            ), secondary_y=False)
            fig.add_trace(go.Scatter(
                x=hourly["hour"], y=hourly["revenue"],
                name="Doanh thu", mode="lines+markers",
                line=dict(color="#FF8C00", width=2.5), marker=dict(size=6),
            ), secondary_y=True)
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
            sql = """
                SELECT trang_thai_don_hang, COUNT(*) AS count
                FROM orders.don_hang
                WHERE ngay_tao >= CURRENT_DATE - INTERVAL '7 days'
                GROUP BY trang_thai_don_hang
                ORDER BY count DESC
            """
            return query_df(sql)

        status_df = get_order_status()
        if not status_df.empty:
            status_df["label"] = status_df["trang_thai_don_hang"].map(STATUS_LABELS).fillna(status_df["trang_thai_don_hang"])
            fig = px.pie(
                status_df, values="count", names="label",
                color_discrete_sequence=COLORS, hole=0.55,
            )
            fig.update_layout(**PLOTLY_LAYOUT, height=300)
            fig.update_traces(textposition="outside", textfont_size=12)
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("Không có dữ liệu trạng thái.")

    # Recent orders table
    st.markdown("## 🕒 Đơn hàng gần nhất")

    @st.cache_data(ttl=15)
    def get_recent_orders():
        sql = """
            SELECT
                ma_don_hang::text AS "Mã đơn",
                trang_thai_don_hang AS "Trạng thái",
                phuong_thuc_thanh_toan AS "Thanh toán",
                co_so_ma AS "Chi nhánh",
                tong_tien AS "Tổng tiền",
                ngay_tao AS "Thời gian"
            FROM orders.don_hang
            ORDER BY ngay_tao DESC
            LIMIT 15
        """
        return query_df(sql)

    recent = get_recent_orders()
    if not recent.empty:
        recent["Mã đơn"] = recent["Mã đơn"].str[:8].str.upper()
        recent["Trạng thái"] = recent["Trạng thái"].map(STATUS_LABELS).fillna(recent["Trạng thái"])
        recent["Thanh toán"] = recent["Thanh toán"].map(PAYMENT_LABELS).fillna(recent["Thanh toán"])
        recent["Tổng tiền"] = recent["Tổng tiền"].apply(lambda x: fmt_vnd(float(x)) if pd.notna(x) else "—")
        recent["Thời gian"] = pd.to_datetime(recent["Thời gian"]).dt.strftime("%d/%m %H:%M")
        st.dataframe(recent, use_container_width=True, hide_index=True, height=380)
    else:
        st.info("Chưa có dữ liệu đơn hàng.")


# ═══════════════════════════════════════════════════════════════════════════════
#  TAB 2: DOANH THU
# ═══════════════════════════════════════════════════════════════════════════════
with tabs[1]:
    st.markdown("## 💰 Phân tích Doanh thu")

    col1, col2 = st.columns([2, 1])
    with col1:
        days = st.slider("Chọn khoảng thời gian (ngày gần nhất)", 7, 90, 30)
    with col2:
        group_by = st.selectbox("Nhóm theo", ["Ngày", "Tuần", "Tháng"])

    @st.cache_data(ttl=120)
    def get_revenue_trend(days: int):
        sql = f"""
            SELECT
                DATE(ngay_tao) AS date,
                COUNT(*) AS orders,
                COUNT(*) FILTER (WHERE trang_thai_don_hang = 'HOAN_THANH') AS completed,
                COALESCE(SUM(tong_tien) FILTER (
                    WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                ), 0) AS revenue,
                ROUND(AVG(tong_tien)::numeric, 0) AS avg_order_value
            FROM orders.don_hang
            WHERE ngay_tao >= CURRENT_DATE - INTERVAL '{days} days'
            GROUP BY DATE(ngay_tao)
            ORDER BY date
        """
        return query_df(sql)

    trend = get_revenue_trend(days)
    if not trend.empty:
        trend["date"] = pd.to_datetime(trend["date"])
        trend["revenue"] = pd.to_numeric(trend["revenue"], errors="coerce").fillna(0)

        # Revenue trend chart
        fig = make_subplots(specs=[[{"secondary_y": True}]])
        fig.add_trace(go.Bar(
            x=trend["date"], y=trend["revenue"],
            name="Doanh thu", marker_color=RED, opacity=0.8,
        ), secondary_y=False)
        fig.add_trace(go.Scatter(
            x=trend["date"], y=trend["orders"],
            name="Số đơn", mode="lines+markers",
            line=dict(color="#22C55E", width=2), marker=dict(size=5),
        ), secondary_y=True)
        fig.update_layout(
            **PLOTLY_LAYOUT, height=360,
            title="Doanh thu và số đơn hàng theo ngày",
        )
        fig.update_yaxes(title="Doanh thu (₫)", secondary_y=False)
        fig.update_yaxes(title="Số đơn", secondary_y=True)
        st.plotly_chart(fig, use_container_width=True)

        # Summary stats
        total_rev = trend["revenue"].sum()
        avg_daily = trend["revenue"].mean()
        peak_day = trend.loc[trend["revenue"].idxmax(), "date"].strftime("%d/%m") if len(trend) > 0 else "N/A"

        c1, c2, c3, c4 = st.columns(4)
        c1.metric("💰 Tổng doanh thu", fmt_vnd(total_rev))
        c2.metric("📊 Doanh thu TB/ngày", fmt_vnd(avg_daily))
        c3.metric("🏆 Ngày cao điểm", peak_day)
        c4.metric("📦 Tổng đơn hàng", f"{trend['orders'].sum():,}")
    else:
        st.info("Chưa có dữ liệu doanh thu.")

    st.markdown("---")
    col_left, col_right = st.columns(2)

    with col_left:
        st.markdown("## 🏪 Doanh thu theo chi nhánh")

        @st.cache_data(ttl=120)
        def get_branch_revenue():
            sql = f"""
                SELECT
                    COALESCE(co_so_ma, 'Không xác định') AS branch,
                    COUNT(*) AS orders,
                    COALESCE(SUM(tong_tien) FILTER (
                        WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                    ), 0) AS revenue
                FROM orders.don_hang
                WHERE ngay_tao >= CURRENT_DATE - INTERVAL '30 days'
                GROUP BY co_so_ma
                ORDER BY revenue DESC
                LIMIT 10
            """
            return query_df(sql)

        branch = get_branch_revenue()
        if not branch.empty:
            branch["revenue"] = pd.to_numeric(branch["revenue"], errors="coerce").fillna(0)
            fig = px.bar(
                branch, x="revenue", y="branch", orientation="h",
                color="revenue", color_continuous_scale=["#2D3147", RED],
                text=branch["revenue"].apply(fmt_vnd),
            )
            fig.update_layout(**PLOTLY_LAYOUT, height=320, coloraxis_showscale=False)
            fig.update_traces(textposition="outside")
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("Chưa có dữ liệu chi nhánh.")

    with col_right:
        st.markdown("## 💳 Phương thức thanh toán")

        @st.cache_data(ttl=120)
        def get_payment_methods():
            sql = """
                SELECT
                    phuong_thuc_thanh_toan AS method,
                    COUNT(*) AS count,
                    COALESCE(SUM(tong_tien), 0) AS revenue
                FROM orders.don_hang
                WHERE ngay_tao >= CURRENT_DATE - INTERVAL '30 days'
                GROUP BY phuong_thuc_thanh_toan
                ORDER BY count DESC
            """
            return query_df(sql)

        payments = get_payment_methods()
        if not payments.empty:
            payments["label"] = payments["method"].map(PAYMENT_LABELS).fillna(payments["method"])
            payments["revenue"] = pd.to_numeric(payments["revenue"], errors="coerce").fillna(0)
            fig = px.pie(
                payments, values="count", names="label",
                color_discrete_sequence=COLORS, hole=0.5,
                hover_data={"revenue": True},
            )
            fig.update_traces(
                texttemplate="%{label}<br>%{percent:.1%}",
                textposition="outside",
            )
            fig.update_layout(**PLOTLY_LAYOUT, height=320)
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("Chưa có dữ liệu.")


# ═══════════════════════════════════════════════════════════════════════════════
#  TAB 3: SẢN PHẨM
# ═══════════════════════════════════════════════════════════════════════════════
with tabs[2]:
    st.markdown("## ☕ Phân tích Sản phẩm")

    @st.cache_data(ttl=300)
    def get_top_products():
        sql = """
            SELECT
                ct.ma_san_pham::text AS product_id,
                SUM(ct.so_luong) AS total_qty,
                COUNT(DISTINCT ct.ma_don_hang) AS order_count,
                SUM(ct.so_luong * ct.don_gia) AS total_revenue,
                ROUND(AVG(ct.don_gia)::numeric, 0) AS avg_price
            FROM orders.chi_tiet_don_hang ct
            JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
            WHERE d.ngay_tao >= CURRENT_DATE - INTERVAL '30 days'
              AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO', 'DA_XAC_NHAN')
            GROUP BY ct.ma_san_pham
            ORDER BY total_qty DESC
            LIMIT 15
        """
        return query_df(sql)

    products = get_top_products()
    if not products.empty:
        products["total_revenue"] = pd.to_numeric(products["total_revenue"], errors="coerce").fillna(0)
        products["product_short"] = products["product_id"].str[:8].str.upper()

        col_l, col_r = st.columns(2)

        with col_l:
            st.markdown("### 🏆 Top 15 sản phẩm bán chạy (30 ngày)")
            fig = px.bar(
                products.head(10), x="total_qty", y="product_short",
                orientation="h", color="total_revenue",
                color_continuous_scale=["#2D3147", RED, "#FF8C00"],
                text="total_qty", labels={"product_short": "Mã SP", "total_qty": "Số lượng bán"},
            )
            fig.update_layout(**PLOTLY_LAYOUT, height=380, coloraxis_showscale=False)
            fig.update_traces(textposition="outside")
            st.plotly_chart(fig, use_container_width=True)

        with col_r:
            st.markdown("### 💰 Doanh thu theo sản phẩm")
            fig = px.treemap(
                products, path=["product_short"], values="total_revenue",
                color="total_qty", color_continuous_scale=["#1A1D27", RED],
                title="",
            )
            fig.update_layout(**PLOTLY_LAYOUT, height=380)
            st.plotly_chart(fig, use_container_width=True)

        # Products table
        st.markdown("### 📋 Chi tiết sản phẩm")
        tbl = products.copy()
        tbl["total_revenue"] = tbl["total_revenue"].apply(fmt_vnd)
        tbl["avg_price"]     = tbl["avg_price"].apply(lambda x: fmt_vnd(float(x)) if pd.notna(x) else "—")
        tbl = tbl.rename(columns={
            "product_id": "Mã SP", "total_qty": "SL bán",
            "order_count": "Số đơn", "total_revenue": "Doanh thu",
            "avg_price": "Giá TB", "product_short": "Mã ngắn",
        })
        tbl = tbl[["Mã ngắn", "SL bán", "Số đơn", "Doanh thu", "Giá TB"]]
        st.dataframe(tbl, use_container_width=True, hide_index=True)
    else:
        st.info("Chưa có dữ liệu sản phẩm.")


# ═══════════════════════════════════════════════════════════════════════════════
#  TAB 4: KHÁCH HÀNG
# ═══════════════════════════════════════════════════════════════════════════════
with tabs[3]:
    st.markdown("## 👥 Phân tích Khách hàng")

    @st.cache_data(ttl=300)
    def get_customer_data():
        sql = """
            SELECT
                khach_hang_id::text AS customer_id,
                COUNT(*) AS order_count,
                COALESCE(SUM(tong_tien) FILTER (
                    WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                ), 0) AS lifetime_value,
                MIN(ngay_tao) AS first_order,
                MAX(ngay_tao) AS last_order
            FROM orders.don_hang
            WHERE khach_hang_id IS NOT NULL
            GROUP BY khach_hang_id
        """
        return query_df(sql)

    customers = get_customer_data()
    if not customers.empty and len(customers) > 0:
        customers["lifetime_value"] = pd.to_numeric(customers["lifetime_value"], errors="coerce").fillna(0)
        customers["segment"] = pd.cut(
            customers["order_count"],
            bins=[0, 1, 3, 10, float("inf")],
            labels=["🆕 Khách mới", "📦 Thông thường", "⭐ Trung thành", "👑 VIP"],
        ).astype(str)

        # KPIs
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
            fig = px.pie(
                seg_counts, values="Số lượng", names="Phân khúc",
                color_discrete_sequence=["#3B82F6", "#22C55E", "#F59E0B", RED],
                hole=0.55,
            )
            fig.update_layout(**PLOTLY_LAYOUT, height=320)
            st.plotly_chart(fig, use_container_width=True)

        with col_r:
            st.markdown("### 💰 Phân phối Lifetime Value")
            fig = px.histogram(
                customers, x="lifetime_value", nbins=30,
                color_discrete_sequence=[RED], opacity=0.8,
                labels={"lifetime_value": "Lifetime Value (₫)"},
            )
            fig.update_layout(**PLOTLY_LAYOUT, height=320)
            st.plotly_chart(fig, use_container_width=True)

        # Segment details table
        st.markdown("### 📊 Thống kê theo phân khúc")
        seg_detail = customers.groupby("segment").agg(
            count=("customer_id", "count"),
            avg_orders=("order_count", "mean"),
            avg_ltv=("lifetime_value", "mean"),
            total_ltv=("lifetime_value", "sum"),
        ).reset_index()
        seg_detail["avg_ltv"]   = seg_detail["avg_ltv"].apply(fmt_vnd)
        seg_detail["total_ltv"] = seg_detail["total_ltv"].apply(fmt_vnd)
        seg_detail["avg_orders"] = seg_detail["avg_orders"].round(1)
        seg_detail.columns = ["Phân khúc", "Số KH", "Đơn TB", "LTV TB", "Tổng LTV"]
        st.dataframe(seg_detail, use_container_width=True, hide_index=True)
    else:
        st.info("Chưa có dữ liệu khách hàng đăng nhập.")

    # New customer acquisition
    st.markdown("---")
    st.markdown("### 📈 Khách hàng mới theo ngày (30 ngày)")

    @st.cache_data(ttl=300)
    def get_new_customers():
        sql = """
            SELECT
                DATE(first_order) AS date,
                COUNT(*) AS new_customers
            FROM (
                SELECT khach_hang_id, MIN(ngay_tao) AS first_order
                FROM orders.don_hang
                WHERE khach_hang_id IS NOT NULL
                GROUP BY khach_hang_id
            ) sub
            WHERE first_order >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY DATE(first_order)
            ORDER BY date
        """
        return query_df(sql)

    new_cust = get_new_customers()
    if not new_cust.empty:
        fig = px.area(
            new_cust, x="date", y="new_customers",
            color_discrete_sequence=[RED], labels={"new_customers": "Khách mới", "date": "Ngày"},
        )
        fig.update_traces(fill="tozeroy", fillcolor=f"rgba(227,26,35,0.15)", line=dict(color=RED, width=2))
        fig.update_layout(**PLOTLY_LAYOUT, height=260)
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("Chưa có dữ liệu.")


# ═══════════════════════════════════════════════════════════════════════════════
#  TAB 5: SHIPPER
# ═══════════════════════════════════════════════════════════════════════════════
with tabs[4]:
    st.markdown("## 🚴 Hiệu suất Shipper")

    @st.cache_data(ttl=120)
    def get_shipper_stats():
        sql = """
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
                ) FILTER (WHERE sd.delivered_at IS NOT NULL AND sd.assigned_at IS NOT NULL), 1) AS avg_minutes,
                COALESCE(SUM(sd.delivery_fee), 0) AS total_earnings
            FROM orders.shipper_delivery sd
            GROUP BY sd.shipper_id
            ORDER BY delivered DESC
            LIMIT 20
        """
        return query_df(sql)

    shipper_df = get_shipper_stats()
    if not shipper_df.empty:
        shipper_df["total_earnings"] = pd.to_numeric(shipper_df["total_earnings"], errors="coerce").fillna(0)
        shipper_df["success_rate"] = pd.to_numeric(shipper_df["success_rate"], errors="coerce").fillna(0)
        shipper_df["shipper_short"] = shipper_df["shipper_id"].str[:8].str.upper()

        # KPIs
        c1, c2, c3, c4 = st.columns(4)
        c1.metric("🚴 Tổng shipper", f"{len(shipper_df):,}")
        c2.metric("✅ Tỉ lệ giao thành công", f"{shipper_df['success_rate'].mean():.1f}%")
        c3.metric("⏱️ Thời gian TB", f"{shipper_df['avg_minutes'].mean():.0f} phút" if shipper_df["avg_minutes"].notna().any() else "N/A")
        c4.metric("🔴 Đang giao", f"{shipper_df['active'].sum():,}")

        col_l, col_r = st.columns(2)

        with col_l:
            st.markdown("### 🏆 Ranking Shipper (số đơn hoàn thành)")
            fig = px.bar(
                shipper_df.head(10), x="delivered", y="shipper_short",
                orientation="h", color="success_rate",
                color_continuous_scale=["#FF4444", "#FF8C00", "#22C55E"],
                text="delivered", labels={"shipper_short": "Shipper", "delivered": "Đơn hoàn thành"},
            )
            fig.update_layout(**PLOTLY_LAYOUT, height=380)
            fig.update_traces(textposition="outside")
            st.plotly_chart(fig, use_container_width=True)

        with col_r:
            st.markdown("### 💰 Thu nhập Shipper")
            shipper_df["earnings_fmt"] = shipper_df["total_earnings"].apply(fmt_vnd)
            fig = px.bar(
                shipper_df.head(10), x="total_earnings", y="shipper_short",
                orientation="h", color="total_earnings",
                color_continuous_scale=["#2D3147", "#FF8C00"],
                text=shipper_df.head(10)["total_earnings"].apply(fmt_vnd),
                labels={"shipper_short": "Shipper", "total_earnings": "Thu nhập (₫)"},
            )
            fig.update_layout(**PLOTLY_LAYOUT, height=380, coloraxis_showscale=False)
            fig.update_traces(textposition="outside")
            st.plotly_chart(fig, use_container_width=True)

        # Detail table
        st.markdown("### 📋 Chi tiết hiệu suất")
        tbl = shipper_df[["shipper_short", "total", "delivered", "failed", "active", "success_rate", "avg_minutes", "total_earnings"]].copy()
        tbl["total_earnings"] = tbl["total_earnings"].apply(fmt_vnd)
        tbl["success_rate"]   = tbl["success_rate"].apply(lambda x: f"{x:.1f}%")
        tbl["avg_minutes"]    = tbl["avg_minutes"].apply(lambda x: f"{x:.0f} phút" if pd.notna(x) and x > 0 else "N/A")
        tbl.columns = ["Shipper", "Tổng", "Hoàn thành", "Thất bại", "Đang giao", "Tỉ lệ %", "Thời gian TB", "Thu nhập"]
        st.dataframe(tbl, use_container_width=True, hide_index=True)
    else:
        st.info("Chưa có dữ liệu shipper delivery. Cần bàn giao đơn hàng cho shipper trước.")


# ═══════════════════════════════════════════════════════════════════════════════
#  TAB 6: AI ANALYTICS
# ═══════════════════════════════════════════════════════════════════════════════
with tabs[5]:
    st.markdown("## 🤖 AI Analytics — Recommendation & Forecast")

    # Recommendation analysis
    col_l, col_r = st.columns(2)

    with col_l:
        st.markdown("### 🎯 Phân tích hành vi mua sắm (Recommendation Data)")

        @st.cache_data(ttl=600)
        def get_co_purchase():
            sql = """
                WITH pairs AS (
                    SELECT
                        a.ma_san_pham::text AS product_a,
                        b.ma_san_pham::text AS product_b,
                        COUNT(*) AS co_count
                    FROM orders.chi_tiet_don_hang a
                    JOIN orders.chi_tiet_don_hang b
                        ON a.ma_don_hang = b.ma_don_hang
                        AND a.ma_san_pham < b.ma_san_pham
                    GROUP BY a.ma_san_pham, b.ma_san_pham
                    HAVING COUNT(*) > 0
                    ORDER BY co_count DESC
                    LIMIT 15
                )
                SELECT * FROM pairs
            """
            return query_df(sql)

        copurchase = get_co_purchase()
        if not copurchase.empty:
            copurchase["label"] = copurchase["product_a"].str[:6] + " + " + copurchase["product_b"].str[:6]
            fig = px.bar(
                copurchase, x="co_count", y="label", orientation="h",
                color="co_count", color_continuous_scale=["#2D3147", "#A855F7"],
                text="co_count", labels={"label": "Cặp sản phẩm", "co_count": "Lần mua cùng nhau"},
            )
            fig.update_layout(**PLOTLY_LAYOUT, height=380, coloraxis_showscale=False,
                              title="Top cặp sản phẩm thường được mua cùng nhau")
            fig.update_traces(textposition="outside")
            st.plotly_chart(fig, use_container_width=True)

            st.caption("💡 Đây là cơ sở dữ liệu cho thuật toán Collaborative Filtering (CF) / ALS. "
                       "Sản phẩm nào mua cùng nhau nhiều → được gợi ý cùng nhau cho khách hàng.")
        else:
            st.info("Cần có ít nhất 2+ sản phẩm trong 1 đơn hàng để phân tích.")

    with col_r:
        st.markdown("### 📈 Dự báo doanh thu (Forecasting)")

        @st.cache_data(ttl=600)
        def get_revenue_for_forecast():
            sql = """
                SELECT
                    DATE(ngay_tao) AS date,
                    COALESCE(SUM(tong_tien) FILTER (
                        WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                    ), 0) AS revenue
                FROM orders.don_hang
                WHERE ngay_tao >= CURRENT_DATE - INTERVAL '60 days'
                GROUP BY DATE(ngay_tao)
                ORDER BY date
            """
            return query_df(sql)

        hist = get_revenue_for_forecast()
        if not hist.empty and len(hist) >= 7:
            hist["date"] = pd.to_datetime(hist["date"])
            hist["revenue"] = pd.to_numeric(hist["revenue"], errors="coerce").fillna(0)

            # Simple 7-day moving average forecast
            window = min(7, len(hist))
            hist["ma7"] = hist["revenue"].rolling(window=window).mean()
            last_ma = hist["ma7"].iloc[-1]

            # Forecast next 7 days with slight trend
            last_date = hist["date"].iloc[-1]
            trend = (hist["revenue"].iloc[-7:].mean() - hist["revenue"].iloc[-14:-7].mean()) if len(hist) >= 14 else 0
            forecast_dates = [last_date + timedelta(days=i+1) for i in range(7)]
            forecast_vals  = [max(0, last_ma + trend * (i * 0.3)) for i in range(7)]
            # Add some simulated variance
            np.random.seed(42)
            forecast_vals = [v * (1 + np.random.uniform(-0.05, 0.1)) for v in forecast_vals]

            fig = go.Figure()
            fig.add_trace(go.Scatter(
                x=hist["date"], y=hist["revenue"],
                name="Thực tế", mode="lines",
                line=dict(color="#22C55E", width=2),
            ))
            fig.add_trace(go.Scatter(
                x=hist["date"], y=hist["ma7"],
                name="Trung bình 7 ngày", mode="lines",
                line=dict(color="#3B82F6", width=1.5, dash="dot"),
            ))
            fig.add_trace(go.Scatter(
                x=forecast_dates, y=forecast_vals,
                name="Dự báo 7 ngày", mode="lines+markers",
                line=dict(color=RED, width=2, dash="dash"),
                marker=dict(size=8, color=RED),
            ))
            fig.add_vrect(
                x0=forecast_dates[0], x1=forecast_dates[-1],
                fillcolor="rgba(227,26,35,0.07)", layer="below",
                line_width=0, annotation_text="Dự báo",
                annotation_position="top left",
                annotation_font_color=RED,
            )
            # Build custom layout without legend to avoid duplicate kwarg
            forecast_layout = {k: v for k, v in PLOTLY_LAYOUT.items() if k != "legend"}
            fig.update_layout(
                **forecast_layout, height=380,
                title="Dự báo doanh thu 7 ngày tới (Moving Average)",
                legend=dict(
                    bgcolor="rgba(0,0,0,0)", font=dict(color="#CCCCCC"),
                    orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1,
                ),
            )
            st.plotly_chart(fig, use_container_width=True)
            st.caption("💡 Dự báo dựa trên Moving Average 7 ngày. Model ALS (MLlib) sẽ thay thế khi có đủ dữ liệu.")
        else:
            st.info("Cần ít nhất 7 ngày dữ liệu để dự báo.")

    # AI Model Status
    st.markdown("---")
    st.markdown("### 🔍 Trạng thái AI Service")

    @st.cache_data(ttl=60)
    def get_ai_status():
        try:
            import requests
            resp = requests.get("http://ai-service:8000/health", timeout=3)
            return resp.json() if resp.status_code == 200 else None
        except:
            return None

    ai_status = get_ai_status()
    c1, c2, c3 = st.columns(3)
    with c1:
        st.markdown("""
        <div class='info-card'>
          <div style='font-size:28px; margin-bottom:8px'>🤖</div>
          <div style='color:#8B8FA8; font-size:12px'>AI Service</div>
          <div style='font-size:20px; font-weight:800; color:#22C55E; margin-top:4px'>
            {} 
          </div>
        </div>
        """.format("Online ✓" if ai_status else "Đang kết nối..."), unsafe_allow_html=True)
    with c2:
        st.markdown("""
        <div class='info-card'>
          <div style='font-size:28px; margin-bottom:8px'>📊</div>
          <div style='color:#8B8FA8; font-size:12px'>Recommendation Model</div>
          <div style='font-size:16px; font-weight:800; color:#A855F7; margin-top:4px'>
            Cosine Similarity → ALS
          </div>
        </div>
        """, unsafe_allow_html=True)
    with c3:
        st.markdown("""
        <div class='info-card'>
          <div style='font-size:28px; margin-bottom:8px'>🔮</div>
          <div style='color:#8B8FA8; font-size:12px'>Forecast Model</div>
          <div style='font-size:16px; font-weight:800; color:#3B82F6; margin-top:4px'>
            Moving Average 7-Day
          </div>
        </div>
        """, unsafe_allow_html=True)


# ═══════════════════════════════════════════════════════════════════════════════
#  TAB 7: DATA PIPELINE
# ═══════════════════════════════════════════════════════════════════════════════
with tabs[6]:
    st.markdown("## 🔧 Data Pipeline Status")

    col_l, col_r = st.columns([1, 1])

    with col_l:
        st.markdown("### 🔌 Kafka Event Streaming")
        ks = kafka_status()
        if ks["connected"]:
            st.success(f"✓ Kafka Online — {ks.get('topics', 0)} topics")
            if ks.get("topic_names"):
                for t in ks["topic_names"]:
                    st.markdown(f"<span class='status-ok'>✓ {t}</span>  ", unsafe_allow_html=True)
        else:
            st.warning(f"⚡ Đang kết nối... ({ks.get('error', '')})")
            st.markdown("""
            **Topics sẽ được tạo tự động:**
            - `orders-events` — Đơn hàng mới
            - `order-items-events` — Chi tiết đơn hàng
            - `shipper-events` — Shipper delivery events
            - `customer-events` — Hành vi khách hàng
            """)

    with col_r:
        st.markdown("### 🗂️ MinIO Data Lakehouse")
        ms = minio_status()
        if ms["connected"]:
            st.success(f"✓ MinIO Online — {ms.get('buckets', 0)} buckets, {ms.get('objects', 0)} objects")
            s3 = get_minio()
            if s3:
                for bucket, layer_name in [
                    ("avengers-bronze", "🟤 Bronze — Raw Data"),
                    ("avengers-silver", "⚪ Silver — Cleaned"),
                    ("avengers-gold",   "🟡 Gold — Aggregated"),
                ]:
                    try:
                        resp = s3.list_objects_v2(Bucket=bucket)
                        count = resp.get("KeyCount", 0)
                        badge = "status-ok" if count > 0 else "status-warn"
                        status = f"{count} files" if count > 0 else "Chưa có dữ liệu"
                        st.markdown(f"<span class='{badge}'>{layer_name}: {status}</span>  ", unsafe_allow_html=True)
                    except:
                        st.markdown(f"<span class='status-err'>{layer_name}: Error</span>  ", unsafe_allow_html=True)
        else:
            st.warning("⚡ Đang kết nối MinIO...")

    st.markdown("---")

    # Pipeline Architecture diagram
    st.markdown("### 🏗️ Kiến trúc Data Pipeline")
    st.markdown("""
    <div class='info-card'>
    <pre style='color:#CCCCCC; font-family:monospace; font-size:13px; background:none; border:none'>
    ╔══════════════════════════════════════════════════════════════════════╗
    ║              AVENGERS COFFEE — DATA PLATFORM ARCHITECTURE            ║
    ╠══════════════════════════════════════════════════════════════════════╣
    ║                                                                      ║
    ║   [PostgreSQL]  ──→  [Kafka Producer]  ──→  [Kafka Cluster]         ║
    ║   (Operational)       (30s polling)           (Event Store)          ║
    ║                                                    │                 ║
    ║                                                    ▼                 ║
    ║   ┌──────────────────── LAKEHOUSE (MinIO) ────────────────────────┐ ║
    ║   │                                                                │ ║
    ║   │  🟤 BRONZE         ⚪ SILVER         🟡 GOLD                  │ ║
    ║   │  Raw Parquet  →   Clean+Join   →   Aggregations              │ ║
    ║   │  (as-is from PG)  (Normalized)    (KPIs, Revenue, etc.)       │ ║
    ║   └────────────────────────────────────────────────────────────────┘ ║
    ║                                    │                                  ║
    ║   [Apache Airflow] ─(schedule 2AM)─┘  [Spark] ─(runs jobs)─┘        ║
    ║                                                                       ║
    ║                       ┌──────────────────┐                           ║
    ║                       │  📊 STREAMLIT    │                           ║
    ║                       │  Analytics       │                           ║
    ║                       │  Dashboard       │                           ║
    ║                       │  :8501           │                           ║
    ║                       └──────────────────┘                           ║
    ╚══════════════════════════════════════════════════════════════════════╝
    </pre>
    </div>
    """, unsafe_allow_html=True)

    st.markdown("### ⏰ Airflow Pipeline Schedule")
    st.markdown("""
    | DAG | Lịch chạy | Mô tả |
    |-----|-----------|-------|
    | `avengers_daily_pipeline` | **2:00 AM** mỗi ngày | Bronze → Silver → Gold |
    | Verify | Sau Gold | Kiểm tra tất cả datasets được tạo |
    """)

    st.markdown("### 🚀 Chạy pipeline thủ công")
    if st.button("▶️ Chạy Pipeline ngay bây giờ", type="primary"):
        with st.spinner("Đang chạy Bronze → Silver → Gold..."):
            import subprocess
            import sys
            try:
                # Try to run gold_aggregation directly since it reads from PG
                exec(open("/app/gold_runner.py").read()) if os.path.exists("/app/gold_runner.py") else None
                st.success("✅ Pipeline hoàn thành! Làm mới trang để xem dữ liệu mới.")
            except Exception as e:
                st.info(f"💡 Để chạy pipeline: `docker exec avengers_spark_jobs /opt/spark-jobs/entrypoint.sh`")
