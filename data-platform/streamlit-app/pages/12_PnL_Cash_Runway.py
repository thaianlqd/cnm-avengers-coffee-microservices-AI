import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go

from utils import query_df, fmt_vnd
from components import render_sidebar
from styles import inject_styles, init_plotly_template, apply_layout

# ─── Page Config ──────────────────────────────────────────────────────────────
st.set_page_config(page_title="Tài Chính & Lợi Nhuận", page_icon="📈", layout="wide")
inject_styles()
init_plotly_template()
render_sidebar()

# ── Dark Header ──
# ── Sidebar-level Filters ──
fcol1, fcol2, fcol3 = st.columns([2, 2, 4])
with fcol1:
    pnl_region = st.selectbox("Vùng miền", ["Tất cả", "Bắc", "Trung", "Nam"], key="pnl_region")
with fcol2:
    pnl_type   = st.selectbox("Loại hình", ["Tất cả", "MAIN_STORE", "KIOSK_NOI_BO"], key="pnl_type")
with fcol3:
    pnl_months = st.slider("Số tháng phân tích gần nhất", min_value=1, max_value=12, value=3, key="pnl_months")

st.markdown("<h2 style='margin-bottom:24px; font-weight:800; color:#C0C0D8;'>Báo Cáo Tài Chính & Lợi Nhuận</h2>", unsafe_allow_html=True)

# ── Query: Dữ liệu P&L từ view hoặc bảng thực ──
@st.cache_data(ttl=86400, show_spinner=False)
def get_pnl_data(months: int):
    return query_df(f"""
        SELECT
            o.co_so_ma,
            COALESCE(d.ten_store, o.co_so_ma)         AS ten_store,
            COALESCE(d.loai_hinh_so_huu, 'MAIN_STORE') AS loai_hinh,
            COALESCE(d.vung_mien, 'N/A')               AS vung_mien,
            date_trunc('month', o.ngay_tao)::date      AS ky,
            SUM(o.tong_tien)                            AS net_revenue,
            COALESCE(SUM(o.so_tien_giam), 0)            AS voucher_amount,
            COUNT(*)                                    AS so_don,
            COUNT(*) FILTER (WHERE o.trang_thai_don_hang = 'DA_HUY') AS don_huy
        FROM orders.don_hang o
        LEFT JOIN (
            SELECT 
                ma_chi_nhanh AS co_so_ma, 
                ten_chi_nhanh AS ten_store, 
                CASE WHEN ma_chi_nhanh LIKE '%-K%' THEN 'KIOSK_NHUONG_QUYEN' ELSE 'MAIN_STORE' END AS loai_hinh_so_huu, 
                thanh_pho AS vung_mien
            FROM identity.chi_nhanh
        ) d ON d.co_so_ma = o.co_so_ma
        WHERE o.trang_thai_don_hang = 'HOAN_THANH'
          AND o.ngay_tao >= NOW() - INTERVAL '{months} months'
        GROUP BY o.co_so_ma, d.ten_store, d.loai_hinh_so_huu, d.vung_mien,
                 date_trunc('month', o.ngay_tao)
        ORDER BY ky DESC, net_revenue DESC
    """)

@st.cache_data(ttl=86400, show_spinner=False)
def get_cost_data(months: int):
    return query_df(f"""
        SELECT
            co_so_ma,
            ky_ke_toan::date        AS ky,
            chi_phi_cogs            AS cogs,
            chi_phi_mat_bang        AS mat_bang,
            chi_phi_luong           AS luong,
            chi_phi_marketing       AS marketing,
            COALESCE(chi_phi_logistics, 0) AS logistics
        FROM finance.chi_phi_van_hanh
        WHERE ky_ke_toan >= NOW() - INTERVAL '{months} months'
        ORDER BY ky_ke_toan DESC
    """)

pnl_df   = get_pnl_data(pnl_months)
costs_df = get_cost_data(pnl_months)

# ── Kiểm tra dữ liệu ──
if pnl_df.empty:
    st.markdown("""
    <div class="alert-banner">
      <b>⚠️ Chưa có dữ liệu P&L.</b> Hệ thống chưa tìm thấy dữ liệu từ bảng
      <code>orders.don_hang</code> hoặc <code>finance.chi_phi_van_hanh</code>.
      Hãy chạy script seed dữ liệu hoặc kết nối Supabase thật.
    </div>
    """, unsafe_allow_html=True)
    st.stop()

# ── Merge P&L + Costs ──
if not costs_df.empty:
    pnl_df["ky"] = pd.to_datetime(pnl_df["ky"]).dt.to_period("M").dt.to_timestamp()
    costs_df["ky"] = pd.to_datetime(costs_df["ky"]).dt.to_period("M").dt.to_timestamp()
    merged = pnl_df.merge(costs_df, on=["co_so_ma","ky"], how="left").fillna(0)
else:
    merged = pnl_df.copy()
    for c in ["cogs","mat_bang","luong","marketing","logistics"]:
        if c not in merged.columns:
            merged[c] = 0
# Đảm bảo voucher_amount tồn tại
if "voucher_amount" not in merged.columns:
    merged["voucher_amount"] = 0

# Tính P&L
merged["total_cost"]   = merged["cogs"] + merged["mat_bang"] + merged["luong"] + merged["marketing"] + merged["logistics"]
merged["net_profit"]   = merged["net_revenue"] - merged["total_cost"]
merged["margin_pct"]   = ((merged["net_profit"] / merged["net_revenue"].replace(0, np.nan)) * 100).round(1)
merged["voucher_pct"]  = ((merged["voucher_amount"] / merged["net_revenue"].replace(0, np.nan)) * 100).round(1)

# Apply filters
if pnl_region != "Tất cả":
    merged = merged[merged["vung_mien"] == pnl_region]
if pnl_type != "Tất cả":
    merged = merged[merged["loai_hinh"] == pnl_type]

if merged.empty:
    st.warning("Không có dữ liệu với bộ lọc đã chọn.")
else:
    # ── KPI Row: Tháng gần nhất ──
    latest_ky = merged["ky"].max()
    latest    = merged[merged["ky"] == latest_ky]

    k1, k2, k3, k4, k5 = st.columns(5)
    total_rev  = latest["net_revenue"].sum()
    total_prof = latest["net_profit"].sum()
    avg_margin = (total_prof / total_rev * 100) if total_rev > 0 else 0
    stores_at_risk = (latest["net_profit"] < 0).sum()
    avg_voucher = latest["voucher_pct"].mean()

    k1.metric("💰 Doanh Thu (tháng này)", fmt_vnd(total_rev))
    k2.metric("📊 Lợi Nhuận Ròng", fmt_vnd(total_prof),
              delta=f"Biên {avg_margin:.1f}%",
              delta_color="normal" if avg_margin >= 0 else "inverse")
    k3.metric("⚠️ Cơ sở thua lỗ", f"{stores_at_risk} store",
              delta="cần chú ý" if stores_at_risk > 0 else "Tất cả ổn",
              delta_color="inverse" if stores_at_risk > 0 else "normal")
    k4.metric("🎟️ Voucher Burn Rate", f"{avg_voucher:.1f}%",
              help="Trên 30% là báo động đỏ")
    k5.metric("🏪 Số cơ sở theo dõi", len(latest))

    st.markdown("<hr style='border-color:#1E1E3A;margin:20px 0;'>", unsafe_allow_html=True)

    # ── Layout chính: 2 cột ──
    col_left, col_right = st.columns([3, 2])

    with col_left:
        # ── Waterfall Chart: Tháng gần nhất, top store tệ nhất ──
        worst_store = latest.sort_values("net_profit").iloc[0]
        st.markdown(f"""
        <div class="dk-section-header">Waterfall P&L — {worst_store.get('ten_store', worst_store['co_so_ma'])}</div>
        <div class="dk-section-sub">Cơ sở có lợi nhuận thấp nhất trong kỳ. Click vào bảng bên dưới để xem store khác.</div>
        """, unsafe_allow_html=True)

        cats = ["Doanh Thu", "- COGS", "- Mặt Bằng", "- Lương", "- Marketing", "- Logistics", "Lợi Nhuận"]
        vals_raw = [
            worst_store["net_revenue"],
            -worst_store.get("cogs", 0),
            -worst_store.get("mat_bang", 0),
            -worst_store.get("luong", 0),
            -worst_store.get("marketing", 0),
            -worst_store.get("logistics", 0),
            worst_store["net_profit"],
        ]
        # Waterfall measure
        measures = ["absolute","relative","relative","relative","relative","relative","total"]
        bar_colors = ["#1E90FF"] + ["#EF4444"]*5 + ["#10B981" if worst_store["net_profit"] >= 0 else "#EF4444"]

        fig_wf = go.Figure(go.Waterfall(
            name="P&L",
            orientation="v",
            measure=measures,
            x=cats,
            y=vals_raw,
            texttemplate="%{y:,.0f}đ",
            textposition="outside",
            connector={"line": {"color": "#2A2A4A", "dash": "dot"}},
            increasing={"marker": {"color": "#10B981"}},
            decreasing={"marker": {"color": "#EF4444"}},
            totals={"marker": {"color": "#3B82F6"}},
        ))
        fig_wf.update_layout(
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(26,26,46,0.5)",
            font=dict(color="#C0C0D8", family="Inter, sans-serif", size=11),
            margin=dict(l=40, r=20, t=30, b=40),
            height=380,
            showlegend=False,
            xaxis=dict(gridcolor="#1E1E3A", tickfont=dict(color="#7C7CA0")),
            yaxis=dict(gridcolor="#1E1E3A", tickfont=dict(color="#7C7CA0"), tickformat=",.0f"),
        )
        st.plotly_chart(fig_wf, use_container_width=True)

        # ── Cash Position Trend (90 ngày) ──
        st.markdown('<div class="dk-section-header" style="font-size:16px;margin-top:8px;">📈 Xu Hướng Lợi Nhuận Ròng — Tất Cả Cơ Sở</div>', unsafe_allow_html=True)

        agg_by_ky = merged.groupby("ky").agg(
            net_revenue=("net_revenue","sum"),
            net_profit=("net_profit","sum"),
            total_cost=("total_cost","sum"),
        ).reset_index().sort_values("ky")

        fig_trend = go.Figure()
        fig_trend.add_trace(go.Scatter(
            x=agg_by_ky["ky"], y=agg_by_ky["net_revenue"],
            name="Doanh thu", mode="lines+markers",
            line=dict(color="#3B82F6", width=2.5), marker=dict(size=7),
        ))
        fig_trend.add_trace(go.Scatter(
            x=agg_by_ky["ky"], y=agg_by_ky["net_profit"],
            name="Lợi nhuận ròng", mode="lines+markers",
            line=dict(color="#10B981", width=2.5), marker=dict(size=7),
            fill="tozeroy",
            fillcolor="rgba(16,185,129,0.07)",
        ))
        # Tô nền đỏ vùng lợi nhuận âm
        for _, row_t in agg_by_ky[agg_by_ky["net_profit"] < 0].iterrows():
            fig_trend.add_vrect(
                x0=row_t["ky"], x1=row_t["ky"],
                fillcolor="rgba(239,68,68,0.08)", line_width=0,
                annotation_text="⚠️", annotation_position="top left"
            )
        fig_trend.update_layout(
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(26,26,46,0.4)",
            font=dict(color="#C0C0D8", family="Inter, sans-serif", size=11),
            margin=dict(l=40, r=20, t=20, b=40),
            height=280,
            legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1,
                        font=dict(color="#A0A0C0", size=11), bgcolor="rgba(0,0,0,0)"),
            xaxis=dict(gridcolor="#1E1E3A", tickfont=dict(color="#7C7CA0")),
            yaxis=dict(gridcolor="#1E1E3A", tickfont=dict(color="#7C7CA0"), tickformat=",.0f"),
        )
        st.plotly_chart(fig_trend, use_container_width=True)

    with col_right:
        st.markdown('<div class="dk-section-header" style="font-size:16px;">🚦 Top Cơ Sở Cần Chú Ý</div>', unsafe_allow_html=True)

        # Top 8 store có margin thấp nhất
        top_risk = latest.sort_values("net_profit").head(8)
        for _, r in top_risk.iterrows():
            margin = r.get("margin_pct", 0)
            profit = r.get("net_profit", 0)
            color  = "#EF4444" if profit < 0 else ("#F59E0B" if margin < 15 else "#10B981")
            badge  = "badge-red" if profit < 0 else ("badge-yellow" if margin < 15 else "badge-green")
            pct_w  = max(0, min(100, abs(margin)))
            st.markdown(f"""
            <div class="pb-wrap">
              <div class="pb-label">
                <span>{r.get('ten_store', r['co_so_ma'])}</span>
                <span class="{badge}">{margin:.1f}%</span>
              </div>
              <div class="pb-track">
                <div class="pb-fill" style="width:{pct_w}%;background:{color};"></div>
              </div>
              <div style="font-size:11px;color:#7C7CA0;margin-top:4px;">
                LN: {fmt_vnd(profit)} &nbsp;|&nbsp; DT: {fmt_vnd(r.get('net_revenue',0))}
              </div>
            </div>
            """, unsafe_allow_html=True)

        # ── Box Gợi ý hành động ──
        st.markdown("<br>", unsafe_allow_html=True)
        critical_stores = latest[latest["net_profit"] < 0]
        if not critical_stores.empty:
            for _, r in critical_stores.iterrows():
                reasons = []
                if r.get("mat_bang", 0) > r.get("net_revenue", 1) * 0.3:
                    reasons.append(f"Chi phí mặt bằng vượt 30% DT ({fmt_vnd(r['mat_bang'])})")
                if r.get("voucher_pct", 0) > 25:
                    reasons.append(f"Voucher Burn Rate cao ({r['voucher_pct']:.1f}%)")
                if r.get("cogs", 0) > r.get("net_revenue", 1) * 0.45:
                    reasons.append(f"COGS vượt 45% DT ({fmt_vnd(r['cogs'])})")
                if reasons:
                    st.markdown(f"""
                    <div class="alert-banner">
                      <b>🔴 {r.get('ten_store', r['co_so_ma'])}</b><br>
                      {'<br>'.join(f'• {r}' for r in reasons)}
                    </div>
                    """, unsafe_allow_html=True)

    # ── Bảng chi tiết ──
    st.markdown("<hr style='border-color:#1E1E3A;margin:20px 0;'>", unsafe_allow_html=True)
    st.markdown('<div class="dk-section-header" style="font-size:16px;">📋 Bảng Chi Tiết P&L Tất Cả Cơ Sở</div>', unsafe_allow_html=True)

    display_pnl = latest.copy()
    display_pnl["net_revenue"]  = display_pnl["net_revenue"].apply(fmt_vnd)
    display_pnl["net_profit"]   = display_pnl["net_profit"].apply(fmt_vnd)
    display_pnl["total_cost"]   = display_pnl["total_cost"].apply(fmt_vnd)
    display_pnl["margin_pct"]   = display_pnl["margin_pct"].apply(lambda x: f"{x:.1f}%")
    display_pnl["voucher_pct"]  = display_pnl["voucher_pct"].apply(lambda x: f"{x:.1f}%")
    display_pnl = display_pnl.rename(columns={
        "ten_store":"Cơ Sở", "loai_hinh":"Loại Hình", "vung_mien":"Vùng Miền",
        "net_revenue":"Doanh Thu", "net_profit":"Lợi Nhuận Ròng",
        "total_cost":"Tổng Chi Phí", "margin_pct":"Biên LN",
        "voucher_pct":"Voucher Rate", "so_don":"Số Đơn",
    })
    cols_show = ["Cơ Sở","Loại Hình","Vùng Miền","Doanh Thu","Tổng Chi Phí","Lợi Nhuận Ròng","Biên LN","Voucher Rate","Số Đơn"]
    cols_show = [c for c in cols_show if c in display_pnl.columns]
    st.dataframe(display_pnl[cols_show], use_container_width=True, hide_index=True, height=320)
