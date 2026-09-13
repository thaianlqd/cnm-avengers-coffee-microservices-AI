import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots

from utils import query_df, fmt_vnd, RED, COLORS, STATUS_LABELS, PAYMENT_LABELS, get_max_date
from components import render_sidebar, render_section_title, render_kpi_card
from styles import inject_styles, init_plotly_template, apply_layout, PLOTLY_LAYOUT

# ─── Page Config ──────────────────────────────────────────────────────────────
st.set_page_config(page_title="Doanh Thu", page_icon="💰", layout="wide")
inject_styles()
init_plotly_template()
render_sidebar()

try:
    from ai_engine import (
        ANTHROPIC_API_KEY_LOADED, GROQ_API_KEY_LOADED, generate_tab_insights
    )
except ImportError:
    ANTHROPIC_API_KEY_LOADED = ''
    GROQ_API_KEY_LOADED = ''

st.markdown("<h2 style='margin-bottom:24px; font-weight:800; color:#C0C0D8;'>Phân Tích Xu Hướng Doanh Thu</h2>", unsafe_allow_html=True)
rev_ai_container = st.empty()

st.markdown("<br>", unsafe_allow_html=True)
days = st.slider("Khoảng thời gian phân tích (ngày)", 7, 90, 30, key="rev_days")

@st.cache_data(ttl=86400, show_spinner=False)
def get_revenue_trend(d: int):
    max_d = get_max_date()
    return query_df(f"""
        SELECT DATE(ngay_tao) AS date,
               COUNT(*) AS orders,
               COUNT(*) FILTER (WHERE trang_thai_don_hang = 'HOAN_THANH') AS completed,
               COALESCE(SUM(tong_tien) FILTER (
                   WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
               ), 0) AS revenue,
               ROUND(AVG(tong_tien)::numeric, 0) AS avg_order_value
        FROM orders.don_hang
        WHERE ngay_tao >= '{max_d}'::date - INTERVAL '{d} days'
        GROUP BY DATE(ngay_tao) ORDER BY date
    """)

trend = get_revenue_trend(days)
if not trend.empty:
    trend["date"] = pd.to_datetime(trend["date"])
    trend["revenue"] = pd.to_numeric(trend["revenue"], errors="coerce").fillna(0)
    
    total_rev = trend["revenue"].sum()
    avg_daily = trend["revenue"].mean()
    
    c1, c2, c3, c4 = st.columns(4)
    with c1: render_kpi_card("Tổng Doanh Thu", fmt_vnd(total_rev))
    with c2: render_kpi_card("Doanh Thu TB / Ngày", fmt_vnd(avg_daily))
    with c3: render_kpi_card("Ngày Cao Điểm", trend.loc[trend["revenue"].idxmax(), "date"].strftime("%d/%m") if len(trend) > 0 else "N/A")
    with c4: render_kpi_card("Tổng Số Đơn Hàng", f"{int(trend['orders'].sum()):,}")
    
    st.markdown("<br>", unsafe_allow_html=True)

    fig = make_subplots(specs=[[{"secondary_y": True}]])
    fig.add_trace(go.Bar(x=trend["date"], y=trend["revenue"],
                         name="Doanh thu (đ)", marker_color=RED, opacity=0.85), secondary_y=False)
    fig.add_trace(go.Scatter(x=trend["date"], y=trend["orders"],
                             name="Số lượng đơn", mode="lines+markers",
                             line=dict(color="#10B981", width=2.5), marker=dict(size=5)),
                  secondary_y=True)
    apply_layout(fig, height=360, margin=dict(l=60, r=60, t=40, b=50))
    fig.update_xaxes(title="Ngày")
    fig.update_yaxes(title="Doanh thu (đ)", secondary_y=False)
    fig.update_yaxes(title="Số đơn", secondary_y=True)
    st.plotly_chart(fig, use_container_width=True)

else:
    st.info("Chưa có dữ liệu doanh thu.")

st.markdown("<hr style='border-color:#2A2A3E; margin:20px 0;'>", unsafe_allow_html=True)
col_left, col_right = st.columns(2, gap="large")

with col_left:
    render_section_title("Doanh Thu theo Chi Nhánh (30 ngày)")
    @st.cache_data(ttl=86400, show_spinner=False)
    def get_branch_revenue():
        max_d = get_max_date()
        return query_df(f"""
            SELECT COALESCE(co_so_ma, 'Không xác định') AS branch,
                   COUNT(*) AS orders,
                   COALESCE(SUM(tong_tien) FILTER (
                       WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                   ), 0) AS revenue
            FROM orders.don_hang
            WHERE ngay_tao >= '{max_d}'::date - INTERVAL '30 days'
            GROUP BY co_so_ma ORDER BY revenue DESC LIMIT 10
        """)
    branch = get_branch_revenue()
    if not branch.empty:
        branch["revenue"] = pd.to_numeric(branch["revenue"], errors="coerce").fillna(0)
        fig = px.bar(branch, x="revenue", y="branch", orientation="h",
                     color="revenue", color_continuous_scale=["#1A1A2E", RED],
                     labels={"revenue": "Doanh thu (đ)", "branch": "Chi nhánh"})
        apply_layout(fig, height=360, margin=dict(l=130, r=40, t=30, b=40))
        fig.update_layout(coloraxis_showscale=False)
        fig.update_traces(textposition="auto")
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("Chưa có dữ liệu chi nhánh.")

with col_right:
    render_section_title("Cơ Cấu Phương Thức Thanh Toán")
    @st.cache_data(ttl=86400, show_spinner=False)
    def get_payment_methods():
        max_d = get_max_date()
        return query_df(f"""
            SELECT phuong_thuc_thanh_toan AS method,
                   COUNT(*) AS count,
                   COALESCE(SUM(tong_tien), 0) AS revenue
            FROM orders.don_hang
            WHERE ngay_tao >= '{max_d}'::date - INTERVAL '30 days'
            GROUP BY phuong_thuc_thanh_toan ORDER BY count DESC
        """)
    payments = get_payment_methods()
    if not payments.empty:
        payments["label"] = payments["method"].map(PAYMENT_LABELS).fillna(payments["method"])
        fig = px.pie(payments, values="count", names="label",
                     color_discrete_sequence=COLORS, hole=0.5)
        apply_layout(fig, height=360, margin=dict(l=30, r=30, t=30, b=40))
        fig.update_traces(textposition="inside", textinfo="percent+label")
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("Chưa có dữ liệu.")

# ── Wallet Transaction Section ────────────────────────
st.markdown("<hr style='border-color:#2A2A3E; margin:20px 0;'>", unsafe_allow_html=True)
render_section_title("Giao Dịch Ví Điện Tử")

@st.cache_data(ttl=86400, show_spinner=False)
def get_wallet_transactions():
    return query_df("""
        SELECT
            type AS transaction_type,
            status,
            COUNT(*) AS tx_count,
            COALESCE(SUM(amount), 0) AS total_amount,
            ROUND(AVG(amount)::numeric, 0) AS avg_amount,
            DATE_TRUNC('day', created_at)::date AS tx_date
        FROM orders.customer_wallet_transaction
        GROUP BY type, status, DATE_TRUNC('day', created_at)
        ORDER BY tx_date
    """)

wallet_tx = get_wallet_transactions()
if not wallet_tx.empty:
    wallet_tx["total_amount"] = pd.to_numeric(wallet_tx["total_amount"], errors="coerce").fillna(0)
    wallet_tx["avg_amount"] = pd.to_numeric(wallet_tx["avg_amount"], errors="coerce").fillna(0)

    success_tx = wallet_tx[wallet_tx["status"] == "SUCCESS"]
    if not success_tx.empty:
        wt1, wt2, wt3 = st.columns(3)
        topup = success_tx[success_tx["transaction_type"] == "TOP_UP"]
        payment = success_tx[success_tx["transaction_type"] == "PAYMENT"]
        with wt1: render_kpi_card("Tổng Nạp Ví", fmt_vnd(topup["total_amount"].sum()), f"{int(topup['tx_count'].sum())} giao dịch")
        with wt2: render_kpi_card("Tổng Thanh Toán Ví", fmt_vnd(payment["total_amount"].sum()), f"{int(payment['tx_count'].sum())} giao dịch")
        with wt3: render_kpi_card("Mức Nạp Trung Bình", fmt_vnd(topup["avg_amount"].mean() if len(topup) > 0 else 0), "mỗi lần nạp")

        st.markdown("<br>", unsafe_allow_html=True)
        fig = px.bar(
            success_tx.groupby(["tx_date", "transaction_type"])["total_amount"].sum().reset_index(),
            x="tx_date", y="total_amount", color="transaction_type",
            barmode="group", color_discrete_sequence=["#10B981", RED, "#2563EB"],
            labels={"tx_date": "Ngày", "total_amount": "Số tiền (đ)", "transaction_type": "Loại giao dịch"},
        )
        apply_layout(fig, height=300, margin=dict(l=60, r=40, t=30, b=50))
        st.plotly_chart(fig, use_container_width=True)
else:
    st.info("Chưa có giao dịch Ví. Dùng app Mobile để tạo giao dịch nạp Ví để xem dữ liệu tại đây.")

# AI Insight cho tab Doanh thu
if (ANTHROPIC_API_KEY_LOADED or GROQ_API_KEY_LOADED):
    if 'trend' in locals() and not trend.empty:
        with st.spinner("AI đang phân tích dữ liệu Doanh thu..."):
            try:
                summary_csv = trend.tail(15).to_csv(index=False)
                insight = generate_tab_insights("Phân tích Doanh thu", summary_csv)
                insight_html = insight.replace('\n', '<br>')
                rev_ai_container.markdown(f"""
                <div style='background:#1A1A2E; border:1px solid #2A2A3E; border-left:4px solid #FF4757; border-radius:12px; padding:18px; margin-bottom:20px; box-shadow:0 2px 8px rgba(0,0,0,0.5);'>
                    <div style='font-size:15px; font-weight:800; color:#FF4757; margin-bottom:8px;'>Đề Xuất Phân Tích Thông Minh (AI Insights)</div>
                    <div style='color:#C0C0D8; font-size:14px; line-height:1.6;'>
                        {insight_html}
                    </div>
                </div>
                """, unsafe_allow_html=True)
            except Exception as e:
                rev_ai_container.warning(f"Chưa tạo được phân tích AI: {e}")
