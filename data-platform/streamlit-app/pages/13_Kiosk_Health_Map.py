import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots

from utils import query_df, fmt_vnd
from components import render_sidebar
from styles import inject_styles, init_plotly_template, apply_layout

# ─── Page Config ──────────────────────────────────────────────────────────────
st.set_page_config(page_title="Bản Đồ Cửa Hàng", page_icon="🗺️", layout="wide")
inject_styles()
init_plotly_template()
render_sidebar()

# ── Dark Header ──
st.markdown("""
<div style="padding:20px 0 8px;">
  <h2 style="margin:0;font-size:26px;font-weight:900;color:#FFFFFF;letter-spacing:-0.5px;">
    🗺️ Sức Khoẻ Đối Tác Nhượng Quyền — Kiosk Health Map
  </h2>
  <p style="color:#7C7CA0;font-size:14px;margin-top:6px;">
    Health Score 0-100 tổng hợp từ 4 chỉ số: Biên LN · Tăng trưởng · Voucher Burn Rate · Tỷ lệ hoàn thành đơn.
    <span class="neon-red">🔴 &lt;40 Nguy hiểm</span> &nbsp;
    <span class="neon-yellow">🟡 40-70 Theo dõi</span> &nbsp;
    <span class="neon-green">🟢 &gt;70 Khoẻ mạnh</span>
  </p>
</div>
""", unsafe_allow_html=True)

# ── Sidebar Filters ──
hf1, hf2, hf3 = st.columns([2, 2, 4])
with hf1:
    hm_region = st.selectbox("Vùng miền", ["Tất cả","Bắc","Trung","Nam"], key="hm_region")
with hf2:
    hm_status = st.selectbox("Trạng thái", ["Tất cả","🔴 Nguy hiểm","🟡 Theo dõi","🟢 Khoẻ mạnh"], key="hm_status")
with hf3:
    hm_months = st.slider("Số tháng tính Health Score", 1, 6, 3, key="hm_months")

st.markdown("<hr style='border-color:#1E1E3A;margin:12px 0 20px;'>", unsafe_allow_html=True)

# ── Query Kiosk NQ ──
@st.cache_data(ttl=86400, show_spinner=False)
def get_kiosk_health(months: int):
    return query_df(f"""
        WITH base AS (
            SELECT
                o.co_so_ma,
                COALESCE(d.ten_store, o.co_so_ma)   AS ten_store,
                COALESCE(d.vung_mien, 'N/A')         AS vung_mien,
                COALESCE(d.tier_do_thi, 'Tier 2')    AS tier,
                COALESCE(d.latitude,  10.8)  AS lat,
                COALESCE(d.longitude, 106.7) AS lng,
                date_trunc('month', o.ngay_tao)      AS ky,
                SUM(o.tong_tien)                     AS revenue,
                COALESCE(SUM(o.so_tien_giam), 0)     AS voucher,
                COUNT(*)                             AS total_orders,
                COUNT(*) FILTER (WHERE o.trang_thai_don_hang = 'HOAN_THANH') AS completed,
                COUNT(*) FILTER (WHERE o.trang_thai_don_hang = 'DA_HUY')     AS cancelled
            FROM orders.don_hang o
            LEFT JOIN (
                SELECT 
                    ma_chi_nhanh AS co_so_ma, 
                    ten_chi_nhanh AS ten_store, 
                    'KIOSK_NHUONG_QUYEN' AS loai_hinh_so_huu, 
                    thanh_pho AS vung_mien, 
                    'Tier 2' AS tier_do_thi,
                    NULL::float AS latitude, 
                    NULL::float AS longitude
                FROM identity.chi_nhanh
                WHERE ma_chi_nhanh LIKE '%-K%'
            ) d ON d.co_so_ma = o.co_so_ma
            WHERE o.ngay_tao >= NOW() - INTERVAL '{months} months'
            GROUP BY o.co_so_ma, d.ten_store, d.loai_hinh_so_huu, d.vung_mien,
                     d.tier_do_thi, d.latitude, d.longitude,
                     date_trunc('month', o.ngay_tao)
        ),
        agg AS (
            SELECT
                co_so_ma, ten_store, vung_mien, tier,
                AVG(lat) AS lat, AVG(lng) AS lng,
                SUM(revenue)       AS total_revenue,
                SUM(voucher)       AS total_voucher,
                SUM(total_orders)  AS total_orders,
                SUM(completed)     AS completed_orders,
                -- Voucher Burn Rate
                CASE WHEN SUM(revenue) + SUM(voucher) > 0
                     THEN SUM(voucher) / (SUM(revenue) + SUM(voucher)) * 100
                     ELSE 0 END AS voucher_burn_rate,
                -- Completion Rate
                CASE WHEN SUM(total_orders) > 0
                     THEN SUM(completed)::float / SUM(total_orders) * 100
                     ELSE 0 END AS completion_rate,
                -- Estimated margin (không có bảng chi phí NQ riêng → ước tính COGS ~42%)
                CASE WHEN SUM(revenue) > 0
                     THEN (SUM(revenue) - SUM(revenue) * 0.42 - SUM(voucher)) / SUM(revenue) * 100
                     ELSE 0 END AS est_margin_pct
            FROM base
            GROUP BY co_so_ma, ten_store, vung_mien, tier, lat, lng
        )
        SELECT *,
            -- Health Score = 35% margin + 20% (1-voucher) + 20% completion + 25% (stable revenue proxy: 75 pts base)
            GREATEST(0, LEAST(100,
                COALESCE(est_margin_pct * 0.35, 0)
                + COALESCE((100 - voucher_burn_rate) * 0.20, 0)
                + COALESCE(completion_rate * 0.20, 0)
                + 25  -- Revenue stability base (sẽ tính growth ở version sau khi có đủ kỳ)
            )) AS health_score
        FROM agg
        ORDER BY health_score ASC
    """)

kiosk_df = get_kiosk_health(hm_months)

# No demo fallback. If data is empty, it will be handled below.
if kiosk_df.empty:
    st.warning("⚠️ Chưa có dữ liệu Kiosk NQ. Hãy chạy script seed dữ liệu hoặc kết nối DB thật.")
    st.stop()

# Apply filters
if hm_region != "Tất cả":
    kiosk_df = kiosk_df[kiosk_df["vung_mien"] == hm_region]
if hm_status == "🔴 Nguy hiểm":
    kiosk_df = kiosk_df[kiosk_df["health_score"] < 40]
elif hm_status == "🟡 Theo dõi":
    kiosk_df = kiosk_df[(kiosk_df["health_score"] >= 40) & (kiosk_df["health_score"] < 70)]
elif hm_status == "🟢 Khoẻ mạnh":
    kiosk_df = kiosk_df[kiosk_df["health_score"] >= 70]

kiosk_df = kiosk_df.reset_index(drop=True)

if kiosk_df.empty:
    st.warning("Không có kiosk nào với bộ lọc đã chọn.")
else:
    # ── Health Score helper ──
    def hs_color(score):
        return "#FF4757" if score < 40 else ("#FFA502" if score < 70 else "#2ED573")
    def hs_badge(score):
        return ("badge-red","🔴 Nguy hiểm") if score < 40 else (("badge-yellow","🟡 Theo dõi") if score < 70 else ("badge-green","🟢 Khoẻ mạnh"))

    # ── KPI Row ──
    total_k = len(kiosk_df)
    red_k   = (kiosk_df["health_score"] < 40).sum()
    yel_k   = ((kiosk_df["health_score"] >= 40) & (kiosk_df["health_score"] < 70)).sum()
    grn_k   = (kiosk_df["health_score"] >= 70).sum()
    avg_hs  = kiosk_df["health_score"].mean()
    total_nq_rev = kiosk_df["total_revenue"].sum()
    royalty_revenue = total_nq_rev * 0.07

    k1,k2,k3,k4,k5 = st.columns(5)
    k1.metric("🏪 Tổng Kiosk NQ", total_k)
    k2.metric("🔴 Nguy Hiểm", red_k, delta="Cần can thiệp" if red_k>0 else "Ổn", delta_color="inverse" if red_k>0 else "normal")
    k3.metric("🟡 Theo Dõi", yel_k)
    k4.metric("🟢 Khoẻ Mạnh", grn_k)
    k5.metric("💎 Phí NQ Est. (7%)", fmt_vnd(royalty_revenue), help="Ước tính phí NQ = 7% tổng doanh thu")

    st.markdown("<hr style='border-color:#1E1E3A;margin:16px 0 20px;'>", unsafe_allow_html=True)

    # ── 3 CỘT CHÍNH: Radar | Bản đồ + Score | Risk Bars ──
    col_radar, col_map, col_risk = st.columns([3, 4, 3])

    # ── Cột TRÁI: Radar Chart ──
    with col_radar:
        # Kiosk đang chọn (mặc định kiosk tệ nhất)
        if "selected_kiosk_idx" not in st.session_state:
            st.session_state["selected_kiosk_idx"] = 0
        sel_idx = min(st.session_state["selected_kiosk_idx"], len(kiosk_df)-1)
        sel     = kiosk_df.iloc[sel_idx]

        st.markdown(f"""
        <div class="dk-card" style="margin-bottom:12px;">
          <div class="dk-card-title">Kiosk đang xem</div>
          <div style="font-size:18px;font-weight:800;color:#FFFFFF;">{sel.get('ten_store', sel['co_so_ma'])}</div>
          <div style="margin-top:6px;">
            <span class="{hs_badge(sel['health_score'])[0]}">{hs_badge(sel['health_score'])[1]}</span>
            <span style="color:#7C7CA0;font-size:12px;margin-left:8px;">{sel['vung_mien']} · {sel.get('tier','')}</span>
          </div>
        </div>
        """, unsafe_allow_html=True)

        # Radar values (0-100 normalized)
        margin_norm = max(0, min(100, (sel["est_margin_pct"] + 10) * 2.5))
        growth_norm = 60.0  # Placeholder — cần dữ liệu nhiều kỳ
        voucher_inv = max(0, 100 - sel["voucher_burn_rate"] * 2)
        completion  = sel["completion_rate"]
        stability   = max(0, min(100, sel["total_revenue"] / 1_500_000))  # normalized

        radar_cats  = ["Biên LN", "Tăng Trưởng", "Voucher OK", "Tỷ lệ HT Đơn", "Doanh Thu"]
        radar_vals  = [margin_norm, growth_norm, voucher_inv, completion, stability]
        radar_vals_closed = radar_vals + [radar_vals[0]]
        radar_cats_closed = radar_cats + [radar_cats[0]]

        fig_radar = go.Figure(go.Scatterpolar(
            r=radar_vals_closed,
            theta=radar_cats_closed,
            fill="toself",
            fillcolor=f"rgba({','.join(str(int(c,16)) for c in [hs_color(sel['health_score'])[1:3],hs_color(sel['health_score'])[3:5],hs_color(sel['health_score'])[5:7]])},0.18)",
            line=dict(color=hs_color(sel["health_score"]), width=2.5),
            name="Health",
            marker=dict(size=6, color=hs_color(sel["health_score"])),
        ))
        fig_radar.update_layout(
            polar=dict(
                bgcolor="rgba(26,26,46,0.7)",
                radialaxis=dict(visible=True, range=[0,100], tickfont=dict(color="#7C7CA0",size=9),
                               gridcolor="#2A2A4A", linecolor="#2A2A4A"),
                angularaxis=dict(tickfont=dict(color="#C0C0D8",size=11), linecolor="#2A2A4A", gridcolor="#2A2A4A"),
            ),
            paper_bgcolor="rgba(0,0,0,0)",
            font=dict(color="#C0C0D8", family="Inter, sans-serif"),
            margin=dict(l=20,r=20,t=20,b=20),
            height=300,
            showlegend=False,
        )
        st.plotly_chart(fig_radar, use_container_width=True)

        # Health Score big number
        st.markdown(f"""
        <div class="dk-card" style="text-align:center;padding:16px;">
          <div class="dk-card-title">HEALTH SCORE</div>
          <div class="dk-metric" style="color:{hs_color(sel['health_score'])};">{sel['health_score']:.0f}</div>
          <div class="dk-sub">/ 100 điểm</div>
          <div style="margin-top:10px;font-size:12px;color:#A0A0C0;">
            Voucher Burn: <b style="color:{('#FF4757' if sel['voucher_burn_rate']>30 else '#2ED573')};">{sel['voucher_burn_rate']:.1f}%</b> &nbsp;|&nbsp;
            Biên LN: <b style="color:{('#FF4757' if sel['est_margin_pct']<10 else '#2ED573')};">{sel['est_margin_pct']:.1f}%</b>
          </div>
        </div>
        """, unsafe_allow_html=True)

    # ── Cột GIỮA: Scatter Map Việt Nam ──
    with col_map:
        st.markdown("<h2 style='margin-bottom:24px; font-weight:800; color:#C0C0D8;'>Bản Đồ Cửa Hàng</h2>", unsafe_allow_html=True)

        if "lat" in kiosk_df.columns and kiosk_df["lat"].notna().any():
            map_df = kiosk_df.copy()
            map_df["color"]  = map_df["health_score"].apply(hs_color)
            map_df["status"] = map_df["health_score"].apply(lambda x: hs_badge(x)[1])
            map_df["hover"]  = map_df.apply(
                lambda r: f"{r.get('ten_store',r['co_so_ma'])}<br>HS: {r['health_score']:.0f} | {r['status']}", axis=1)

            fig_map = go.Figure(go.Scattermapbox(
                lat=map_df["lat"],
                lon=map_df["lng"],
                text=map_df["hover"],
                mode="markers",
                marker=dict(
                    size=map_df["total_revenue"].apply(lambda x: max(8, min(24, x/5_000_000))),
                    color=map_df["health_score"],
                    colorscale=[[0,"#FF4757"],[0.4,"#FFA502"],[0.7,"#FFD700"],[1,"#2ED573"]],
                    cmin=0, cmax=100,
                    colorbar=dict(title="Health Score", tickfont=dict(color="#A0A0C0"), title_font=dict(color="#A0A0C0"),
                                  bgcolor="rgba(26,26,46,0.7)", bordercolor="#2A2A4A"),
                    opacity=0.9,
                ),
                hoverinfo="text",
            ))
            fig_map.update_layout(
                mapbox=dict(
                    style="carto-darkmatter",
                    center=dict(lat=16.0, lon=107.8),
                    zoom=4.6
                ),
                paper_bgcolor="rgba(0,0,0,0)",
                plot_bgcolor="rgba(0,0,0,0)",
                font=dict(color="#C0C0D8", family="Inter, sans-serif"),
                margin=dict(l=0,r=0,t=0,b=0),
                height=380,
            )
            st.plotly_chart(fig_map, use_container_width=True)
        else:
            st.info("Bản đồ yêu cầu cột latitude/longitude trong dim_store.")

        # Scorecard summary
        st.markdown(f"""
        <div style="display:flex;gap:10px;margin-top:8px;">
          <div class="dk-card" style="flex:1;text-align:center;padding:14px;">
            <div class="dk-card-title">AVG HEALTH</div>
            <div class="dk-metric" style="color:{hs_color(avg_hs)};font-size:28px;">{avg_hs:.0f}</div>
          </div>
          <div class="dk-card" style="flex:1;text-align:center;padding:14px;">
            <div class="dk-card-title">TỔNG DT NQ</div>
            <div class="dk-metric" style="color:#1E90FF;font-size:20px;">{fmt_vnd(total_nq_rev)}</div>
          </div>
          <div class="dk-card" style="flex:1;text-align:center;padding:14px;">
            <div class="dk-card-title">PHÍ NQ 7%</div>
            <div class="dk-metric" style="color:#2ED573;font-size:20px;">{fmt_vnd(royalty_revenue)}</div>
          </div>
        </div>
        """, unsafe_allow_html=True)

    # ── Cột PHẢI: Risk by Category (horizontal bars) ──
    with col_risk:
        st.markdown('<div class="dk-section-header" style="font-size:16px;margin-top:0;">📊 Risk by Tier/Vùng</div>', unsafe_allow_html=True)

        risk_by_vung = kiosk_df.groupby("vung_mien")["health_score"].mean().sort_values().reset_index()
        max_hs = risk_by_vung["health_score"].max() or 100
        for _, rv in risk_by_vung.iterrows():
            hs  = rv["health_score"]
            pct = hs / max_hs * 100
            st.markdown(f"""
            <div class="pb-wrap">
              <div class="pb-label">
                <span>📍 {rv['vung_mien']}</span>
                <span class="{hs_badge(hs)[0]}">{hs:.0f} pts</span>
              </div>
              <div class="pb-track">
                <div class="pb-fill" style="width:{pct:.0f}%;background:{hs_color(hs)};"></div>
              </div>
            </div>
            """, unsafe_allow_html=True)

        st.markdown("<br>", unsafe_allow_html=True)
        st.markdown('<div style="color:#7C7CA0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Risk by Tier</div>', unsafe_allow_html=True)

        risk_by_tier = kiosk_df.groupby("tier")["health_score"].mean().sort_values().reset_index()
        for _, rt in risk_by_tier.iterrows():
            hs  = rt["health_score"]
            cnt = len(kiosk_df[kiosk_df["tier"] == rt["tier"]])
            pct = hs / (risk_by_tier["health_score"].max() or 100) * 100
            st.markdown(f"""
            <div class="pb-wrap">
              <div class="pb-label">
                <span>🏷️ {rt['tier']}</span>
                <span style="color:#7C7CA0;font-size:11px;">{cnt} kiosk</span>
              </div>
              <div class="pb-track">
                <div class="pb-fill" style="width:{pct:.0f}%;background:{hs_color(hs)};"></div>
              </div>
              <div style="font-size:11px;color:{hs_color(hs)};margin-top:3px;">{hs:.0f} / 100</div>
            </div>
            """, unsafe_allow_html=True)

        # "Điểm mù kế toán" callout
        st.markdown("""
        <div class="alert-banner" style="border-left-color:#FFA502;background:rgba(255,165,2,0.08);">
          <b style="color:#FFA502;">💡 Điểm Mù Kế Toán:</b><br>
          HQ nhìn: <span class="neon-green">DT × 7% = Phí NQ ↗</span><br>
          NQ thực: <span class="neon-red">DT − COGS − Voucher ↘</span><br>
          <span style="font-size:11px;color:#A0A0C0;">Hai đường đi ngược chiều = Kiosk đang "chết dần".</span>
        </div>
        """, unsafe_allow_html=True)

    # ── Bảng Chi Tiết + Click để xem Kiosk ──
    st.markdown("<hr style='border-color:#1E1E3A;margin:20px 0;'>", unsafe_allow_html=True)
    st.markdown('<div class="dk-section-header" style="font-size:16px;">📋 Danh Sách Chi Tiết — Chọn Kiosk để xem Radar</div>', unsafe_allow_html=True)

    col_selector, col_dual = st.columns([3, 4])

    with col_selector:
        # Bảng chọn kiosk
        display_kiosk = kiosk_df[["ten_store","vung_mien","tier","health_score","est_margin_pct","voucher_burn_rate","completion_rate","total_revenue"]].copy()
        display_kiosk["health_score"]     = display_kiosk["health_score"].apply(lambda x: f"{x:.0f}")
        display_kiosk["est_margin_pct"]   = display_kiosk["est_margin_pct"].apply(lambda x: f"{x:.1f}%")
        display_kiosk["voucher_burn_rate"] = display_kiosk["voucher_burn_rate"].apply(lambda x: f"{x:.1f}%")
        display_kiosk["completion_rate"]  = display_kiosk["completion_rate"].apply(lambda x: f"{x:.1f}%")
        display_kiosk["total_revenue"]    = display_kiosk["total_revenue"].apply(fmt_vnd)
        display_kiosk = display_kiosk.rename(columns={
            "ten_store":"Kiosk", "vung_mien":"Vùng", "tier":"Tier",
            "health_score":"HS", "est_margin_pct":"Biên LN",
            "voucher_burn_rate":"Voucher %", "completion_rate":"HT Đơn %",
            "total_revenue":"Doanh Thu",
        })
        st.dataframe(display_kiosk, use_container_width=True, hide_index=True, height=320)

        # Chọn kiosk để xem chi tiết
        kiosk_names = kiosk_df["ten_store"].tolist()
        sel_name = st.selectbox("Chọn Kiosk để xem biểu đồ chi tiết:", kiosk_names, key="sel_kiosk_name")
        sel_i = kiosk_names.index(sel_name) if sel_name in kiosk_names else 0
        st.session_state["selected_kiosk_idx"] = sel_i

    with col_dual:
        # ── Dual-axis: Phí NQ (HQ nhìn) vs LN thực (Vận hành nhìn) ──
        st.markdown('<div class="dk-section-header" style="font-size:14px;margin-top:0;">"Điểm Mù Kế Toán" — Biểu Đồ Hai Trục</div>', unsafe_allow_html=True)
        sel_kiosk = kiosk_df.iloc[sel_i]

        # Placeholder for real dual-axis chart
        st.info("Biểu đồ lịch sử 6 tháng đang được cập nhật dữ liệu thật.")
        # ── Quadrant: Kiosk health landscape ──
        st.markdown('<div class="dk-section-header" style="font-size:14px;margin-top:0;">🎯 Quadrant — Phân Loại Kiosk</div>', unsafe_allow_html=True)

        fig_quad = go.Figure()
        for _, kr in kiosk_df.iterrows():
            color_k = hs_color(kr["health_score"])
            fig_quad.add_trace(go.Scatter(
                x=[kr["voucher_burn_rate"]],
                y=[kr["est_margin_pct"]],
                mode="markers+text",
                marker=dict(size=max(10, kr["total_revenue"]/5_000_000), color=color_k, opacity=0.8,
                            line=dict(width=1.5,color="rgba(255,255,255,0.3)")),
                text=[kr.get("ten_store","")[:12]],
                textposition="top center",
                textfont=dict(size=9, color="#C0C0D8"),
                name=kr.get("ten_store",""),
                showlegend=False,
                hovertemplate=(f"<b>{kr.get('ten_store','')}</b><br>"
                               f"Voucher: {kr['voucher_burn_rate']:.1f}%<br>"
                               f"Margin: {kr['est_margin_pct']:.1f}%<br>"
                               f"HS: {kr['health_score']:.0f}<extra></extra>"),
            ))
        # Quadrant lines
        fig_quad.add_hline(y=15, line_dash="dot", line_color="#2A2A4A", annotation_text="Biên LN 15%")
        fig_quad.add_vline(x=25, line_dash="dot", line_color="#2A2A4A", annotation_text="Voucher 25%")
        # Quadrant labels
        for qx,qy,qtxt,qcolor in [(12,30,"⭐ Ngôi sao","#2ED573"),(38,30,"⚠️ Gian lận?","#FFA502"),
                                   (12,-5,"🛡️ Rủi ro thấp","#1E90FF"),(38,-5,"💀 Nguy hiểm","#FF4757")]:
            fig_quad.add_annotation(x=qx,y=qy,text=qtxt,showarrow=False,
                                    font=dict(color=qcolor,size=11,family="Inter"),opacity=0.6)
        fig_quad.update_layout(
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(26,26,46,0.4)",
            font=dict(color="#C0C0D8",family="Inter, sans-serif",size=10),
            margin=dict(l=50,r=20,t=20,b=40),
            height=280,
            xaxis=dict(title="Voucher Burn Rate (%)", gridcolor="#1E1E3A", tickfont=dict(color="#7C7CA0"), range=[0,55]),
            yaxis=dict(title="Biên LN Est. (%)", gridcolor="#1E1E3A", tickfont=dict(color="#7C7CA0"), range=[-15,50]),
            showlegend=False,
        )
        st.plotly_chart(fig_quad, use_container_width=True)
