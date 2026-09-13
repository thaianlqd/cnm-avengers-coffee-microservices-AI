import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go

from utils import query_df, fmt_vnd, get_engine
from components import render_sidebar
from ai_engine import render_insight_btn
from styles import inject_styles, init_plotly_template, apply_layout

try:
    from ai_engine import ANTHROPIC_API_KEY_LOADED, GROQ_API_KEY_LOADED
    AI_ENGINE_OK = ANTHROPIC_API_KEY_LOADED or GROQ_API_KEY_LOADED
except ImportError:
    AI_ENGINE_OK = False

# ─── Page Config ──────────────────────────────────────────────────────────────
st.set_page_config(page_title="Hiệu Quả Nhượng Quyền", page_icon="🏪", layout="wide")
inject_styles()
init_plotly_template()
render_sidebar()

st.markdown("""
<div style='margin-bottom:20px;'>
  <h2 style='margin:0;font-size:24px;font-weight:800;color:#C0C0D8;'>Hiệu Quả Nhượng Quyền</h2>
  <p style='color:#64748B;font-size:14px;margin-top:4px;'>
    Giám sát Unit Economics (Kinh tế Đơn vị) cho 100+ Kiosk nhượng quyền toàn quốc.
    Dự báo dòng tiền phí nhượng quyền 7% và phân loại sức khoẻ tài chính theo thời gian thực.
  </p>
</div>
""", unsafe_allow_html=True)

# ── KPI tổng quan nhượng quyền ──
@st.cache_data(ttl=86400, show_spinner=False)
def get_franchise_kpis():
    return query_df("""
        SELECT
            COUNT(DISTINCT co_so_ma) FILTER (
                WHERE co_so_ma LIKE '%-K%'
            ) AS total_kiosks,
            COUNT(DISTINCT co_so_ma) FILTER (
                WHERE co_so_ma NOT LIKE '%-K%'
            ) AS total_main_stores,
            COALESCE(SUM(tong_tien) FILTER (
                WHERE co_so_ma LIKE '%-K%'
                  AND trang_thai_don_hang = 'HOAN_THANH'
                  AND ngay_tao >= NOW() - INTERVAL '30 days'
            ), 0) AS kiosk_revenue_30d,
            COALESCE(SUM(tong_tien) FILTER (
                WHERE co_so_ma NOT LIKE '%-K%'
                  AND trang_thai_don_hang = 'HOAN_THANH'
                  AND ngay_tao >= NOW() - INTERVAL '30 days'
            ), 0) AS store_revenue_30d,
            COUNT(DISTINCT co_so_ma) FILTER (
                WHERE co_so_ma LIKE '%-K%'
                  AND trang_thai_don_hang = 'HOAN_THANH'
                  AND ngay_tao >= NOW() - INTERVAL '30 days'
            ) AS active_kiosks_30d
        FROM orders.don_hang
    """)

fk = get_franchise_kpis()
if not fk.empty:
    r = fk.iloc[0]
    kiosk_rev = float(r.get("kiosk_revenue_30d", 0))
    store_rev = float(r.get("store_revenue_30d", 0))
    royalty_fee = kiosk_rev * 0.07

    k1, k2, k3, k4, k5 = st.columns(5)
    k1.metric("🏪 Tổng Kiosk Nhượng Quyền", f"{int(r.get('total_kiosks', 0)):,}")
    k2.metric("🏠 Cửa Hàng Tự Doanh", f"{int(r.get('total_main_stores', 0)):,}")
    k3.metric("💰 Doanh Thu Kiosk / 30 ngày", fmt_vnd(kiosk_rev))
    k4.metric("📊 Phí NQ Thu Về (7%) / 30 ngày", fmt_vnd(royalty_fee),
              help="Dòng tiền phí nhượng quyền ước tính Franchisor thu được")
    k5.metric("🟢 Kiosk Đang Hoạt Động", f"{int(r.get('active_kiosks_30d', 0)):,}")

st.markdown("---")

# ── Bảng xếp hạng sức khoẻ Kiosk ──
st.markdown("#### 🏆 Bảng Xếp Hạng Sức Khoẻ Tài Chính Kiosk (30 ngày gần nhất)")
st.caption("Công thức: Tỷ suất lợi nhuận = (Doanh thu - Tiền giảm giá voucher) / Doanh thu. < 15% = 🔴 UNHEALTHY")

@st.cache_data(ttl=86400, show_spinner=False)
def get_kiosk_health():
    return query_df("""
        SELECT
            co_so_ma,
            COUNT(*) AS tong_don,
            ROUND(SUM(tong_tien) FILTER (WHERE trang_thai_don_hang = 'HOAN_THANH')::numeric, 0) AS doanh_thu,
            ROUND(SUM(so_tien_giam) FILTER (WHERE trang_thai_don_hang = 'HOAN_THANH')::numeric, 0) AS tong_giam_gia,
            COUNT(*) FILTER (WHERE trang_thai_don_hang = 'DA_HUY') AS don_huy,
            ROUND(
                (1.0 - COALESCE(SUM(so_tien_giam) FILTER (WHERE trang_thai_don_hang = 'HOAN_THANH'), 0)
                     / NULLIF(SUM(tong_tien) FILTER (WHERE trang_thai_don_hang = 'HOAN_THANH'), 0)
                ) * 100, 1
            ) AS ty_suat_loi_nhuan_pct,
            ROUND(SUM(tong_tien) FILTER (WHERE trang_thai_don_hang = 'HOAN_THANH')::numeric * 0.07, 0) AS phi_nhuong_quyen
        FROM orders.don_hang
        WHERE co_so_ma LIKE '%-K%'
          AND ngay_tao >= NOW() - INTERVAL '30 days'
        GROUP BY co_so_ma
        HAVING COUNT(*) FILTER (WHERE trang_thai_don_hang = 'HOAN_THANH') > 0
        ORDER BY doanh_thu DESC NULLS LAST
        LIMIT 50
    """)

df_health = get_kiosk_health()
if not df_health.empty:
    # Phân loại sức khoẻ
    def classify_health(pct):
        if pct is None: return "⚪ N/A"
        pct = float(pct)
        if pct >= 75: return "🟢 HEALTHY"
        elif pct >= 50: return "🟡 STABLE"
        elif pct >= 30: return "🟠 WARNING"
        else: return "🔴 UNHEALTHY"

    df_health["suc_khoe"] = df_health["ty_suat_loi_nhuan_pct"].apply(classify_health)
    df_health["doanh_thu_fmt"] = df_health["doanh_thu"].apply(lambda x: fmt_vnd(float(x)) if x else "0")
    df_health["phi_nq_fmt"] = df_health["phi_nhuong_quyen"].apply(lambda x: fmt_vnd(float(x)) if x else "0")
    df_health["ty_suat_fmt"] = df_health["ty_suat_loi_nhuan_pct"].apply(
        lambda x: f"{float(x):.1f}%" if x else "N/A"
    )

    display_cols = ["co_so_ma", "tong_don", "doanh_thu_fmt", "phi_nq_fmt", "ty_suat_fmt", "don_huy", "suc_khoe"]
    df_display = df_health[display_cols].copy()
    df_display.columns = ["Mã Kiosk", "Tổng Đơn", "Doanh Thu", "Phí NQ (7%)", "Tỷ Suất LN", "Đơn Huỷ", "Sức Khoẻ"]

    unhealthy = (df_health["ty_suat_loi_nhuan_pct"].astype(float) < 30).sum()
    if unhealthy > 0:
        st.warning(f"⚠️ Có **{unhealthy} Kiosk** đang ở mức UNHEALTHY/WARNING — Cần hỗ trợ khẩn!")

    st.dataframe(df_display, use_container_width=True, height=400)

st.markdown("---")

col_a, col_b = st.columns(2)

# ── Biểu đồ doanh thu Kiosk theo vùng ──
with col_a:
    st.markdown("#### 🗺️ Doanh Thu Theo Tỉnh/Thành Phố (Kiosk Nhượng Quyền)")

    @st.cache_data(ttl=86400, show_spinner=False)
    def get_kiosk_by_city():
        return query_df("""
            SELECT
                SPLIT_PART(dia_chi_giao_hang, ', ', 2) AS thanh_pho,
                COUNT(DISTINCT co_so_ma) AS so_kiosk,
                ROUND(SUM(tong_tien) FILTER (WHERE trang_thai_don_hang = 'HOAN_THANH')::numeric, 0) AS doanh_thu
            FROM orders.don_hang
            WHERE co_so_ma LIKE '%-K%'
              AND ngay_tao >= NOW() - INTERVAL '30 days'
            GROUP BY SPLIT_PART(dia_chi_giao_hang, ', ', 2)
            ORDER BY doanh_thu DESC NULLS LAST
            LIMIT 14
        """)

    df_city = get_kiosk_by_city()
    if not df_city.empty:
        fig_city = px.bar(
            df_city, x="doanh_thu", y="thanh_pho",
            orientation="h",
            color="doanh_thu",
            color_continuous_scale=["#1E3A8A", "#2563EB", "#60A5FA"],
            text="so_kiosk",
            labels={"doanh_thu": "Doanh thu (VNĐ)", "thanh_pho": "Tỉnh/Thành"},
            custom_data=["so_kiosk"],
        )
        fig_city.update_traces(
            texttemplate="%{customdata[0]} kiosks",
            textposition="inside",
            textfont_color="#C0C0D8"
        )
        fig_city.update_coloraxes(showscale=False)
        fig_city = apply_layout(fig_city, height=420)
        st.plotly_chart(fig_city, use_container_width=True)
        
        # --- MAPBOX KIOSK REVENUE ---
        st.markdown("##### 📍 Bản đồ Phân Bổ Doanh Thu Kiosk")
        PROVINCE_COORDS = {
            "Hồ Chí Minh": (10.8231, 106.6297), "Hà Nội": (21.0285, 105.8542),
            "Đà Nẵng": (16.0544, 108.2022), "Hải Phòng": (20.8449, 106.6881),
            "Cần Thơ": (10.0452, 105.7469), "Bình Dương": (11.2291, 106.6669),
            "Đồng Nai": (10.9410, 106.8209), "Nghệ An": (19.3444, 104.8682),
            "Thanh Hóa": (19.8067, 105.7761), "Khánh Hòa": (12.2388, 109.1967),
            "Lâm Đồng": (11.9404, 108.4583), "Bà Rịa - Vũng Tàu": (10.4936, 107.1704),
            "Cà Mau": (9.1769, 105.1500), "Quảng Ninh": (21.0069, 107.2925),
            "Thừa Thiên - Huế": (16.4637, 107.5909), "Gia Lai": (13.9833, 108.0000),
            "Bắc Ninh": (21.1861, 106.0763), "Đắk Lắk": (12.6667, 108.0333),
            "Kiên Giang": (9.9822, 105.1118), "Bình Định": (13.7828, 109.2195),
            "Thái Nguyên": (21.5942, 105.8482), "Tiền Giang": (10.3667, 106.3333),
            "Tây Ninh": (11.3167, 106.1000), "Bình Thuận": (11.1000, 108.2833),
        }
        df_city_map = df_city.copy()
        df_city_map["lat"] = df_city_map["thanh_pho"].map(lambda x: PROVINCE_COORDS.get(x, (14.0583, 108.2772))[0])
        df_city_map["lon"] = df_city_map["thanh_pho"].map(lambda x: PROVINCE_COORDS.get(x, (14.0583, 108.2772))[1])
        
        import pydeck as pdk
        import numpy as np
        np.random.seed(99)
        df_city_map["lat"] += np.random.uniform(-0.05, 0.05, len(df_city_map))
        df_city_map["lon"] += np.random.uniform(-0.05, 0.05, len(df_city_map))

        # Tính toán radius cho Kiosk
        max_doanh_thu = df_city_map["doanh_thu"].max()
        df_city_map["radius"] = (df_city_map["doanh_thu"] / max_doanh_thu) * 60000 + 10000

        layer = pdk.Layer(
            "ScatterplotLayer",
            data=df_city_map,
            get_position="[lon, lat]",
            get_radius="radius",
            get_fill_color="[37, 99, 235, 180]", # Màu xanh dương
            get_line_color="[29, 78, 216, 255]",
            pickable=True,
            auto_highlight=True,
        )
        view_state = pdk.ViewState(
            latitude=16.04,
            longitude=106.0,
            zoom=4.5,
            pitch=30,
        )
        st.pydeck_chart(pdk.Deck(
            map_style=pdk.map_styles.DARK,
            layers=[layer],
            initial_view_state=view_state,
            tooltip={"html": "<b>{thanh_pho}</b><br/>Số Kiosk: {so_kiosk}<br/>Doanh thu: {doanh_thu} VNĐ"}
        ))

# ── Biểu đồ tỷ trọng loại đơn ──
with col_b:
    st.markdown("#### 🥧 Cơ Cấu Loại Đơn Hàng: Kiosk vs Main Store")

    @st.cache_data(ttl=86400, show_spinner=False)
    def get_order_type_mix():
        return query_df("""
            SELECT
                CASE WHEN co_so_ma LIKE '%-K%' THEN 'Kiosk (NQ)' ELSE 'Main Store' END AS loai_co_so,
                COALESCE(loai_don_hang, 'KHAC') AS loai_don,
                COUNT(*) AS so_don,
                ROUND(SUM(tong_tien)::numeric, 0) AS doanh_thu
            FROM orders.don_hang
            WHERE trang_thai_don_hang = 'HOAN_THANH'
              AND ngay_tao >= NOW() - INTERVAL '30 days'
            GROUP BY loai_co_so, loai_don
            ORDER BY loai_co_so, so_don DESC
        """)

    df_mix = get_order_type_mix()
    if not df_mix.empty:
        fig_mix = px.sunburst(
            df_mix, path=["loai_co_so", "loai_don"],
            values="so_don",
            color="loai_co_so",
            color_discrete_map={
                "Kiosk (NQ)": "#2563EB",
                "Main Store": "#EF4444",
            },
        )
        fig_mix = apply_layout(fig_mix, height=420)
        st.plotly_chart(fig_mix, use_container_width=True)

st.markdown("---")

# ── Dự báo dòng tiền phí nhượng quyền 30 ngày tới ──
st.markdown("#### 📈 Dự Báo Dòng Tiền Phí Nhượng Quyền 7% — 30 Ngày Tới")

@st.cache_data(ttl=86400, show_spinner=False)
def get_daily_kiosk_revenue():
    return query_df("""
        SELECT
            DATE(ngay_tao) AS ds,
            SUM(tong_tien) AS y
        FROM orders.don_hang
        WHERE co_so_ma LIKE '%-K%'
          AND trang_thai_don_hang = 'HOAN_THANH'
          AND ngay_tao >= NOW() - INTERVAL '90 days'
        GROUP BY DATE(ngay_tao)
        ORDER BY ds
    """)

df_ts = get_daily_kiosk_revenue()
if not df_ts.empty and len(df_ts) >= 14:
    try:
        from prophet import Prophet
        import warnings
        warnings.filterwarnings("ignore")
        m = Prophet(daily_seasonality=False, weekly_seasonality=True, yearly_seasonality=False,
                    changepoint_prior_scale=0.1)
        m.fit(df_ts.rename(columns={"ds": "ds", "y": "y"}))
        future = m.make_future_dataframe(periods=30)
        forecast = m.predict(future)

        # Tạo biểu đồ forecast
        fig_fc = go.Figure()
        fig_fc.add_trace(go.Scatter(
            x=df_ts["ds"], y=(df_ts["y"] * 0.07).round(0),
            name="Phí NQ thực tế (7%)", mode="lines+markers",
            line=dict(color="#2563EB", width=2),
        ))
        forecast_future = forecast[forecast["ds"] > df_ts["ds"].max()]
        fig_fc.add_trace(go.Scatter(
            x=forecast_future["ds"], y=(forecast_future["yhat"] * 0.07).round(0),
            name="Dự báo (Prophet)", mode="lines",
            line=dict(color="#10B981", width=2.5, dash="dash"),
        ))
        fig_fc.add_trace(go.Scatter(
            x=list(forecast_future["ds"]) + list(reversed(list(forecast_future["ds"]))),
            y=list((forecast_future["yhat_upper"] * 0.07).round(0)) + list(reversed(list((forecast_future["yhat_lower"] * 0.07).round(0)))),
            fill="toself", fillcolor="rgba(16,185,129,0.08)",
            line=dict(color="rgba(255,255,255,0)"),
            name="Khoảng tin cậy 95%",
        ))

        projected_royalty = float(forecast_future["yhat"].sum() * 0.07)
        st.success(f"📊 Dự báo tổng phí nhượng quyền thu về trong **30 ngày tới**: **{fmt_vnd(projected_royalty)}**")

        fig_fc = apply_layout(fig_fc, height=360, yaxis_title="Phí NQ 7% ước tính (VNĐ)")
        st.plotly_chart(fig_fc, use_container_width=True)

    except ImportError:
        # Fallback nếu không có Prophet: dùng rolling mean
        df_ts["rolling_avg"] = df_ts["y"].rolling(7, min_periods=1).mean()
        avg_daily = df_ts["rolling_avg"].iloc[-7:].mean()
        projected = avg_daily * 30 * 0.07

        import pandas as pd
        future_dates = pd.date_range(df_ts["ds"].max(), periods=31, freq="D")[1:]
        projected_vals = [avg_daily * 0.07] * 30

        fig_fc = go.Figure()
        fig_fc.add_trace(go.Scatter(
            x=df_ts["ds"], y=(df_ts["y"] * 0.07).round(0),
            name="Phí NQ thực tế", mode="lines+markers",
            line=dict(color="#2563EB", width=2),
        ))
        fig_fc.add_trace(go.Scatter(
            x=future_dates, y=projected_vals,
            name="Dự báo (Rolling Avg)", mode="lines",
            line=dict(color="#10B981", width=2.5, dash="dash"),
        ))
        st.info(f"📊 Dự báo (Rolling Average) tổng phí NQ 30 ngày tới: **{fmt_vnd(projected)}**")
        fig_fc = apply_layout(fig_fc, height=360, yaxis_title="Phí NQ 7% (VNĐ)")
        st.plotly_chart(fig_fc, use_container_width=True)
else:
    st.info("⏳ Cần ít nhất 14 ngày dữ liệu để dự báo.")

if AI_ENGINE_OK:
    if 'session_id' not in st.session_state:
        import uuid
        st.session_state.session_id = str(uuid.uuid4())
    render_insight_btn(
        "Phân tích 3 điểm về sức khoẻ nhượng quyền: top Kiosk hiệu quả nhất, Kiosk nào đang cần hỗ trợ, và dự báo dòng tiền phí nhượng quyền.",
        "Dữ liệu sức khoẻ tài chính Kiosk nhượng quyền Avengers Coffee",
        get_engine(),
        st.session_state.session_id,
        "franchise_tab"
    )
