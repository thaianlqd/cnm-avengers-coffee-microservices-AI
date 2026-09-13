import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go

from utils import query_df, fmt_vnd, get_engine, get_max_date
from components import render_sidebar
from ai_engine import render_insight_btn
from styles import inject_styles, init_plotly_template, apply_layout

try:
    from ai_engine import ANTHROPIC_API_KEY_LOADED, GROQ_API_KEY_LOADED
    AI_ENGINE_OK = ANTHROPIC_API_KEY_LOADED or GROQ_API_KEY_LOADED
except ImportError:
    AI_ENGINE_OK = False

# ─── Page Config ──────────────────────────────────────────────────────────────
st.set_page_config(page_title="Cảnh Báo Rủi Ro", page_icon="💵", layout="wide")
inject_styles()
init_plotly_template()
render_sidebar()

st.markdown("""
<div style='margin-bottom:20px;'>
  <h2 style='margin:0;font-size:24px;font-weight:800;color:#C0C0D8;'>💵 Cảnh Báo Rủi Ro</h2>
  <p style='color:#64748B;font-size:14px;margin-top:4px;'>
    Hệ thống giám sát tự động nhận diện thất thoát dòng tiền, bất thường giao dịch và các
    dấu hiệu gian lận trên toàn bộ 120 chi nhánh (20 Stores + 100 Kiosks) theo thời gian thực.
  </p>
</div>
""", unsafe_allow_html=True)

# ── KPIs tổng hợp ──
@st.cache_data(ttl=86400, show_spinner=False)
def get_fraud_kpis():
    max_d = get_max_date()
    return query_df(f"""
        SELECT
            COUNT(*) FILTER (WHERE trang_thai_don_hang = 'DA_HUY'
                AND EXTRACT(HOUR FROM ngay_tao) BETWEEN 22 AND 23
                AND ngay_tao >= '{max_d}'::date - INTERVAL '30 days')
                AS late_night_cancellations,

            COALESCE(SUM(tong_tien) FILTER (WHERE trang_thai_don_hang = 'DA_HUY'
                AND EXTRACT(HOUR FROM ngay_tao) BETWEEN 22 AND 23
                AND ngay_tao >= '{max_d}'::date - INTERVAL '30 days'), 0)
                AS late_night_revenue_lost,

            COUNT(*) FILTER (WHERE phuong_thuc_thanh_toan = 'COD'
                AND trang_thai_thanh_toan = 'CHO_THANH_TOAN'
                AND trang_thai_don_hang = 'HOAN_THANH'
                AND ngay_tao <= '{max_d}'::date - INTERVAL '24 hours')
                AS cod_pending_count,

            COALESCE(SUM(tong_tien) FILTER (WHERE phuong_thuc_thanh_toan = 'COD'
                AND trang_thai_thanh_toan = 'CHO_THANH_TOAN'
                AND trang_thai_don_hang = 'HOAN_THANH'
                AND ngay_tao <= '{max_d}'::date - INTERVAL '24 hours'), 0)
                AS cod_pending_amount,

            COUNT(*) FILTER (WHERE trang_thai_don_hang = 'DA_HUY'
                AND ngay_tao >= '{max_d}'::date - INTERVAL '30 days')
                AS total_cancelled_30d,

            COALESCE(SUM(tong_tien) FILTER (WHERE trang_thai_don_hang = 'DA_HUY'
                AND ngay_tao >= '{max_d}'::date - INTERVAL '30 days'), 0)
                AS total_lost_30d
        FROM orders.don_hang
    """)

fraud_kpi = get_fraud_kpis()
if not fraud_kpi.empty:
    row = fraud_kpi.iloc[0]
    fk1, fk2, fk3, fk4 = st.columns(4)
    fk1.metric(
        "🌙 Huỷ khuya (22-23h) / 30 ngày",
        f"{int(row.get('late_night_cancellations', 0)):,} đơn",
        help="Nghi vấn gian lận phí nhượng quyền 7%: Huỷ đơn sau 22h để giảm doanh thu tổng kết"
    )
    fk2.metric(
        "💸 Dòng tiền mất (huỷ khuya)",
        fmt_vnd(float(row.get('late_night_revenue_lost', 0))),
        help="Ước tính doanh thu bị ẩn đi thông qua thủ thuật huỷ đơn muộn"
    )
    fk3.metric(
        "⏳ Tiền COD đang treo",
        f"{int(row.get('cod_pending_count', 0)):,} đơn",
        help="Đơn hàng COD đã giao thành công nhưng shipper chưa nộp tiền > 24 giờ"
    )
    fk4.metric(
        "💰 Giá trị COD treo",
        fmt_vnd(float(row.get('cod_pending_amount', 0))),
        help="Tổng số tiền mặt đang bị giữ lại bởi shipper chưa đối soát"
    )

st.markdown("---")

col_left, col_right = st.columns([1.2, 1])

# ── Biểu đồ 1: Đơn huỷ khuya theo chi nhánh (Top 15 nghi vấn cao nhất) ──
with col_left:
    st.markdown("#### 🔴 Top Chi Nhánh Có Tần Suất Huỷ Đơn Khuya Cao Nhất (30 ngày)")

    @st.cache_data(ttl=86400, show_spinner=False)
    def get_late_cancel_by_branch():
        max_d = get_max_date()
        return query_df(f"""
            SELECT
                co_so_ma,
                COUNT(*) AS so_don_huy_khuya,
                ROUND(SUM(tong_tien)::numeric, 0) AS tong_tien_mat
            FROM orders.don_hang
            WHERE trang_thai_don_hang = 'DA_HUY'
              AND EXTRACT(HOUR FROM ngay_tao) BETWEEN 22 AND 23
              AND ngay_tao >= '{max_d}'::date - INTERVAL '30 days'
            GROUP BY co_so_ma
            ORDER BY so_don_huy_khuya DESC
            LIMIT 15
        """)

    df_late = get_late_cancel_by_branch()
    if not df_late.empty:
        df_late["so_don_huy_khuya"] = df_late["so_don_huy_khuya"].astype(int)
        fig_late = px.bar(
            df_late, x="so_don_huy_khuya", y="co_so_ma",
            orientation="h",
            color="so_don_huy_khuya",
            color_continuous_scale=["#FCD34D", "#F59E0B", "#EF4444"],
            text="so_don_huy_khuya",
            labels={"so_don_huy_khuya": "Số đơn huỷ khuya", "co_so_ma": "Mã cơ sở"},
        )
        fig_late.update_traces(textposition="outside", textfont_color="#C0C0D8")
        fig_late.update_coloraxes(showscale=False)
        fig_late = apply_layout(fig_late, height=420)
        st.plotly_chart(fig_late, use_container_width=True)
        st.caption("⚠️ Ngưỡng cảnh báo: > 3 đơn huỷ khuya/tuần = Đánh cờ 🚩 FRAUD RISK")
    else:
        st.info("Không có dữ liệu huỷ đơn khuya trong 30 ngày qua.")

# ── Biểu đồ 2: Phân phối giờ huỷ đơn ──
with col_right:
    st.markdown("#### 🕐 Phân Phối Đơn Huỷ Theo Giờ Trong Ngày")

    @st.cache_data(ttl=86400, show_spinner=False)
    def get_cancel_by_hour():
        max_d = get_max_date()
        return query_df(f"""
            SELECT
                EXTRACT(HOUR FROM ngay_tao)::int AS gio,
                COUNT(*) AS so_don
            FROM orders.don_hang
            WHERE trang_thai_don_hang = 'DA_HUY'
              AND ngay_tao >= '{max_d}'::date - INTERVAL '30 days'
            GROUP BY gio
            ORDER BY gio
        """)

    df_hour = get_cancel_by_hour()
    if not df_hour.empty:
        df_hour["color"] = df_hour["gio"].apply(
            lambda h: "#EF4444" if h >= 22 or h <= 1 else ("#F59E0B" if h >= 20 else "#3B82F6")
        )
        fig_hour = go.Figure(go.Bar(
            x=df_hour["gio"], y=df_hour["so_don"],
            marker_color=df_hour["color"],
            text=df_hour["so_don"], textposition="outside",
            textfont=dict(color="#C0C0D8")
        ))
        fig_hour.add_vrect(x0=21.5, x1=23.5, fillcolor="rgba(239,68,68,0.15)",
                           line_width=0, annotation_text="🚨 Khung giờ nguy hiểm",
                           annotation_position="top left", annotation_font_color="#EF4444")
        fig_hour = apply_layout(fig_hour, height=420,
                                xaxis_title="Giờ trong ngày", yaxis_title="Số đơn huỷ")
        st.plotly_chart(fig_hour, use_container_width=True)
    else:
        st.info("Chưa có dữ liệu.")

st.markdown("---")

# ── Bảng chi tiết đơn COD đang treo ──
st.markdown("#### ⏳ Danh Sách Đơn COD Đang Treo > 24h (Shipper Chưa Nộp Tiền)")

@st.cache_data(ttl=86400, show_spinner=False)
def get_cod_pending_list():
    max_d = get_max_date()
    return query_df(f"""
        SELECT
            ma_don_hang,
            co_so_ma,
            ten_khach_hang,
            ROUND(tong_tien::numeric, 0)    AS so_tien_cod,
            TO_CHAR(ngay_tao, 'DD/MM/YYYY HH24:MI') AS thoi_gian_dat,
            ROUND(EXTRACT(EPOCH FROM ('{max_d}'::date - ngay_tao))/3600, 1) AS gio_da_treo
        FROM orders.don_hang
        WHERE phuong_thuc_thanh_toan = 'COD'
          AND trang_thai_thanh_toan   = 'CHO_THANH_TOAN'
          AND trang_thai_don_hang     = 'HOAN_THANH'
          AND ngay_tao <= '{max_d}'::date - INTERVAL '24 hours'
        ORDER BY ngay_tao ASC
        LIMIT 100
    """)

df_cod = get_cod_pending_list()
if not df_cod.empty:
    df_cod["so_tien_cod"] = df_cod["so_tien_cod"].apply(lambda x: f"{int(x):,} đ")
    df_cod["gio_da_treo"] = df_cod["gio_da_treo"].apply(lambda h: f"⏰ {h:.1f}h")
    df_cod.columns = ["Mã Đơn", "Chi Nhánh", "Tên Khách", "Số Tiền COD", "Đặt Lúc", "Đã Treo"]
    st.dataframe(df_cod, use_container_width=True, height=320)
    total_cod_vnd = get_fraud_kpis().iloc[0].get("cod_pending_amount", 0)
    st.error(f"⚠️ Tổng tiền COD đang bị giữ: **{fmt_vnd(float(total_cod_vnd))}** — Cần đối soát khẩn!")
else:
    st.success("✅ Không có đơn COD nào đang bị treo. Dòng tiền đang được đối soát tốt!")

st.markdown("---")

# ── Xu hướng tổng thiệt hại dòng tiền theo ngày ──
st.markdown("#### 📉 Xu Hướng Dòng Tiền Thất Thoát Ước Tính (30 ngày)")

@st.cache_data(ttl=86400, show_spinner=False)
def get_daily_loss():
    max_d = get_max_date()
    return query_df(f"""
        SELECT
            DATE(ngay_tao) AS ngay,
            COALESCE(SUM(tong_tien) FILTER (
                WHERE trang_thai_don_hang = 'DA_HUY'
                  AND EXTRACT(HOUR FROM ngay_tao) BETWEEN 22 AND 23
            ), 0) AS mat_gian_lan,
            COALESCE(SUM(tong_tien) FILTER (
                WHERE phuong_thuc_thanh_toan = 'COD'
                  AND trang_thai_thanh_toan = 'CHO_THANH_TOAN'
                  AND trang_thai_don_hang = 'HOAN_THANH'
            ), 0) AS mat_cod_treo
        FROM orders.don_hang
        WHERE ngay_tao >= '{max_d}'::date - INTERVAL '30 days'
        GROUP BY DATE(ngay_tao)
        ORDER BY ngay
    """)

df_loss = get_daily_loss()
if not df_loss.empty:
    fig_loss = go.Figure()
    fig_loss.add_trace(go.Scatter(
        x=df_loss["ngay"], y=df_loss["mat_gian_lan"],
        name="Gian lận huỷ khuya", mode="lines+markers",
        line=dict(color="#EF4444", width=2.5), fill="tozeroy",
        fillcolor="rgba(239,68,68,0.15)"
    ))
    fig_loss.add_trace(go.Scatter(
        x=df_loss["ngay"], y=df_loss["mat_cod_treo"],
        name="COD treo (Shipper)", mode="lines+markers",
        line=dict(color="#F59E0B", width=2.5, dash="dot"), fill="tozeroy",
        fillcolor="rgba(245,158,11,0.1)"
    ))
    fig_loss = apply_layout(fig_loss, height=320, yaxis_title="VNĐ thất thoát ước tính")
    st.plotly_chart(fig_loss, use_container_width=True)

st.markdown("---")

# ── Bản Đồ Điểm Nóng Thất Thoát Dòng Tiền ──
st.markdown("#### 🗺️ Bản Đồ Điểm Nóng Thất Thoát Dòng Tiền (Toàn Quốc)")
st.caption("Bản đồ phân bổ vị trí các cửa hàng có lượng Đơn Huỷ Khuya và COD Treo lớn nhất.")

@st.cache_data(ttl=86400, show_spinner=False)
def get_fraud_map_data():
    max_d = get_max_date()
    return query_df(f"""
        SELECT
            SPLIT_PART(dia_chi_giao_hang, ', ', 2) AS thanh_pho,
            COALESCE(SUM(tong_tien) FILTER (
                WHERE trang_thai_don_hang = 'DA_HUY' AND EXTRACT(HOUR FROM ngay_tao) BETWEEN 22 AND 23
            ), 0) AS mat_gian_lan,
            COALESCE(SUM(tong_tien) FILTER (
                WHERE phuong_thuc_thanh_toan = 'COD' AND trang_thai_thanh_toan = 'CHO_THANH_TOAN' AND trang_thai_don_hang = 'HOAN_THANH'
            ), 0) AS mat_cod_treo
        FROM orders.don_hang
        WHERE ngay_tao >= '{max_d}'::date - INTERVAL '30 days'
        GROUP BY SPLIT_PART(dia_chi_giao_hang, ', ', 2)
        HAVING SUM(tong_tien) > 0
    """)

df_map = get_fraud_map_data()
if not df_map.empty:
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
    df_map["lat"] = df_map["thanh_pho"].map(lambda x: PROVINCE_COORDS.get(x, (14.0583, 108.2772))[0])
    df_map["lon"] = df_map["thanh_pho"].map(lambda x: PROVINCE_COORDS.get(x, (14.0583, 108.2772))[1])
    df_map["tong_that_thoat"] = df_map["mat_gian_lan"] + df_map["mat_cod_treo"]
    
    # Chỉ lấy các tỉnh có thất thoát
    df_map = df_map[df_map["tong_that_thoat"] > 0].copy()

    if not df_map.empty:
        import pydeck as pdk
        import numpy as np
        np.random.seed(42)
        df_map["lat"] += np.random.uniform(-0.05, 0.05, len(df_map))
        df_map["lon"] += np.random.uniform(-0.05, 0.05, len(df_map))
        
        # Tính toán radius (tối thiểu 10km, tối đa 60km)
        max_val = df_map["tong_that_thoat"].max()
        df_map["radius"] = (df_map["tong_that_thoat"] / max_val) * 50000 + 10000

        layer = pdk.Layer(
            "ScatterplotLayer",
            data=df_map,
            get_position="[lon, lat]",
            get_radius="radius",
            get_fill_color="[239, 68, 68, 160]", # Đỏ
            get_line_color="[239, 68, 68, 255]",
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
            tooltip={"html": "<b>{thanh_pho}</b><br/>Tổng thất thoát: {tong_that_thoat} VNĐ"}
        ))

if AI_ENGINE_OK:
    if 'session_id' not in st.session_state:
        import uuid
        st.session_state.session_id = str(uuid.uuid4())
    render_insight_btn(
        "Phân tích ngắn gọn (3 điểm) về tình trạng thất thoát dòng tiền: số đơn hủy khuya, số COD đang treo, và đề xuất 2 hành động ưu tiên.",
        "Dữ liệu đối soát dòng tiền Avengers Coffee",
        get_engine(),
        st.session_state.session_id,
        "fraud_tab"
    )
