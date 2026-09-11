import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
from datetime import datetime

from utils import query_df, fmt_vnd, RED, get_max_date
from components import render_sidebar, render_section_title, render_kpi_card
from styles import inject_styles, init_plotly_template, apply_layout

# ─── Page Config ──────────────────────────────────────────────────────────────
st.set_page_config(page_title="Khách Hàng", page_icon="👥", layout="wide")
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

st.markdown("<h2 style='margin-bottom:24px; font-weight:800; color:#C0C0D8;'>Phân Tích Đối Tượng Khách Hàng</h2>", unsafe_allow_html=True)
cust_ai_container = st.empty()

@st.cache_data(ttl=86400, show_spinner=False)
def get_customer_data():
    max_d = get_max_date()
    return query_df(f"""
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
          AND ngay_tao >= '{max_d}'::date - INTERVAL '180 days'
        GROUP BY ma_nguoi_dung
        LIMIT 500
    """)

@st.cache_data(ttl=86400, show_spinner=False)
def get_new_customers():
    max_d = get_max_date()
    return query_df(f"""
        SELECT first_order::date AS date, COUNT(*) AS new_customers
        FROM (
            SELECT ma_nguoi_dung, MIN(ngay_tao) AS first_order
            FROM orders.don_hang
            WHERE ma_nguoi_dung IS NOT NULL
              AND ngay_tao >= '{max_d}'::date - INTERVAL '90 days'
            GROUP BY ma_nguoi_dung
        ) sub
        GROUP BY first_order::date ORDER BY date
    """)

customers = get_customer_data()
customers["lifetime_value"] = pd.to_numeric(customers["lifetime_value"], errors="coerce").fillna(0)
customers["segment"] = pd.cut(
    customers["order_count"], bins=[0, 1, 3, 10, float("inf")],
    labels=["Khách mới", "Thông thường", "Thân thiết", "Khách VIP"],
).astype(str)

st.markdown("<br>", unsafe_allow_html=True)
c1, c2, c3, c4 = st.columns(4)
with c1: render_kpi_card("Tổng Khách Hàng", f"{len(customers):,}")
with c2: render_kpi_card("Khách Hàng VIP", f"{(customers['segment'] == 'Khách VIP').sum():,}")
with c3: render_kpi_card("LTV Trung Bình", fmt_vnd(customers["lifetime_value"].mean()))
with c4: render_kpi_card("Số Đơn TB / Khách", f"{customers['order_count'].mean():.1f}")

st.markdown("<br>", unsafe_allow_html=True)
render_section_title("Phân Khúc Khách Hàng")
seg_counts = customers["segment"].value_counts().reset_index()
seg_counts.columns = ["Phân khúc", "Số lượng"]
fig = px.pie(seg_counts, values="Số lượng", names="Phân khúc",
             color_discrete_sequence=["#2563EB", "#10B981", "#F59E0B", RED], hole=0.5)
apply_layout(fig, height=360, margin=dict(l=30, r=30, t=30, b=40))
fig.update_traces(textposition="inside", textinfo="percent+label")
st.plotly_chart(fig, use_container_width=True)

st.markdown("<br>", unsafe_allow_html=True)
render_section_title("Bảng Thống Kê Phân Khúc")
seg_detail = customers.groupby("segment").agg(
    count=("customer_id", "count"), avg_orders=("order_count", "mean"),
    avg_ltv=("lifetime_value", "mean"), total_ltv=("lifetime_value", "sum"),
).reset_index()
seg_detail["avg_ltv"] = seg_detail["avg_ltv"].apply(fmt_vnd)
seg_detail["total_ltv"] = seg_detail["total_ltv"].apply(fmt_vnd)
seg_detail["avg_orders"] = seg_detail["avg_orders"].round(1)
seg_detail.columns = ["Phân Khúc Khách Hàng", "Số Lượng KH", "Số Đơn TB", "LTV Trung Bình", "Tổng LTV"]
st.dataframe(seg_detail, use_container_width=True, hide_index=True)

st.markdown("<hr style='border-color:#2A2A3E; margin:20px 0;'>", unsafe_allow_html=True)
col_vip, col_trend = st.columns([1, 1], gap="large")

with col_vip:
    render_section_title("Top 10 Khách Hàng Chi Tiêu Cao Nhất")
    top_cust = customers.nlargest(10, "lifetime_value").copy()
    top_cust["label"] = top_cust["customer_id"].apply(lambda x: f"KH-{str(x)[:6]}...")
    fig_vip = px.bar(top_cust, x="lifetime_value", y="label", orientation="h",
                     color="lifetime_value", color_continuous_scale=["#1A1A2E", RED],
                     labels={"lifetime_value": "Tổng chi tiêu (đ)", "label": "Khách hàng"})
    apply_layout(fig_vip, height=360, margin=dict(l=100, r=30, t=30, b=40))
    fig_vip.update_layout(coloraxis_showscale=False, yaxis={'categoryorder':'total ascending'})
    st.plotly_chart(fig_vip, use_container_width=True)

with col_trend:
    render_section_title("Tăng Trưởng Khách Hàng Mới (90 ngày)")

    new_cust = get_new_customers()
    if not new_cust.empty:
        new_cust["date"] = pd.to_datetime(new_cust["date"])
        fig_trend = px.area(new_cust, x="date", y="new_customers",
                      color_discrete_sequence=[RED], labels={"new_customers": "Số khách mới", "date": "Ngày"})
        fig_trend.update_traces(name="Khách mới", fill="tozeroy", fillcolor="rgba(255, 71, 87, 0.1)", line=dict(color=RED, width=2))
        apply_layout(fig_trend, height=360, margin=dict(l=40, r=30, t=30, b=40))
        fig_trend.update_layout(showlegend=False)
        st.plotly_chart(fig_trend, use_container_width=True)
    else:
        st.info("Chưa có dữ liệu khách hàng mới.")

# AI Insight
if (ANTHROPIC_API_KEY_LOADED or GROQ_API_KEY_LOADED):
    if 'seg_detail' in locals() and not seg_detail.empty:
        with st.spinner("AI đang phân tích dữ liệu Khách hàng..."):
            try:
                summary_csv = seg_detail.to_csv(index=False)
                insight = generate_tab_insights("Phân tích Khách hàng", summary_csv)
                insight_html = insight.replace('\n', '<br>')
                cust_ai_container.markdown(f"""
                <div style='background:#1A1A2E; border:1px solid #2A2A3E; border-left:4px solid #FF4757; border-radius:12px; padding:18px; margin-bottom:20px; box-shadow:0 2px 8px rgba(0,0,0,0.5);'>
                    <div style='font-size:15px; font-weight:800; color:#FF4757; margin-bottom:8px;'>Đề Xuất Phân Tích Thông Minh (AI Insights)</div>
                    <div style='color:#C0C0D8; font-size:14px; line-height:1.6;'>
                        {insight_html}
                    </div>
                </div>
                """, unsafe_allow_html=True)
            except Exception as e:
                cust_ai_container.warning(f"Chưa tạo được phân tích AI: {e}")

