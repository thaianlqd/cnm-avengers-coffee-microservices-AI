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

# ── Phân Tích Chuyên Sâu Sản Phẩm (Pareto & Scatter) ────────────────────
st.markdown("<hr style='border-color:#2A2A3E; margin:20px 0;'>", unsafe_allow_html=True)
render_section_title("Phân Tích Chuyên Sâu (Deep Dive Data Analyst)")

c_pareto, c_scatter = st.columns(2, gap="large")

with c_pareto:
    st.markdown("#### Phân Tích ABC (Pareto 80/20) - Theo Doanh Thu")
    if not products.empty and len(products) > 3:
        # Sort and calculate cumulative percentage
        from plotly.subplots import make_subplots
        import plotly.graph_objects as go
        
        pareto_df = products.sort_values(by="total_revenue", ascending=False).copy()
        pareto_df["cum_revenue"] = pareto_df["total_revenue"].cumsum()
        total_rev = pareto_df["total_revenue"].sum()
        pareto_df["cum_percentage"] = (pareto_df["cum_revenue"] / total_rev) * 100
        
        # Categorize A, B, C
        def abc_class(pct):
            if pct <= 80: return "A (80% DT)"
            elif pct <= 95: return "B (15% DT)"
            return "C (5% DT)"
        pareto_df["Class"] = pareto_df["cum_percentage"].apply(abc_class)
        
        fig_pareto = make_subplots(specs=[[{"secondary_y": True}]])
        
        fig_pareto.add_trace(go.Bar(
            x=pareto_df["display_name"], y=pareto_df["total_revenue"],
            name="Doanh thu", marker_color="#2563EB"
        ), secondary_y=False)
        
        fig_pareto.add_trace(go.Scatter(
            x=pareto_df["display_name"], y=pareto_df["cum_percentage"],
            name="Tích lũy (%)", mode="lines+markers",
            line=dict(color="#FF4757", width=3)
        ), secondary_y=True)
        
        # Add 80% reference line
        fig_pareto.add_hline(y=80, line_dash="dash", line_color="#10B981", secondary_y=True, annotation_text="80% Doanh Thu")
        
        fig_pareto.update_layout(
            paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
            font=dict(color="#C0C0D8", family="Inter"),
            margin=dict(l=0, r=0, t=10, b=80),
            height=380,
            showlegend=False
        )
        fig_pareto.update_yaxes(title_text="Doanh thu (đ)", secondary_y=False, showgrid=False)
        fig_pareto.update_yaxes(title_text="Tích lũy (%)", secondary_y=True, showgrid=True, gridcolor="#1E1E3A", range=[0, 105])
        st.plotly_chart(fig_pareto, use_container_width=True)
    else:
        st.info("Cần nhiều dữ liệu sản phẩm hơn để phân tích Pareto.")

with c_scatter:
    st.markdown("#### Tương Quan: Giá bán & Lượng bán (Price Elasticity)")
    if not products.empty and len(products) > 3:
        fig_scatter = px.scatter(
            products, x="avg_price", y="total_qty", size="total_revenue", color="display_name",
            hover_name="ten_san_pham", size_max=40,
            labels={"avg_price": "Giá bán trung bình (đ)", "total_qty": "Số lượng bán ra"}
        )
        # Add trendline to show general elasticity (usually negative)
        try:
            import statsmodels.api as sm
            fig_scatter = px.scatter(
                products, x="avg_price", y="total_qty", size="total_revenue", color="display_name",
                hover_name="ten_san_pham", size_max=40, trendline="ols",
                labels={"avg_price": "Giá bán trung bình (đ)", "total_qty": "Số lượng bán ra"}
            )
            # hide trendline traces from legend so it's not messy
            for trace in fig_scatter.data:
                if trace.mode == "lines":
                    trace.line.color = "#FF4757"
                    trace.line.dash = "dash"
                    trace.showlegend = False
        except ImportError:
            pass # fallback if statsmodels not installed
            
        apply_layout(fig_scatter, height=380, margin=dict(l=40, r=20, t=10, b=40))
        fig_scatter.update_layout(showlegend=False)
        st.plotly_chart(fig_scatter, use_container_width=True)
    else:
        st.info("Cần nhiều dữ liệu sản phẩm hơn để phân tích Độ nhạy giá.")

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
