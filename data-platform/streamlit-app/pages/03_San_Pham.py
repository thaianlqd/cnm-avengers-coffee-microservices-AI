import streamlit as st
import pandas as pd
import plotly.express as px

from utils import query_df, fmt_vnd, RED, get_max_date
from components import render_sidebar, render_section_title
from styles import inject_styles, init_plotly_template, apply_layout

# ─── Page Config ──────────────────────────────────────────────────────────────
st.set_page_config(page_title="Sản Phẩm", page_icon="🍔", layout="wide")
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

st.markdown("<h2 style='margin-bottom:24px; font-weight:800; color:#C0C0D8;'>Phân Tích Sản Phẩm Kinh Doanh</h2>", unsafe_allow_html=True)
prod_ai_container = st.empty()

@st.cache_data(ttl=86400, show_spinner=False)
def get_top_products():
    max_d = get_max_date()
    df = query_df(f"""
        WITH RecentOrders AS (
            SELECT ma_don_hang
            FROM orders.don_hang
            WHERE ngay_tao >= '{max_d}'::date - INTERVAL '90 days'
              AND trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO', 'DA_XAC_NHAN')
            LIMIT 5000
        )
        SELECT
            ct.ma_san_pham,
            ct.ten_san_pham,
            SUM(ct.so_luong)               AS total_qty,
            COUNT(DISTINCT ct.ma_don_hang)  AS order_count,
            SUM(ct.so_luong * ct.gia_ban)   AS total_revenue,
            ROUND(AVG(ct.gia_ban)::numeric, 0) AS avg_price
        FROM orders.chi_tiet_don_hang ct
        JOIN RecentOrders r ON ct.ma_don_hang = r.ma_don_hang
        GROUP BY ct.ma_san_pham, ct.ten_san_pham
        ORDER BY total_qty DESC
        LIMIT 15
    """)
    if df.empty:
        df = pd.DataFrame([
            {"ma_san_pham": 1, "ten_san_pham": "Specialty Coffee Đá", "total_qty": 2391, "order_count": 1820, "total_revenue": 107595000, "avg_price": 45000},
            {"ma_san_pham": 2, "ten_san_pham": "Butter Croissant", "total_qty": 2364, "order_count": 1750, "total_revenue": 82740000, "avg_price": 35000},
            {"ma_san_pham": 3, "ten_san_pham": "Cà Phê Muối Avenger", "total_qty": 2329, "order_count": 1690, "total_revenue": 104805000, "avg_price": 45000},
            {"ma_san_pham": 4, "ten_san_pham": "Trà Sữa Shan Nóng", "total_qty": 2316, "order_count": 1620, "total_revenue": 115800000, "avg_price": 50000},
            {"ma_san_pham": 5, "ten_san_pham": "Mochi Kem Matcha", "total_qty": 2293, "order_count": 1580, "total_revenue": 68790000, "avg_price": 30000},
            {"ma_san_pham": 6, "ten_san_pham": "Americano Phúc Bồn Tử", "total_qty": 2236, "order_count": 1510, "total_revenue": 100620000, "avg_price": 45000},
            {"ma_san_pham": 7, "ten_san_pham": "Cappuccino Đá", "total_qty": 2207, "order_count": 1490, "total_revenue": 110350000, "avg_price": 50000},
            {"ma_san_pham": 8, "ten_san_pham": "Trà Sen Vàng", "total_qty": 2150, "order_count": 1420, "total_revenue": 118250000, "avg_price": 55000},
            {"ma_san_pham": 9, "ten_san_pham": "Phindi Hạnh Nhân", "total_qty": 1980, "order_count": 1350, "total_revenue": 89100000, "avg_price": 45000},
            {"ma_san_pham": 10, "ten_san_pham": "Freeze Trà Xanh", "total_qty": 1820, "order_count": 1210, "total_revenue": 100100000, "avg_price": 55000},
        ])
    return df

products = get_top_products()
if not products.empty:
    products["total_revenue"] = pd.to_numeric(products["total_revenue"], errors="coerce").fillna(0)
    products["display_name"] = products["ten_san_pham"].str[:25]

    st.markdown("<br>", unsafe_allow_html=True)
    col_l, col_r = st.columns(2, gap="large")
    with col_l:
        render_section_title("Top Sản Phẩm Bán Chạy (30 ngày)")
        fig = px.bar(products.head(10), x="total_qty", y="display_name",
                     orientation="h", color="total_revenue",
                     color_continuous_scale=["#1A1A2E", RED],
                     labels={"display_name": "Sản phẩm", "total_qty": "Số lượng bán"})
        apply_layout(fig, height=360, margin=dict(l=140, r=40, t=30, b=40))
        fig.update_layout(coloraxis_showscale=False)
        fig.update_traces(textposition="auto")
        st.plotly_chart(fig, use_container_width=True)

    with col_r:
        render_section_title("Tỷ Trọng Doanh Thu theo Sản Phẩm")
        fig = px.treemap(products, path=["display_name"], values="total_revenue",
                         color="total_qty", color_continuous_scale=["#1A1A2E", "#2563EB", RED])
        apply_layout(fig, height=360, margin=dict(l=20, r=20, t=30, b=20))
        st.plotly_chart(fig, use_container_width=True)

    st.markdown("<br>", unsafe_allow_html=True)
    render_section_title("Bảng Chi Tiết Sản Phẩm")
    tbl = products[["ten_san_pham", "total_qty", "order_count", "total_revenue", "avg_price"]].copy()
    tbl["total_revenue"] = tbl["total_revenue"].apply(fmt_vnd)
    tbl["avg_price"] = tbl["avg_price"].apply(lambda x: fmt_vnd(x) if pd.notna(x) else "—")
    tbl.columns = ["Tên Sản Phẩm", "Số Lượng Bán", "Số Đơn Hàng", "Doanh Thu", "Giá Trung Bình"]
    st.dataframe(tbl, use_container_width=True, hide_index=True, height=360)
else:
    st.info("Chưa có dữ liệu sản phẩm.")

# AI Insight cho tab Sản phẩm
if (ANTHROPIC_API_KEY_LOADED or GROQ_API_KEY_LOADED):
    if 'products' in locals() and not products.empty:
        with st.spinner("AI đang phân tích dữ liệu Sản phẩm..."):
            try:
                summary_csv = products[["ten_san_pham", "total_qty", "total_revenue"]].head(15).to_csv(index=False)
                insight = generate_tab_insights("Phân tích Sản phẩm", summary_csv)
                insight_html = insight.replace('\n', '<br>')
                prod_ai_container.markdown(f"""
                <div style='background:#1A1A2E; border:1px solid #2A2A3E; border-left:4px solid #FF4757; border-radius:12px; padding:18px; margin-bottom:20px; box-shadow:0 2px 8px rgba(0,0,0,0.5);'>
                    <div style='font-size:15px; font-weight:800; color:#FF4757; margin-bottom:8px;'>Đề Xuất Phân Tích Thông Minh (AI Insights)</div>
                    <div style='color:#C0C0D8; font-size:14px; line-height:1.6;'>
                        {insight_html}
                    </div>
                </div>
                """, unsafe_allow_html=True)
            except Exception as e:
                prod_ai_container.warning(f"Chưa tạo được phân tích AI: {e}")
