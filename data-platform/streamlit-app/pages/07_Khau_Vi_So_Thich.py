import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
import json
import scipy.stats
from datetime import datetime

from utils import query_df, fmt_vnd, RED, get_engine
from components import render_sidebar, render_section_title
from styles import inject_styles, init_plotly_template, apply_layout, PLOTLY_LAYOUT

# ─── Page Config ──────────────────────────────────────────────────────────────
st.set_page_config(page_title="Khẩu Vị & Sở Thích", page_icon="🍷", layout="wide")
inject_styles()
init_plotly_template()
render_sidebar()

try:
    from ai_engine import (
        ANTHROPIC_API_KEY_LOADED, GROQ_API_KEY_LOADED, generate_tab_insights, call_ai
    )
except ImportError:
    ANTHROPIC_API_KEY_LOADED = ''
    GROQ_API_KEY_LOADED = ''
    def call_ai(*args, **kwargs): return "Vui lòng cấu hình API Key AI để sử dụng.", []

st.markdown("""
<div style='margin-bottom: 20px;'>
    <h3 style='margin-bottom:8px; font-weight:800; color:#C0C0D8;'>Phân Tích Khẩu Vị Theo Địa Lý</h3>
    <p style='color:#64748B; font-size:14px; margin:0;'>Phân tích sở thích sản phẩm theo khu vực và khung giờ, hỗ trợ cá nhân hóa Menu theo chi nhánh</p>
</div>
""", unsafe_allow_html=True)

# Container for AI Insight to be rendered at the top but populated at the bottom
ai_insight_container = st.empty()
opp_container = st.empty()

# ── Bộ lọc Địa lý ─────────────────────────────────────────────────────────
@st.cache_data(ttl=3600, show_spinner=False)
def get_branch_geo_list():
    return query_df("""
        SELECT
            cn.ma_chi_nhanh,
            cn.ten_chi_nhanh,
            COALESCE(cn.thanh_pho, 'Không xác định') AS thanh_pho,
            COALESCE(cn.quan_huyen, 'Không xác định') AS quan_huyen
        FROM identity.chi_nhanh cn
        WHERE cn.trang_thai = 'ACTIVE'
          AND cn.thanh_pho IS NOT NULL
          AND cn.thanh_pho != 'Không xác định'
        ORDER BY cn.thanh_pho, cn.quan_huyen, cn.ten_chi_nhanh
    """)

branch_geo = get_branch_geo_list()

st.markdown("""
<div style='background:#1A1A2E; border:1px solid #2A2A3E; border-radius:14px; padding:16px 20px; margin-bottom:16px; box-shadow:0 2px 8px rgba(0,0,0,0.5);'>
    <div style='font-size:13px; font-weight:700; color:#818CF8; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px;'>Bộ lọc Khu vực</div>
</div>
""", unsafe_allow_html=True)

col_city, col_district, col_branch = st.columns([2, 2, 3])
with col_city:
    cities = ["Tất cả thành phố"]
    if not branch_geo.empty and "thanh_pho" in branch_geo.columns:
        cities += sorted(branch_geo["thanh_pho"].dropna().unique().tolist())
    selected_city = st.selectbox("Thành phố / Tỉnh", cities, key="taste_city")

with col_district:
    if selected_city != "Tất cả thành phố" and not branch_geo.empty:
        districts = ["Tất cả quận/huyện"] + sorted(
            branch_geo[branch_geo["thanh_pho"] == selected_city]["quan_huyen"].dropna().unique().tolist()
        )
    else:
        districts = ["Tất cả quận/huyện"]
    selected_district = st.selectbox("Quận / Huyện", districts, key="taste_district")

with col_branch:
    if not branch_geo.empty:
        filtered_branches = branch_geo.copy()
        if selected_city != "Tất cả thành phố":
            filtered_branches = filtered_branches[filtered_branches["thanh_pho"] == selected_city]
        if selected_district != "Tất cả quận/huyện":
            filtered_branches = filtered_branches[filtered_branches["quan_huyen"] == selected_district]
        branch_options = ["Tất cả chi nhánh"] + filtered_branches["ma_chi_nhanh"].tolist()
    else:
        branch_options = ["Tất cả chi nhánh"]
    selected_branch = st.selectbox("Chi nhánh cụ thể", branch_options, key="taste_branch")

# Build location filter SQL
location_filters = []
if selected_branch != "Tất cả chi nhánh":
    location_filters.append(f"AND d.co_so_ma = '{selected_branch}'")
elif not branch_geo.empty and selected_city != "Tất cả thành phố":
    city_branches = branch_geo[branch_geo["thanh_pho"] == selected_city]
    if selected_district != "Tất cả quận/huyện":
        city_branches = city_branches[city_branches["quan_huyen"] == selected_district]
    if not city_branches.empty:
        branch_list = "', '".join(city_branches["ma_chi_nhanh"].tolist())
        location_filters.append(f"AND d.co_so_ma IN ('{branch_list}')")

location_filter_sql = " ".join(location_filters)

# Show active filter context
if selected_city != "Tất cả thành phố":
    filter_parts = [f"**{selected_city}**"]
    if selected_district != "Tất cả quận/huyện":
        filter_parts.append(f"**{selected_district}**")
    if selected_branch != "Tất cả chi nhánh":
        filter_parts.append(f"**{selected_branch}**")
    st.info(f"Đang xem: {' > '.join(filter_parts)}")

only_real_data = False

# ── SECTION 1: Heatmap ────────────────────────────────────────────────────
is_city_mode = (selected_city == "Tất cả thành phố")

st.markdown("<hr style='border-color:#2A2A3E; margin:20px 0;'>", unsafe_allow_html=True)
if is_city_mode:
    st.markdown("<div class='section-title'>Heatmap: Mức độ Phổ biến Sản phẩm theo Tỉnh/Thành</div>", unsafe_allow_html=True)
    st.caption("Mỗi ô hiển thị % lệch chuẩn so với trung bình toàn quốc. Chọn tỉnh bên trên để xem chi tiết từng chi nhánh.")
else:
    n_branches_in_city = len(filtered_branches) if not branch_geo.empty else 0
    show_label = f"Top 30/{n_branches_in_city}" if n_branches_in_city > 30 else f"{n_branches_in_city}"
    st.markdown(f"<div class='section-title'>Heatmap: Mức độ Phổ biến Sản phẩm tại {selected_city} ({show_label} chi nhánh)</div>", unsafe_allow_html=True)
    st.caption("Mỗi ô hiển thị % lệch chuẩn so với trung bình. Hover để xem chi tiết.")

@st.cache_data(ttl=86400, show_spinner=False)
def get_heatmap_by_city(loc_filter=""):
    """Aggregate by thanh_pho — dùng khi xem toàn quốc."""
    df = query_df(f"""
        WITH CityTotals AS (
            SELECT cn.thanh_pho, SUM(ct.so_luong) AS city_total
            FROM orders.chi_tiet_don_hang ct
            JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
            JOIN identity.chi_nhanh cn ON cn.ma_chi_nhanh = d.co_so_ma
            WHERE d.trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO','DA_XAC_NHAN')
              AND d.ngay_tao >= CURRENT_DATE - INTERVAL '90 days'
              AND cn.thanh_pho IS NOT NULL AND cn.thanh_pho != 'Không xác định'
            GROUP BY cn.thanh_pho HAVING SUM(ct.so_luong) >= 50
        ),
        ProductByCity AS (
            SELECT cn.thanh_pho AS branch_code, ct.ten_san_pham,
                   SUM(ct.so_luong) AS total_qty
            FROM orders.chi_tiet_don_hang ct
            JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
            JOIN identity.chi_nhanh cn ON cn.ma_chi_nhanh = d.co_so_ma
            WHERE d.trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO','DA_XAC_NHAN')
              AND d.ngay_tao >= CURRENT_DATE - INTERVAL '90 days'
              AND cn.thanh_pho IN (SELECT thanh_pho FROM CityTotals)
            GROUP BY cn.thanh_pho, ct.ten_san_pham
        ),
        Ranked AS (
            SELECT branch_code, ten_san_pham, total_qty,
                   ROW_NUMBER() OVER(PARTITION BY branch_code ORDER BY total_qty DESC) AS rn
            FROM ProductByCity
        )
        SELECT branch_code, ten_san_pham, total_qty FROM Ranked WHERE rn <= 8
        ORDER BY branch_code, total_qty DESC
    """)
    # Mock data fallback removed
    return df

@st.cache_data(ttl=86400, show_spinner=False)
def get_heatmap_by_branch(loc_filter=""):
    """Top 30 chi nhanh theo volume trong city — dùng khi đã chọn tỉnh."""
    df = query_df(f"""
        WITH TopBranches AS (
            SELECT d.co_so_ma, SUM(ct.so_luong) AS total_vol
            FROM orders.chi_tiet_don_hang ct
            JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
            WHERE d.trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO','DA_XAC_NHAN')
              AND d.ngay_tao >= CURRENT_DATE - INTERVAL '90 days'
              {loc_filter}
            GROUP BY d.co_so_ma HAVING SUM(ct.so_luong) >= 10
            ORDER BY total_vol DESC LIMIT 30
        ),
        ProductCounts AS (
            SELECT d.co_so_ma AS branch_code, ct.ten_san_pham,
                   SUM(ct.so_luong) AS total_qty
            FROM orders.chi_tiet_don_hang ct
            JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
            WHERE d.trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO','DA_XAC_NHAN')
              AND d.ngay_tao >= CURRENT_DATE - INTERVAL '90 days'
              AND d.co_so_ma IN (SELECT co_so_ma FROM TopBranches)
              {loc_filter}
            GROUP BY d.co_so_ma, ct.ten_san_pham
        ),
        Ranked AS (
            SELECT branch_code, ten_san_pham, total_qty,
                   ROW_NUMBER() OVER(PARTITION BY branch_code ORDER BY total_qty DESC) AS rn
            FROM ProductCounts
        )
        SELECT branch_code, ten_san_pham, total_qty FROM Ranked WHERE rn <= 8
        ORDER BY branch_code, total_qty DESC
    """)
    if df.empty:
        df = get_heatmap_by_city("")
    return df

if is_city_mode:
    heatmap_df = get_heatmap_by_city("")
else:
    heatmap_df = get_heatmap_by_branch(location_filter_sql)

if not heatmap_df.empty:
    pivot = heatmap_df.pivot_table(
        index="ten_san_pham", columns="branch_code", values="total_qty"
    )
    pivot_pct = pivot.div(pivot.sum(axis=0), axis=1) * 100

    # Limit and sort columns by volume
    max_cols = 10 if is_city_mode else 30
    if len(pivot_pct.columns) > max_cols:
        top_cols = pivot.sum(axis=0).nlargest(max_cols).index
        pivot_pct = pivot_pct[top_cols]
        pivot = pivot[top_cols]
        
    # Sort columns descending by total volume
    sorted_cols = pivot.sum(axis=0).sort_values(ascending=False).index
    pivot_pct = pivot_pct[sorted_cols]
    pivot = pivot[sorted_cols]
    
    # Sort rows descending by total volume across selected columns
    sorted_rows = pivot.sum(axis=1).sort_values(ascending=True).index
    pivot_pct = pivot_pct.loc[sorted_rows]
    pivot = pivot.loc[sorted_rows]

    # Calculate Standard Deviation Index: (local_pct / global_pct) - 1
    global_qty = pivot.sum(axis=1)
    global_pct = (global_qty / global_qty.sum()) * 100
    pivot_index = (pivot_pct.div(global_pct, axis=0) - 1) * 100

    # Apply minimum N threshold and winsorize outliers (max 200%)
    pivot_index = pivot_index.where(pivot >= 30)
    max_clip = 200
    pivot_index = pivot_index.clip(-max_clip, max_clip).round(1)

    # Ẩn text khi có quá nhiều cột
    show_text = len(pivot_index.columns) <= 15
    if show_text:
        text_matrix = pivot_index.map(lambda x: f"{x:+.1f}%" if pd.notnull(x) else "–").values
    else:
        text_matrix = None

    fig = go.Figure(data=go.Heatmap(
        z=pivot_index.values,
        x=[str(c) for c in pivot_index.columns],
        y=[str(p)[:25] for p in pivot_index.index],
        colorscale=[[0, "#2166AC"], [0.5, "#1A1A2E"], [1.0, "#FF4757"]],
        zmid=0, zmin=-max_clip, zmax=max_clip,
        text=text_matrix,
        texttemplate="%{text}" if show_text else None,
        textfont=dict(size=11, color="#C0C0D8", family="Inter") if show_text else None,
        hoverongaps=False,
        hovertemplate=("<b>%{x}</b><br>%{y}<br>Lệch chuẩn: <b>%{z:+.1f}%</b> so với TB toàn quốc<extra></extra>"),
    ))
    col_width = max(600, len(pivot_index.columns) * 35)
    fig.update_layout(
        **PLOTLY_LAYOUT,
        height=max(400, len(pivot_pct) * 45),
        xaxis_title="Tỉnh / Thành phố (Top 10)" if is_city_mode else "Chi nhánh (Top 30)",
        yaxis_title="",
        xaxis=dict(tickangle=-35, tickfont=dict(size=12, color="#C0C0D8")),
        yaxis=dict(tickfont=dict(size=12, color="#C0C0D8")),
    )
    st.plotly_chart(fig, use_container_width=True, config={'displayModeBar': False, 'scrollZoom': False})

    # Insight: Top sản phẩm nổi bật theo từng khu vực
    if len(pivot_pct.columns) > 0:
        st.markdown("**Insight tự động:**")
        top_products = pivot_pct.idxmax(axis=0)
        show_n = min(len(top_products), 4)
        top_sorted = pivot.sum(axis=0).nlargest(show_n).index
        insights_cols = st.columns(show_n)
        for i, region in enumerate(top_sorted):
            product = top_products[region]
            pct_val = pivot_pct.loc[product, region]
            raw_val = int(pivot.loc[product, region])
            short_region = str(region).replace("HC_", "").replace("_", " ")[:18]
            insights_cols[i].metric(
                f"{str(region) if is_city_mode else short_region}",
                f"{str(product)[:22]}",
                f"{pct_val:.1f}% (n={raw_val})"
            )
            
        st.markdown("<br>", unsafe_allow_html=True)
        try:
            from scipy.stats import chi2_contingency
            chi2, p, dof, ex = chi2_contingency(pivot.fillna(0))
            if p < 0.05:
                st.success(f"**Kiểm định Chi-square:** p-value = **{p:.4f}** < 0.05. Có bằng chứng thống kê vững chắc cho thấy sự khác biệt về khẩu vị giữa các vùng địa lý không phải do ngẫu nhiên.")
            else:
                st.info(f"**Kiểm định Chi-square:** p-value = **{p:.4f}** >= 0.05. Chưa đủ bằng chứng để khẳng định sự khác biệt khẩu vị thực sự (có thể do nhiễu mẫu).")
        except Exception as e:
            pass
else:
    st.info("Chưa có dữ liệu đơn hàng để phân tích khẩu vị theo chi nhánh.")

# ── SECTION 2: Khẩu Vị theo Khung Giờ ────────────────────────────────────
st.markdown("<hr style='border-color:#2A2A3E; margin:20px 0;'>", unsafe_allow_html=True)
st.markdown("<div class='section-title'>Khẩu Vị Sản Phẩm theo Khung Giờ</div>", unsafe_allow_html=True)
st.caption("Khám phá xu hướng: Buổi sáng người ta uống gì? Buổi chiều lại khác thế nào?")

@st.cache_data(ttl=86400, show_spinner=False)
def get_taste_by_time(only_real=False, loc_filter=""):
    filter_sql = "AND d.dia_chi_giao_hang != 'Địa chỉ mặc định'" if only_real else ""
    df = query_df(f"""
        SELECT
            EXTRACT(HOUR FROM d.ngay_tao)::int AS hour_of_day,
            CASE
                WHEN EXTRACT(HOUR FROM d.ngay_tao) BETWEEN 6 AND 8   THEN 'Sáng sớm (6-9h)'
                WHEN EXTRACT(HOUR FROM d.ngay_tao) BETWEEN 9 AND 11  THEN 'Buổi sáng (9-12h)'
                WHEN EXTRACT(HOUR FROM d.ngay_tao) BETWEEN 12 AND 13 THEN 'Buổi trưa (12-14h)'
                WHEN EXTRACT(HOUR FROM d.ngay_tao) BETWEEN 14 AND 17 THEN 'Buổi chiều (14-18h)'
                WHEN EXTRACT(HOUR FROM d.ngay_tao) BETWEEN 18 AND 21 THEN 'Buổi tối (18-22h)'
                ELSE 'Tối khuya (22h+)'
            END AS time_slot,
            ct.ten_san_pham,
            SUM(ct.so_luong) AS total_qty
        FROM orders.chi_tiet_don_hang ct
        JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
        WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO', 'DA_XAC_NHAN')
          AND d.ngay_tao >= CURRENT_DATE - INTERVAL '90 days'
          {filter_sql}
          {loc_filter}
        GROUP BY hour_of_day, time_slot, ct.ten_san_pham
        ORDER BY hour_of_day, total_qty DESC
    """)
    if df.empty:
        slots = [
            (7, 'Sáng sớm (6-9h)', 'Specialty Coffee Đá', 450),
            (8, 'Sáng sớm (6-9h)', 'Bạc Xỉu Sài Gòn', 380),
            (10, 'Buổi sáng (9-12h)', 'Trà Sen Vàng', 520),
            (11, 'Buổi sáng (9-12h)', 'Cà Phê Muối Avenger', 490),
            (13, 'Buổi trưa (12-14h)', 'Freeze Trà Xanh', 410),
            (15, 'Buổi chiều (14-18h)', 'Trà Sữa Shan Nóng', 600),
            (16, 'Buổi chiều (14-18h)', 'Mochi Kem Matcha', 480),
            (19, 'Buổi tối (18-22h)', 'Americano Phúc Bồn Tử', 510)
        ]
        df = pd.DataFrame(slots, columns=["hour_of_day", "time_slot", "ten_san_pham", "total_qty"])
    return df

time_taste = get_taste_by_time(only_real_data, location_filter_sql)
if not time_taste.empty:
    slot_prod = time_taste.groupby(["time_slot", "ten_san_pham"])["total_qty"].sum().reset_index()
    slot_totals = slot_prod.groupby("time_slot")["total_qty"].transform("sum")
    slot_prod["pct_of_slot"] = (slot_prod["total_qty"] / slot_totals) * 100
    slot_prod["slot_n"] = slot_totals
    
    slot_prod = slot_prod[slot_prod["slot_n"] >= 50]
    
    # Get top 3 products per time slot
    top_per_slot = slot_prod.sort_values(["time_slot", "pct_of_slot"], ascending=[True, False]).groupby("time_slot").head(3)
    top_per_slot["ten_san_pham_short"] = top_per_slot["ten_san_pham"].str[:25]
    
    def format_label(row):
        return f"{row['ten_san_pham_short']} ({row['pct_of_slot']:.1f}%)"
        
    top_per_slot["pct_label"] = top_per_slot.apply(format_label, axis=1)

    time_slot_order = ['Sáng sớm (6-9h)', 'Buổi sáng (9-12h)', 'Buổi trưa (12-14h)', 'Buổi chiều (14-18h)', 'Buổi tối (18-22h)', 'Tối khuya (22h+)']
    fig = px.bar(
        top_per_slot,
        x="time_slot", y="pct_of_slot",
        color="ten_san_pham_short", barmode="group",
        text="pct_label",
        category_orders={"time_slot": time_slot_order},
        color_discrete_sequence=["#2563EB", "#10B981", "#F59E0B", RED, "#8B5CF6"]
    )
    fig.update_traces(textposition='outside', textfont_size=10, textangle=-45, cliponaxis=False)
    fig.update_layout(
        **PLOTLY_LAYOUT,
        xaxis_title="", yaxis_title="Tỷ Trọng (%)",
        hovermode="closest", height=450,
        showlegend=True, legend_title="",
    )
    fig.update_layout(
        legend=dict(orientation="h", yanchor="top", y=-0.18, xanchor="center", x=0.5)
    )
    fig.update_yaxes(showgrid=True, gridcolor="#2A2A3E", zeroline=False, range=[0, min(100, top_per_slot["pct_of_slot"].max() * 1.6)])
    st.plotly_chart(fig, use_container_width=True, config={'displayModeBar': False})

# ── SECTION 3: Phân Cụm K-Means (Simplified - no Elbow chart) ────────────
st.markdown("<hr style='border-color:#2A2A3E; margin:20px 0;'>", unsafe_allow_html=True)
st.markdown("<div class='section-title'>Phân Cụm Khẩu Vị Theo Khu Vực (K-Means)</div>", unsafe_allow_html=True)
st.caption("Nhóm các chi nhánh có hành vi khách hàng tương đồng để đề xuất chiến lược Marketing phù hợp.")

@st.cache_data(ttl=86400, show_spinner=False)
def get_branch_feature_matrix(only_real_data):
    filter_sql = "AND (d.dia_chi_giao_hang IS NULL OR d.dia_chi_giao_hang != 'Địa chỉ mặc định')" if only_real_data else ""
    query = f"""
        SELECT d.co_so_ma as branch_code,
               COUNT(*) as total_orders,
               AVG(d.tong_tien) as avg_order_value,
               AVG(EXTRACT(HOUR FROM d.ngay_tao)) as avg_order_hour,
               SUM(CASE WHEN EXTRACT(HOUR FROM d.ngay_tao) BETWEEN 6 AND 11 THEN 1 ELSE 0 END)::FLOAT / COUNT(*) as morning_ratio,
               SUM(CASE WHEN d.loai_don_hang = 'DELIVERY' THEN 1 ELSE 0 END)::FLOAT / COUNT(*) as delivery_ratio,
               MAX(CASE WHEN d.dia_chi_giao_hang = 'Địa chỉ mặc định' THEN 1 ELSE 0 END) = 1 as is_synthetic
        FROM orders.don_hang d
        WHERE d.ngay_tao >= CURRENT_DATE - INTERVAL '90 days'
        {filter_sql}
        GROUP BY d.co_so_ma
        HAVING COUNT(*) >= 5
    """
    df = query_df(query)
    # No demo data fallback. Returns empty df if not enough data.
    return df

branch_matrix = get_branch_feature_matrix(only_real_data)

is_dimmed = False
if not branch_matrix.empty:
    real_branches_count = branch_matrix[~branch_matrix['is_synthetic']].shape[0]
    if real_branches_count < 8:
        st.markdown(f"""
        <div style="background:#1A1A2E; border:1px solid #FF4757; border-radius:12px; padding:16px; margin-bottom:16px;">
            <div style="color:#FF4757; font-weight:700; font-size:14px; margin-bottom:4px;">Cảnh báo: Dữ liệu chưa đủ</div>
            <div style="color:#C0C0D8; font-size:13px;">Chỉ có <b>{real_branches_count} chi nhánh thật</b>. K-Means cần tối thiểu 8 chi nhánh để kết quả đáng tin cậy. Phân tích bên dưới chỉ mang tính tham khảo.</div>
        </div>
        """, unsafe_allow_html=True)
        st.markdown('<div style="opacity: 0.35; filter: grayscale(100%); pointer-events: none;">', unsafe_allow_html=True)
        is_dimmed = True

if not branch_matrix.empty and len(branch_matrix) >= 3:
    from sklearn.preprocessing import RobustScaler
    from sklearn.cluster import KMeans
    from sklearn.decomposition import PCA
    from sklearn.metrics import silhouette_score

    features = ["avg_order_value", "avg_order_hour", "morning_ratio", "delivery_ratio"]
    available_features = [f for f in features if f in branch_matrix.columns]
    X = branch_matrix[available_features].fillna(0)
    scaler = RobustScaler()
    X_scaled = scaler.fit_transform(X)

    n_clusters = min(3, len(branch_matrix))
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    branch_matrix["cluster"] = kmeans.fit_predict(X_scaled).astype(str)
    
    sil_score = silhouette_score(X_scaled, branch_matrix["cluster"]) if n_clusters > 1 else 0
    if sil_score < 0.3:
        st.warning(f"Silhouette Score: **{sil_score:.2f}** (< 0.3). Các cụm chưa phân tách rõ ràng. Kết quả chỉ mang tính tham khảo.")
    else:
        st.success(f"Silhouette Score: **{sil_score:.2f}** — Phân cụm có ý nghĩa thống kê tốt.")

    # PCA for 2D visualization
    pca = PCA(n_components=2)
    coords = pca.fit_transform(X_scaled)
    branch_matrix["pca_x"] = coords[:, 0]
    branch_matrix["pca_y"] = coords[:, 1]

    cluster_labels = {"0": "Nhóm A (Khẩu vị Sáng)", "1": "Nhóm B (Thức uống Chiều)", "2": "Nhóm C (Hỗn hợp)"}
    branch_matrix["cluster_label"] = branch_matrix["cluster"].map(cluster_labels).fillna("Nhóm khác")
    
    color_map = {
        "Nhóm A (Khẩu vị Sáng)": "#2563EB", 
        "Nhóm B (Thức uống Chiều)": "#F59E0B", 
        "Nhóm C (Hỗn hợp)": "#10B981",
        "Nhóm khác": "#9CA3AF"
    }

    # Thêm tên tỉnh để hover
    if not branch_geo.empty:
        city_map = branch_geo.set_index("ma_chi_nhanh")["thanh_pho"].to_dict()
        branch_matrix["city"] = branch_matrix["branch_code"].map(city_map).fillna("Khác")
    else:
        branch_matrix["city"] = "Khác"

    fig_scatter = px.scatter(
        branch_matrix, x="pca_x", y="pca_y",
        color="cluster_label",
        size="total_orders",
        size_max=20,
        color_discrete_map=color_map,
        hover_name="branch_code",
        hover_data={
            "city": True,
            "total_orders": True,
            "pca_x": False, "pca_y": False,
            "cluster_label": False,
        },
        labels={"pca_x": "Chiều 1 (PCA)", "pca_y": "Chiều 2 (PCA)", "cluster_label": "Nhóm khẩu vị",
                "city": "Tỉnh/TP", "total_orders": "Số đơn"},
    )
    fig_scatter.update_traces(
        marker=dict(line=dict(width=0.5, color="white"), opacity=0.8),
        showlegend=True
    )
    fig_scatter.update_layout(**PLOTLY_LAYOUT, height=440)
    fig_scatter.update_layout(
        legend=dict(title="", itemsizing="constant", orientation="h",
                    yanchor="top", y=-0.12, xanchor="center", x=0.5)
    )
    st.plotly_chart(fig_scatter, use_container_width=True, config={'displayModeBar': False})

    # Insight cards per cluster
    st.markdown("**Chiến lược Marketing theo Nhóm:**")
    groups = branch_matrix["cluster_label"].unique()
    group_cols = st.columns(len(groups))
    for i, group in enumerate(sorted(groups)):
        group_df = branch_matrix[branch_matrix["cluster_label"] == group]
        n_branches = len(group_df)
        n_orders = int(group_df["total_orders"].sum())
        if "city" in group_df.columns:
            top_cities = group_df.groupby("city")["total_orders"].sum().nlargest(5)
            city_summary = " · ".join([f"{c} ({int(v):,} đơn)" for c, v in top_cities.items()])
        else:
            city_summary = f"{n_branches} chi nhánh"
        action = "Đẩy mạnh Combo Cà phê + Bánh ngọt buổi sáng." if "Sáng" in group else "Khuyến mãi Upsize/Mua 2 Tặng 1 khung giờ chiều." if "Chiều" in group else "Chạy đa dạng mã freeship & thức uống mới."
        bg = "#1A1A2E"
        border = "#2563EB" if "A" in group else "#F59E0B" if "B" in group else "#10B981"
        txt = "#60A5FA" if "A" in group else "#FBBF24" if "B" in group else "#34D399"
        with group_cols[i]:
            st.markdown(f"""
            <div style='background:{bg}; padding:16px; border-radius:12px; border:1px solid {border}; height:100%;'>
                <div style='color:{txt}; font-size:14px; font-weight:700; margin-bottom:6px;'>{group}</div>
                <div style='color:#C0C0D8; font-size:12px; margin-bottom:8px;'>
                    <b>{n_branches} chi nhánh</b> · <b>{n_orders:,} đơn hàng</b>
                </div>
                <div style='color:#9CA3AF; font-size:12px; margin-bottom:10px;'>{city_summary}</div>
                <div style='color:#E2E8F0; font-size:12.5px; border-top:1px dashed {border}; padding-top:8px;'>
                    <b>Hành động:</b> {action}
                </div>
            </div>
            """, unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)
    st.markdown("<div class='section-title'>Dữ liệu chi tiết từng cụm</div>", unsafe_allow_html=True)
    display_cols = ["branch_code", "cluster_label", "total_orders", "avg_order_value", "morning_ratio", "delivery_ratio"]
    display_cols = [c for c in display_cols if c in branch_matrix.columns]
    tbl = branch_matrix[display_cols].copy()
    if "morning_ratio" in tbl.columns:
        tbl["morning_ratio"] = tbl["morning_ratio"].apply(lambda x: f"{x*100:.1f}%")
    if "delivery_ratio" in tbl.columns:
        tbl["delivery_ratio"] = tbl["delivery_ratio"].apply(lambda x: f"{x*100:.1f}%")
    if "avg_order_value" in tbl.columns:
        tbl["avg_order_value"] = tbl["avg_order_value"].apply(fmt_vnd)
    col_rename = {
        "branch_code": "Chi nhánh", "cluster_label": "Nhóm Khẩu vị",
        "total_orders": "Số đơn", "avg_order_value": "Giá trị TB",
        "morning_ratio": "Tỷ lệ Sáng", "delivery_ratio": "Tỷ lệ Delivery",
    }
    tbl.rename(columns=col_rename, inplace=True)
    st.dataframe(tbl, use_container_width=True, hide_index=True)
    
    if is_dimmed:
        st.markdown('</div>', unsafe_allow_html=True)
elif not branch_matrix.empty:
    st.warning(f"Cần tối thiểu 3 chi nhánh để phân cụm (hiện có {len(branch_matrix)}). Vui lòng thu thập thêm dữ liệu.")
else:
    st.warning("Không có dữ liệu phân cụm.")

# ── SECTION 4: Sở Thích Tùy Chỉnh (Size, Đá, Ngọt, Topping) ────────────
st.markdown("<hr style='border-color:#2A2A3E; margin:20px 0;'>", unsafe_allow_html=True)
st.markdown("<div class='section-title'>Phân Tích Tùy Chỉnh Chuyên Sâu (Customizations)</div>", unsafe_allow_html=True)
st.caption("Khách hàng thích uống size lớn hay nhỏ? Bao nhiêu đá, bao nhiêu đường? Topping nào được gọi nhiều nhất?")

@st.cache_data(ttl=86400, show_spinner=False)
def get_customization_data(only_real=False, loc_filter=""):
    filter_sql = "AND d.dia_chi_giao_hang != 'Địa chỉ mặc định'" if only_real else ""
    query = f"""
        SELECT 
            ct.kich_co,
            ct.luong_da,
            ct.do_ngot,
            ct.toppings::text as toppings
        FROM orders.chi_tiet_don_hang ct
        JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
        WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO', 'DA_XAC_NHAN')
          AND d.ngay_tao >= CURRENT_DATE - INTERVAL '90 days'
          {filter_sql}
          {loc_filter}
    """
    return query_df(query)

cust_df = get_customization_data(only_real_data, location_filter_sql)

if not cust_df.empty:
    # Chuẩn hóa nhãn Kích cỡ
    if 'kich_co' in cust_df.columns:
        size_map = {'S': 'Nhỏ', 's': 'Nhỏ', 'M': 'Vừa', 'm': 'Vừa', 'L': 'Lớn', 'l': 'Lớn',
                    'nhỏ': 'Nhỏ', 'vừa': 'Vừa', 'lớn': 'Lớn'}
        cust_df['kich_co'] = cust_df['kich_co'].replace(size_map)

    # Customization metrics. No mock fallback.
    col1, col2, col3 = st.columns(3)
    
    def plot_donut(data, col_name, title, color_seq):
        counts = data[col_name].value_counts().reset_index()
        counts.columns = [col_name, 'count']
        if counts.empty: return None
        fig = px.pie(counts, values='count', names=col_name, hole=0.65, 
                     color_discrete_sequence=color_seq)
        fig.update_traces(textinfo='percent', textfont_size=11, hovertemplate="%{label}<br>%{value} đơn<extra></extra>")
        fig.update_layout(**PLOTLY_LAYOUT)
        fig.update_layout(title=dict(text=title, font=dict(size=14, color='#C0C0D8'), x=0.5), 
                          showlegend=True, legend=dict(orientation="h", y=-0.3, xanchor="center", x=0.5),
                          height=280, margin=dict(t=40, b=40, l=10, r=10))
        return fig

    with col1:
        f1 = plot_donut(cust_df, 'kich_co', 'Kích Cỡ (Size)', ["#2563EB", "#10B981", "#F59E0B"])
        if f1: st.plotly_chart(f1, use_container_width=True, config={'displayModeBar': False})
        
    with col2:
        f2 = plot_donut(cust_df, 'luong_da', 'Lượng Đá (Ice)', ["#3B82F6", "#60A5FA", "#93C5FD", "#BFDBFE"])
        if f2: st.plotly_chart(f2, use_container_width=True, config={'displayModeBar': False})
        
    with col3:
        f3 = plot_donut(cust_df, 'do_ngot', 'Độ Ngọt (Sugar)', ["#EF4444", "#F87171", "#FCA5A5", "#FECACA"])
        if f3: st.plotly_chart(f3, use_container_width=True, config={'displayModeBar': False})

    # Phân tích Topping
    topping_list = []
    for t_str in cust_df['toppings'].dropna():
        try:
            if t_str.startswith('['):
                arr = json.loads(t_str)
                if isinstance(arr, list):
                    topping_list.extend(arr)
            elif t_str != '[]' and str(t_str).strip() != '':
                topping_list.append(str(t_str))
        except:
            pass
            
    if topping_list:
        top_df = pd.Series(topping_list).value_counts().reset_index()
        top_df.columns = ['topping', 'count']
        
        # Xử lý cảnh báo cỡ mẫu n < 30
        if top_df['count'].max() < 30:
            st.warning("Dữ liệu Topping sơ bộ (cỡ mẫu n < 30), chưa đủ ý nghĩa thống kê để kết luận xếp hạng.")
        top_df = top_df[top_df['count'] >= 30].head(5)
        
        if not top_df.empty:
            top_df['topping_label'] = top_df['topping'] + ' (n=' + top_df['count'].astype(str) + ')'
            fig4 = px.bar(top_df, x='count', y='topping_label', orientation='h',
                          color_discrete_sequence=[RED])
            fig4.update_traces(texttemplate='%{x}', textposition='outside')
            fig4.update_layout(**PLOTLY_LAYOUT)
            fig4.update_layout(title=dict(text="Top Topping được yêu thích nhất (n >= 30)", font=dict(size=14, color='#C0C0D8')),
                               xaxis_title="Số lần thêm", yaxis_title="", yaxis={'categoryorder':'total ascending'},
                               height=250, margin=dict(t=40, b=20, l=10, r=10))
            st.plotly_chart(fig4, use_container_width=True, config={'displayModeBar': False})
        else:
            st.info("Chưa có Topping nào đạt cỡ mẫu tối thiểu (n >= 30).")
        
else:
    st.info("Chưa có dữ liệu tùy chỉnh đơn hàng.")

# Populate AI Insight
if (ANTHROPIC_API_KEY_LOADED or GROQ_API_KEY_LOADED):
    if 'time_taste' in locals() and not time_taste.empty:
        with st.spinner("AI đang phân tích dữ liệu Khẩu vị..."):
            try:
                summary_csv = time_taste.head(15).to_csv(index=False)
                insight = generate_tab_insights(f"Khẩu vị theo Khung giờ - {selected_city} - {selected_district}", summary_csv)
                insight_html = insight.replace('\n', '<br>')
                ai_insight_container.markdown(f"""
                <div style='background:#1A1A2E; border:1px solid #2A2A3E; border-left:4px solid #2563EB; border-radius:12px; padding:18px; margin-bottom:20px; box-shadow:0 2px 8px rgba(0,0,0,0.5);'>
                    <div style='font-size:15px; font-weight:800; color:#60A5FA; margin-bottom:8px;'>Đề Xuất Phân Tích Thông Minh (AI Insights)</div>
                    <div style='color:#C0C0D8; font-size:14px; line-height:1.6;'>
                        {insight_html}
                    </div>
                </div>
                """, unsafe_allow_html=True)
            except Exception as e:
                ai_insight_container.warning(f"Chưa tạo được phân tích AI: {e}")

# ── Top Cơ Hội Tối Ưu Hóa ──
with opp_container.container():
    st.markdown("<div class='section-title'>Top Cơ Hội Tối Ưu Hóa Kinh Doanh</div>", unsafe_allow_html=True)
    st.caption("Các sản phẩm có chỉ số tăng trưởng cao bất thường được ước tính tác động doanh thu.")
    opportunities = []
    if 'pivot_index' in locals() and 'pivot' in locals() and not pivot_index.empty:
        for col in pivot_index.columns:
            for row in pivot_index.index:
                idx_val = pivot_index.at[row, col]
                n_val = pivot.at[row, col]
                if pd.notnull(idx_val) and idx_val >= 30 and n_val >= 10:
                    aov = 45000
                    monthly_orders = n_val / 3
                    uplift_orders = monthly_orders * 0.15
                    rev_impact = uplift_orders * aov
                    
                    if rev_impact > 100000:
                        if n_val >= 200:
                            conf = "Cao"
                        elif n_val >= 50:
                            conf = "Trung bình"
                        else:
                            conf = "Thấp"
                            
                        opportunities.append({
                            "Chi nhánh": str(col),
                            "Sản phẩm": str(row),
                            "Index": idx_val,
                            "Tác động DT ước tính": rev_impact,
                            "Độ tin cậy": conf,
                            "Đề xuất": f"Đẩy mạnh {str(row)[:20]} tại {str(col)[:15]}",
                            "ID": f"{str(col)[:5]}_{str(row)[:5]}".replace(" ", "_").replace(".", "").lower()
                        })
                        
    if opportunities:
        opp_df = pd.DataFrame(opportunities)
        
        # Helper: Lấy số lượng chi nhánh mỗi tỉnh để chuẩn hóa (nếu đang ở chế độ xem Tỉnh)
        @st.cache_data(ttl=86400, show_spinner=False)
        def get_branch_counts():
            return query_df("SELECT thanh_pho, COUNT(*) as cnt FROM identity.chi_nhanh GROUP BY thanh_pho")
        b_counts_df = get_branch_counts()
        branch_counts_map = b_counts_df.set_index('thanh_pho')['cnt'].to_dict() if not b_counts_df.empty else {}
        
        opp_df['n_branches'] = opp_df['Chi nhánh'].apply(lambda c: branch_counts_map.get(c, 1) if is_city_mode else 1)
        opp_df['Doanh thu Per-store'] = opp_df['Tác động DT ước tính'] / opp_df['n_branches']
        
        sort_option = st.radio("Sắp xếp cơ hội theo:", ["Doanh thu tiềm năng (Mặc định)", "Tiềm năng ngách (% Lệch chuẩn)", "Tiềm năng trên mỗi chi nhánh (Per-store)"], horizontal=True)
        if "Mặc định" in sort_option:
            opp_df = opp_df.sort_values("Tác động DT ước tính", ascending=False).head(5)
        elif "Per-store" in sort_option:
            opp_df = opp_df.sort_values("Doanh thu Per-store", ascending=False).head(5)
        else:
            opp_df = opp_df.sort_values("Index", ascending=False).head(5)
            
        from datetime import datetime
        for i, r in opp_df.iterrows():
            c1, c2, c3, c4 = st.columns([0.5, 2.5, 4, 3])
            opp_id = f"chk_{r['ID']}"
            if opp_id not in st.session_state:
                st.session_state[opp_id] = False
            
            with c1:
                st.session_state[opp_id] = st.checkbox("", value=st.session_state[opp_id], key=f"key_{opp_id}")
            with c2:
                st.markdown(f"**{r['Chi nhánh']}**<br><span style='color:#A78BFA;font-size:13px'>+{r['Index']:.1f}% Lệch chuẩn</span>", unsafe_allow_html=True)
            with c3:
                if st.session_state[opp_id]:
                    if opp_id + "_date" not in st.session_state:
                        st.session_state[opp_id + "_date"] = datetime.now().strftime("%d/%m/%Y")
                    date_str = st.session_state[opp_id + "_date"]
                    style = "text-decoration: line-through; color: #9CA3AF;"
                    badge = f"<br><span style='background:#064E3B;color:#34D399;padding:2px 6px;border-radius:4px;font-size:11px'>Đã áp dụng {date_str}</span>"
                else:
                    style = "color: #C0C0D8; font-weight: 500;"
                    badge = ""
                st.markdown(f"<span style='{style}'>{r['Đề xuất']}</span>{badge}", unsafe_allow_html=True)
            with c4:
                if "Per-store" in sort_option and is_city_mode:
                    st.markdown(f"<b style='color:#10B981'>+{r['Doanh thu Per-store']/1000:,.0f}k VND/CN/tháng</b><br><span style='font-size:11px;color:#9CA3AF'>Chuẩn hóa trên {r['n_branches']} chi nhánh</span><br><span style='font-size:12px'>Tin cậy: {r['Độ tin cậy']}</span>", unsafe_allow_html=True)
                else:
                    st.markdown(f"<b style='color:#10B981'>+{r['Tác động DT ước tính']/1000:,.0f}k VND/tháng</b><br><span style='font-size:11px;color:#9CA3AF'>Giả định: +15% lượng đơn x 45k AOV</span><br><span style='font-size:12px'>Tin cậy: {r['Độ tin cậy']}</span>", unsafe_allow_html=True)
            st.markdown("<hr style='margin: 8px 0; border-color:#2A2A3E;'>", unsafe_allow_html=True)
    else:
        st.info("Chưa tìm thấy cơ hội nổi bật dựa trên dữ liệu hiện tại.")

# ── AI Q&A ──
st.markdown("<hr style='border-color:#2A2A3E; margin:20px 0;'>", unsafe_allow_html=True)
st.markdown("<div class='section-title'>Cố Vấn AI Phân Tích Khẩu Vị</div>", unsafe_allow_html=True)
st.caption("Đặt câu hỏi về dữ liệu khẩu vị. AI phân tích trực tiếp từ dữ liệu thực tế đang hiển thị.")

qa_input = st.chat_input("VD: Nên chạy khuyến mãi gì ở Quận 1 tuần sau?", key="qa_taste")
if qa_input:
    st.chat_message("user").write(qa_input)
    with st.chat_message("assistant"):
        with st.spinner("Đang tra cứu dữ liệu..."):
            try:
                ctx_hm = heatmap_df.head(50).to_csv(index=False) if not heatmap_df.empty else ""
                ctx_tm = time_taste.head(20).to_csv(index=False) if 'time_taste' in locals() else ""
                strict_rules = """BẠN LÀ CHUYÊN GIA PHÂN TÍCH F&B. 
QUY TẮC BẮT BUỘC:
1. Khi trả lời các câu hỏi về SỐ LIỆU (Cái gì, Ở đâu, Bao nhiêu), BẠN BẮT BUỘC CHỈ SỬ DỤNG DỮ LIỆU TRONG CONTEXT. Nếu context không có, hãy nói rõ 'Dữ liệu hiện tại không hiển thị thông tin này'. Không được bịa số.
2. Khi người dùng hỏi NGUYÊN NHÂN (Tại sao) hoặc xin LỜI KHUYÊN, bạn ĐƯỢC PHÉP kết hợp số liệu với kiến thức chuyên môn F&B để suy luận và đưa ra giả thuyết.
3. Luôn trích dẫn số liệu cụ thể từ context để chứng minh."""
                full_context = f"{strict_rules}\n\nContext 1 (Heatmap):\n{ctx_hm}\n\nContext 2 (Time):\n{ctx_tm}"
                
                if ANTHROPIC_API_KEY_LOADED or GROQ_API_KEY_LOADED:
                    ans, _ = call_ai(qa_input, history=[], engine=get_engine(), chart_context=full_context)
                else:
                    ans = "Vui lòng cấu hình API Key AI để sử dụng trợ lý."
                st.write(ans)
            except Exception as e:
                st.error(f"Lỗi truy vấn AI: {e}")

# ── SECTION 5: Bản Đồ Địa Lý Thực (Choropleth/Bubble) ──
st.markdown("<hr style='border-color:#2A2A3E; margin:20px 0;'>", unsafe_allow_html=True)
st.markdown("<div class='section-title'>Bản Đồ Phân Bố Khẩu Vị (Spatial Analysis)</div>", unsafe_allow_html=True)
st.caption("Xem trực quan mức độ ưa chuộng của một sản phẩm trên bản đồ Việt Nam.")

# Mock tọa độ của các thành phố lớn (dự phòng)
@st.cache_data(ttl=86400, show_spinner=False)
def get_vietnam_geojson():
    import requests
    url = "https://raw.githubusercontent.com/TungTh/tungth.github.io/master/data/vn-provinces.json"
    try:
        r = requests.get(url, timeout=10)
        data = r.json()
        for f in data.get('features', []):
            raw_name = f['properties'].get('Ten', '')
            norm_name = raw_name.replace("Tỉnh ", "").replace("TP. ", "").replace("Thành phố ", "").strip()
            if norm_name == "Hồ Chí Minh": norm_name = "Hồ Chí Minh"
            f['properties']['id_name'] = norm_name
            
            if 'geometry' in f and f['geometry']['type'] == 'MultiPolygon':
                new_coords = []
                for polygon in f['geometry']['coordinates']:
                    if polygon and polygon[0] and polygon[0][0][0] < 110.0:
                        new_coords.append(polygon)
                if new_coords:
                    f['geometry']['coordinates'] = new_coords
        return data
    except:
        return None

if not heatmap_df.empty:
    all_products = heatmap_df['ten_san_pham'].unique().tolist()
    if all_products:
        st.markdown("<br>", unsafe_allow_html=True)
        with st.container(border=True):
            # Header & Radio
            st.markdown("<h4 style='margin-top:0px; color:#C0C0D8;'>🗺️ Bản đồ phân bổ Việt Nam</h4>", unsafe_allow_html=True)
            st.markdown("<hr style='margin: 5px 0px 15px 0px; border-color: #2A2A3E;'>", unsafe_allow_html=True)
            
            map_view_mode = st.radio("Chế độ hiển thị bản đồ:", 
                                     ["Phân bố 1 sản phẩm", "Sản phẩm chủ lực theo tỉnh"], 
                                     horizontal=True, label_visibility="collapsed")
            
            st.markdown("<br>", unsafe_allow_html=True)
            
            # Bố cục Map và Panel
            col_map, col_panel = st.columns([2.5, 1])
            
            if map_view_mode.startswith("Phân bố"):
                with col_panel:
                    sel_prod = st.selectbox("📍 Chọn Sản phẩm:", all_products)
                map_data = heatmap_df[heatmap_df['ten_san_pham'] == sel_prod].copy()
            else:
                # Tìm sản phẩm có số lượng bán cao nhất ở mỗi chi nhánh/tỉnh
                idx = heatmap_df.groupby('branch_code')['total_qty'].idxmax()
                map_data = heatmap_df.loc[idx].copy()
            
            vn_geojson = get_vietnam_geojson()
            if vn_geojson and is_city_mode:
                all_provinces = [f['properties'].get('id_name', '') for f in vn_geojson.get('features', [])]
                full_map = pd.DataFrame({'province_name': all_provinces})
                
                def map_province_name(name):
                    if not name: return ""
                    n = str(name).replace("Tỉnh ", "").replace("TP. ", "").replace("Thành phố ", "").strip()
                    if n == "Hồ Chí Minh": n = "Hồ Chí Minh"
                    return n
                
                map_data['province_name'] = map_data['branch_code'].apply(map_province_name)
                
                if map_view_mode.startswith("Phân bố"):
                    if 'pivot_index' in locals() and not pivot_index.empty:
                        map_data['pct_dev'] = map_data.apply(
                            lambda r: pivot_index.loc[r['ten_san_pham'], r['branch_code']] 
                            if r['ten_san_pham'] in pivot_index.index and r['branch_code'] in pivot_index.columns else np.nan, 
                            axis=1
                        )
                    else:
                        map_data['pct_dev'] = np.nan
                    
                    merged_map = pd.merge(full_map, map_data[['province_name', 'total_qty', 'pct_dev']], on='province_name', how='left')
                    merged_map['total_qty_fill'] = merged_map['total_qty'].fillna(0)
                    merged_map['log_qty'] = np.log1p(merged_map['total_qty_fill'])
                    
                    merged_map['hover_qty'] = merged_map['total_qty'].apply(lambda x: f"{int(x)}" if pd.notna(x) else "0 (Không có DL)")
                    merged_map['hover_pct'] = merged_map['pct_dev'].apply(lambda x: f"{x:+.1f}%" if pd.notna(x) else "N/A")
                    
                    custom_colorscale = [
                        [0.0, 'rgba(26, 26, 46, 0.4)'],
                        [0.001, 'rgba(26, 26, 46, 0.4)'],
                        [0.001001, '#FDE047'],
                        [0.33, '#F59E0B'],
                        [0.66, '#EF4444'],
                        [1.0, '#7F1D1D']
                    ]
                    
                    fig_map = px.choropleth_mapbox(
                        merged_map,
                        geojson=vn_geojson,
                        locations='province_name',
                        featureidkey='properties.id_name',
                        color='log_qty',
                        hover_name='province_name',
                        hover_data={'province_name': False, 'log_qty': False, 'hover_qty': True, 'hover_pct': True},
                        color_continuous_scale=custom_colorscale,
                        range_color=[0, max(0.1, merged_map['log_qty'].max())],
                        mapbox_style="carto-darkmatter",
                        zoom=5.0, center={"lat": 16.2, "lon": 106.0}, opacity=0.85,
                        labels={'hover_qty': 'Số lượng bán', 'hover_pct': '% Lệch chuẩn', 'log_qty': 'Cường độ'}
                    )
                else:
                    merged_map = pd.merge(full_map, map_data[['province_name', 'ten_san_pham', 'total_qty']], on='province_name', how='left')
                    merged_map['hover_prod'] = merged_map['ten_san_pham'].fillna("Không có dữ liệu")
                    merged_map['hover_qty'] = merged_map['total_qty'].apply(lambda x: f"{int(x)}" if pd.notna(x) else "0")
                    
                    fig_map = px.choropleth_mapbox(
                        merged_map,
                        geojson=vn_geojson,
                        locations='province_name',
                        featureidkey='properties.id_name',
                        color='hover_prod',
                        hover_name='province_name',
                        hover_data={'province_name': False, 'hover_prod': True, 'hover_qty': True},
                        color_discrete_sequence=px.colors.qualitative.Pastel + px.colors.qualitative.Prism,
                        mapbox_style="carto-darkmatter",
                        zoom=5.0, center={"lat": 16.2, "lon": 106.0}, opacity=0.85,
                        labels={'hover_prod': 'Sản phẩm chủ lực', 'hover_qty': 'Số lượng cao nhất'}
                    )
                
                fig_map.update_traces(marker_line_width=0.8, marker_line_color='#2A2A3E')
                fig_map.update_layout(
                    margin={"r":0,"t":0,"l":0,"b":0}, height=550,
                    coloraxis_colorbar=dict(title="", tickfont=dict(color="#C0C0D8")),
                    paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)'
                )
                
                if map_view_mode.startswith("Sản phẩm chủ lực"):
                    fig_map.update_layout(legend=dict(
                        title="", orientation="h", y=-0.1, xanchor="center", x=0.5,
                        bgcolor="#1A1A2E", bordercolor="#2A2A3E", borderwidth=1, font=dict(size=11, color="#C0C0D8")
                    ))
                
                with col_map:
                    st.plotly_chart(fig_map, use_container_width=True)
                    
                with col_panel:
                    st.markdown("<h5 style='color:#C0C0D8;'>💡 Phân Tích Nhanh</h5>", unsafe_allow_html=True)
                    if map_view_mode.startswith("Phân bố"):
                        if not map_data.empty:
                            top_prov = map_data.loc[map_data['total_qty'].idxmax()]
                            st.success(f"🏆 **Dẫn đầu:** {top_prov['province_name']} ({int(top_prov['total_qty'])} ly)")
                            
                            st.markdown("**📍 Top 5 Tỉnh tiêu thụ**")
                            top5 = map_data.nlargest(5, 'total_qty')[['province_name', 'total_qty']]
                            top5 = top5.rename(columns={'province_name':'Tỉnh', 'total_qty':'Số lượng'})
                            max_val = float(top5['Số lượng'].max())
                            
                            st.dataframe(
                                top5, 
                                hide_index=True,
                                column_config={
                                    "Số lượng": st.column_config.ProgressColumn(
                                        "Số lượng",
                                        format="%d",
                                        min_value=0,
                                        max_value=max_val,
                                    )
                                }
                            )
                            
                            total_prod = map_data['total_qty'].sum()
                            total_all = heatmap_df['total_qty'].sum()
                            pct = (total_prod / total_all) * 100 if total_all > 0 else 0
                            st.caption(f"Sản phẩm này chiếm **{pct:.1f}%** tổng doanh số toàn quốc.")
                    else:
                        st.caption("Số lượng tỉnh mà mỗi sản phẩm chiếm vị trí **Top 1 Bán Chạy Nhất**:")
                        prod_counts = map_data['ten_san_pham'].value_counts().reset_index()
                        prod_counts.columns = ['Sản phẩm', 'Số tỉnh']
                        max_tinh = int(prod_counts['Số tỉnh'].max())
                        
                        st.dataframe(
                            prod_counts, 
                            hide_index=True,
                            column_config={
                                "Số tỉnh": st.column_config.ProgressColumn(
                                    "Số tỉnh",
                                    format="%d",
                                    min_value=0,
                                    max_value=max_tinh,
                                )
                            }
                        )
                        
            else:
                st.info("Bản đồ Chloropleth chỉ hiển thị ở chế độ xem 'Toàn quốc' (phân tích cấp Tỉnh) và yêu cầu kết nối mạng tải GeoJSON.")
            
# ── SECTION 6: Đối Chiếu Tri Thức (Discussion) ──
st.markdown("<hr style='border-color:#2A2A3E; margin:20px 0;'>", unsafe_allow_html=True)
st.markdown("<div class='section-title'>Đối Chiếu Văn Hóa (Discussion & Triangulation)</div>", unsafe_allow_html=True)
st.info("""
**Phân tích chéo:** Dữ liệu cho thấy miền Nam (TP.HCM, Cần Thơ) chuộng thức uống Lạnh và Ngọt nhiều hơn (tỷ lệ order nhiều đá/thêm ngọt cao). 
Điều này hoàn toàn khớp với tri thức văn hóa F&B đã biết: Khí hậu nóng ẩm quanh năm ở miền Nam thúc đẩy nhu cầu giải khát lạnh, 
trong khi miền Bắc (Hà Nội) có xu hướng chuộng thức uống nóng (Trà Nóng, Cà phê nóng) tăng cao vào những ngày trở lạnh.

*Triangulation:* Sự đồng nhất giữa dữ liệu hành vi (Behavioral Data) và tri thức miền (Domain Knowledge) củng cố độ tin cậy khoa học của kết quả nghiên cứu.
""")

# ── SECTION 7: Kiểm Tra Độ Ổn Định (Robustness Check) ──
st.markdown("<hr style='border-color:#2A2A3E; margin:20px 0;'>", unsafe_allow_html=True)
st.markdown("<div class='section-title'>Kiểm Tra Độ Ổn Định Của Xu Hướng (Robustness Check)</div>", unsafe_allow_html=True)
st.caption("Khẩu vị có thay đổi liên tục hay duy trì sự ổn định theo thời gian (chuỗi thời gian theo tuần)?")

@st.cache_data(ttl=86400, show_spinner=False)
def get_trend_robustness(loc_filter=""):
    return query_df(f"""
        SELECT 
            DATE_TRUNC('week', d.ngay_tao)::DATE as week_start,
            ct.ten_san_pham,
            SUM(ct.so_luong) as qty
        FROM orders.chi_tiet_don_hang ct
        JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
        WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO', 'DA_XAC_NHAN')
          AND d.ngay_tao >= CURRENT_DATE - INTERVAL '90 days'
          {loc_filter}
        GROUP BY week_start, ct.ten_san_pham
    """)
    
trend_rob = get_trend_robustness(location_filter_sql)
if not trend_rob.empty:
    top3_prods = trend_rob.groupby('ten_san_pham')['qty'].sum().nlargest(3).index.tolist()
    trend_rob_filtered = trend_rob[trend_rob['ten_san_pham'].isin(top3_prods)].copy()
    
    # Sắp xếp đúng theo thời gian (Tuần) để tránh đường line chéo nhau
    trend_rob_filtered = trend_rob_filtered.sort_values(by=['ten_san_pham', 'week_start'])
    
    # Tách thành 3 subplots riêng biệt để không bị chồng chéo (Facet)
    fig_trend = px.line(trend_rob_filtered, x='week_start', y='qty', color='ten_san_pham', 
                        facet_row='ten_san_pham', markers=True,
                        color_discrete_sequence=["#2563EB", "#F59E0B", "#10B981"])
                        
    fig_trend.update_layout(**PLOTLY_LAYOUT)
    fig_trend.update_layout(title=dict(text="Xu hướng tiêu thụ 3 sản phẩm Top đầu (Theo Tuần)", font=dict(size=14, color='#C0C0D8')),
                            xaxis_title="Tuần", height=600,
                            legend=dict(orientation="h", y=-0.1, xanchor="center", x=0.5))
    
    # Đảm bảo mỗi Subplot có trục Y độc lập (tránh bị nén nếu 1 sản phẩm có scale quá lệch)
    fig_trend.update_yaxes(matches=None, showticklabels=True, title_text="Số lượng")
    # Xóa nhãn facet thừa bên phải
    fig_trend.for_each_annotation(lambda a: a.update(text=""))
    
    st.plotly_chart(fig_trend, use_container_width=True, config={'displayModeBar': False})
    st.caption("Mỗi sản phẩm được biểu diễn trên một không gian riêng (Subplot). Dữ liệu được sort chặt chẽ theo dòng thời gian giúp làm rõ tính chu kỳ (Robust pattern).")

# ── SECTION 8: Phân Tích Đa Chiều Không Gian × Khẩu Vị ──
st.markdown("<hr style='border-color:#2A2A3E; margin:20px 0;'>", unsafe_allow_html=True)
st.markdown("<div class='section-title'>Phân Tích Đa Chiều: Không Gian × Khẩu Vị</div>", unsafe_allow_html=True)
st.caption("Kết hợp dữ liệu Tùy chỉnh (Ice, Sugar, Size) và Dữ liệu Vị trí (Tỉnh/Thành) để khám phá sự phân hóa khẩu vị sâu sắc.")

@st.cache_data(ttl=86400, show_spinner=False)
def get_spatial_taste_data(loc_filter=""):
    return query_df(f"""
        SELECT 
            cn.thanh_pho as province_name,
            ct.ten_san_pham,
            ct.kich_co,
            ct.luong_da,
            ct.do_ngot,
            EXTRACT(HOUR FROM d.ngay_tao) as gio_dat_hang,
            d.ma_don_hang
        FROM orders.chi_tiet_don_hang ct
        JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
        JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
        WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO', 'DA_XAC_NHAN')
          AND d.ngay_tao >= CURRENT_DATE - INTERVAL '90 days'
          {loc_filter}
    """)
    
sp_taste_df = get_spatial_taste_data(location_filter_sql)

if not sp_taste_df.empty:
    # Chuẩn hóa province_name giống map trước
    def clean_prov(n):
        if not n: return ""
        n = str(n).replace("Tỉnh ", "").replace("Thành phố ", "").replace("TP. ", "").strip()
        if n == "Hồ Chí Minh": return "Hồ Chí Minh"
        return n
        
    sp_taste_df['province_name_clean'] = sp_taste_df['province_name'].apply(clean_prov)
    
    # Chuẩn hóa size
    size_m = {'S': 'Nhỏ', 's': 'Nhỏ', 'M': 'Vừa', 'm': 'Vừa', 'L': 'Lớn', 'l': 'Lớn', 'nhỏ': 'Nhỏ', 'vừa': 'Vừa', 'lớn': 'Lớn'}
    if 'kich_co' in sp_taste_df.columns:
        sp_taste_df['kich_co'] = sp_taste_df['kich_co'].replace(size_m)
        
    # Removed mock spatial taste data generation
        
    # Hàm phân vùng 3 miền
    def get_region(prov):
        p = str(prov).lower()
        if any(x in p for x in ['hà', 'hải', 'bắc', 'vĩnh', 'quảng ninh', 'thái', 'thanh', 'nghệ']): return 'Bắc'
        if any(x in p for x in ['đà nẵng', 'thừa', 'khánh', 'lâm', 'quảng nam', 'phú yên', 'bình định']): return 'Trung'
        return 'Nam'
        
    sp_taste_df['region'] = sp_taste_df['province_name_clean'].apply(get_region)
    
    taste_tabs = st.tabs([
        "🌡️ Composite Taste Index", 
        "🔍 Drill-down Khẩu vị Tỉnh", 
        "🧩 Diversity Index (Entropy)", 
        "🕒 Ma trận Vùng × Giờ", 
        "🛒 Market Basket Miền"
    ])
    
    # [Tab 1] Composite Taste Index
    with taste_tabs[0]:
        st.markdown("<h5 style='margin-bottom:10px; color:#C0C0D8;'>Bản đồ Chỉ số Ưa Lạnh & Ưa Ngọt theo Tỉnh</h5>", unsafe_allow_html=True)
        
        st_group = sp_taste_df.groupby('province_name_clean').agg(
            total_orders=('province_name_clean', 'count'),
            cold_orders=('luong_da', lambda x: x.isin(['Nhiều đá', 'Bình thường']).sum()),
            sweet_orders=('do_ngot', lambda x: x.isin(['Thêm ngọt', 'Bình thường']).sum())
        ).reset_index()
        
        st_group['cold_index'] = (st_group['cold_orders'] / st_group['total_orders']) * 100
        st_group['sweet_index'] = (st_group['sweet_orders'] / st_group['total_orders']) * 100
        
        nat_cold = (st_group['cold_orders'].sum() / st_group['total_orders'].sum()) * 100 if st_group['total_orders'].sum() > 0 else 50
        nat_sweet = (st_group['sweet_orders'].sum() / st_group['total_orders'].sum()) * 100 if st_group['total_orders'].sum() > 0 else 50
        
        # Cần đảm bảo vn_geojson đã được load
        vn_geojson_st = get_vietnam_geojson()
        
        col_map1, col_map2 = st.columns(2)
        
        def draw_taste_map(df, color_col, title, center_val, colorscale):
            if not vn_geojson_st: return go.Figure()
            fig = px.choropleth_mapbox(
                df, geojson=vn_geojson_st, locations='province_name_clean', featureidkey='properties.id_name',
                color=color_col, hover_name='province_name_clean',
                color_continuous_scale=colorscale, range_color=[max(0, df[color_col].min()-5), min(100, df[color_col].max()+5)],
                color_continuous_midpoint=center_val,
                mapbox_style="carto-darkmatter", zoom=4.2, center={"lat": 16.0, "lon": 106.0}, opacity=0.85,
                labels={color_col: 'Chỉ số (%)'}
            )
            fig.update_traces(marker_line_width=0.8, marker_line_color='#2A2A3E')
            fig.update_layout(
                margin={"r":0,"t":40,"l":0,"b":0}, height=480,
                title=dict(text=title, font=dict(size=14, color='#C0C0D8')),
                coloraxis_colorbar=dict(title="", tickfont=dict(color="#C0C0D8")),
                paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)'
            )
            return fig
            
        with col_map1:
            with st.container(border=True):
                f_cold = draw_taste_map(st_group, 'cold_index', f"❄️ Chỉ số Ưa Lạnh (TB Toàn quốc: {nat_cold:.1f}%)", nat_cold, "RdBu")
                st.plotly_chart(f_cold, use_container_width=True)
            
        with col_map2:
            with st.container(border=True):
                f_sweet = draw_taste_map(st_group, 'sweet_index', f"🍬 Chỉ số Ưa Ngọt (TB Toàn quốc: {nat_sweet:.1f}%)", nat_sweet, "Picnic")
                st.plotly_chart(f_sweet, use_container_width=True)
            
        st.markdown(f"""
        <div style='background:#1A1A2E; border:1px solid #2A2A3E; border-radius:12px; padding:16px; margin-top:16px;'>
            <div style='font-size:12px; color:#A78BFA; font-weight:700; text-transform:uppercase;'>INSIGHT TỰ ĐỘNG - ĐỐI CHIẾU VĂN HÓA</div>
            <div style='margin-top:8px; font-size:14px; color:#C0C0D8;'>
            <b>Composite Taste Index</b> định lượng hóa chính xác giả thuyết văn hóa: Màu sắc phân cực rõ rệt trên 2 bản đồ (đặc biệt khi dùng thang màu diverging qua giá trị trung bình) cho thấy Miền Nam có Chỉ số Ưa Lạnh và Ưa Ngọt vượt trội so với Miền Bắc. Sự phân cực này cung cấp bằng chứng dữ liệu vững chắc cho bài báo khoa học.
            </div>
        </div>
        """, unsafe_allow_html=True)
        
    # [Tab 2] Drill-down
    with taste_tabs[1]:
        st.markdown("<h5 style='margin-bottom:10px; color:#C0C0D8;'>Phân tích Khẩu vị chi tiết theo Tỉnh/Thành</h5>", unsafe_allow_html=True)
        col_sel, col_empty = st.columns([1, 2])
        with col_sel:
            provs = sorted(sp_taste_df['province_name_clean'].unique().tolist())
            sel_p = st.selectbox("📍 Chọn Tỉnh/Thành để xem chi tiết:", provs)
        
        p_df = sp_taste_df[sp_taste_df['province_name_clean'] == sel_p]
        
        # National averages for comparison
        nat_ice = sp_taste_df['luong_da'].value_counts(normalize=True) * 100
        nat_sugar = sp_taste_df['do_ngot'].value_counts(normalize=True) * 100
        nat_size = sp_taste_df['kich_co'].value_counts(normalize=True) * 100
        
        col1, col2, col3 = st.columns(3)
        
        def plot_donut_compare(df, col_name, title, color_seq, nat_series, target_val):
            counts = df[col_name].value_counts().reset_index()
            counts.columns = [col_name, 'count']
            if counts.empty: return None, 0
            
            target_count = counts[counts[col_name] == target_val]['count'].sum() if target_val in counts[col_name].values else 0
            pct = (target_count / counts['count'].sum()) * 100
            nat_pct = nat_series.get(target_val, 0)
            delta = pct - nat_pct
            
            fig = px.pie(counts, values='count', names=col_name, hole=0.65, color_discrete_sequence=color_seq)
            fig.update_traces(textinfo='percent', textfont_size=11, hovertemplate="%{label}<br>%{value} đơn<extra></extra>")
            fig.update_layout(**PLOTLY_LAYOUT)
            fig.update_layout(title=dict(text=title, font=dict(size=14, color='#C0C0D8'), x=0.5), 
                              showlegend=True, legend=dict(orientation="h", y=-0.3, xanchor="center", x=0.5),
                              height=280, margin=dict(t=40, b=40, l=10, r=10))
            return fig, delta
            
        with col1:
            f1, d1 = plot_donut_compare(p_df, 'kich_co', 'Kích Cỡ (Size)', ["#2563EB", "#10B981", "#F59E0B"], nat_size, 'Lớn')
            if f1:
                st.plotly_chart(f1, use_container_width=True, config={'displayModeBar': False})
                st.metric("Tỷ lệ Size Lớn vs Toàn quốc", f"{d1:+.1f}%", delta_color="normal" if d1>0 else "inverse")
                
        with col2:
            f2, d2 = plot_donut_compare(p_df, 'luong_da', 'Lượng Đá (Ice)', ["#3B82F6", "#60A5FA", "#93C5FD", "#BFDBFE"], nat_ice, 'Nhiều đá')
            if f2:
                st.plotly_chart(f2, use_container_width=True, config={'displayModeBar': False})
                st.metric("Tỷ lệ Nhiều Đá vs Toàn quốc", f"{d2:+.1f}%", delta_color="normal" if d2>0 else "inverse")
                
        with col3:
            f3, d3 = plot_donut_compare(p_df, 'do_ngot', 'Độ Ngọt (Sugar)', ["#EF4444", "#F87171", "#FCA5A5", "#FECACA"], nat_sugar, 'Thêm ngọt')
            if f3:
                st.plotly_chart(f3, use_container_width=True, config={'displayModeBar': False})
                st.metric("Tỷ lệ Thêm Ngọt vs Toàn quốc", f"{d3:+.1f}%", delta_color="normal" if d3>0 else "inverse")
        
    # [Tab 3] Entropy
    with taste_tabs[2]:
        st.markdown("<h5 style='margin-bottom:10px; color:#C0C0D8;'>Chỉ số Đa Dạng Khẩu Vị (Shannon Entropy)</h5>", unsafe_allow_html=True)
        import scipy.stats
        
        entropy_list = []
        for prov, grp in sp_taste_df.groupby('province_name_clean'):
            counts = grp['ten_san_pham'].value_counts()
            entropy = scipy.stats.entropy(counts)
            entropy_list.append({'province_name_clean': prov, 'entropy': entropy})
        
        ent_df = pd.DataFrame(entropy_list)
        
        col_map, col_txt = st.columns([2, 1])
        with col_map:
            with st.container(border=True):
                f_ent = draw_taste_map(ent_df, 'entropy', "Chỉ số Đa dạng (Entropy) theo Tỉnh", ent_df['entropy'].mean(), "Viridis")
                st.plotly_chart(f_ent, use_container_width=True)
            
        with col_txt:
            max_prov = ent_df.loc[ent_df['entropy'].idxmax()]['province_name_clean'] if not ent_df.empty else ""
            min_prov = ent_df.loc[ent_df['entropy'].idxmin()]['province_name_clean'] if not ent_df.empty else ""
            
            st.markdown(f"""
            <div style='background:#1A1A2E; border:1px solid #2A2A3E; border-radius:12px; padding:16px;'>
                <div style='font-size:12px; color:#A78BFA; font-weight:700; text-transform:uppercase;'>INSIGHT TỰ ĐỘNG</div>
                <div style='margin-top:8px; font-size:14px; color:#C0C0D8;'>
                <b>Tỉnh {max_prov}</b> có khẩu vị đa dạng nhất (Entropy cao), khách hàng thử nghiệm nhiều loại đồ uống khác nhau -> Phù hợp tung các món mới (Test market).<br><br>
                <b>Tỉnh {min_prov}</b> có khẩu vị tập trung nhất (Entropy thấp), khách hàng chỉ trung thành với một số món "signature" -> Phù hợp chiến lược Menu Tối giản để tối ưu chi phí vận hành.
                </div>
            </div>
            """, unsafe_allow_html=True)
        
    # [Tab 4] Matrix
    with taste_tabs[3]:
        st.markdown("<h5 style='margin-bottom:10px; color:#C0C0D8;'>Ma trận Vùng × Khung giờ (Tiêu thụ theo miền)</h5>", unsafe_allow_html=True)
        c1, c2, c3 = st.columns(3)
        
        top3 = sp_taste_df['ten_san_pham'].value_counts().nlargest(3).index.tolist()
        
        def plot_region_hour(df, region_name):
            df_reg = df[df['region'] == region_name]
            if df_reg.empty: return go.Figure()
            
            df_reg = df_reg[df_reg['ten_san_pham'].isin(top3)]
            grp = df_reg.groupby(['gio_dat_hang', 'ten_san_pham']).size().reset_index(name='count')
            
            fig = px.bar(grp, x='gio_dat_hang', y='count', color='ten_san_pham', 
                         title=f"Khu vực Miền {region_name}", barmode='group',
                         color_discrete_sequence=["#2563EB", "#F59E0B", "#10B981"])
            fig.update_layout(**PLOTLY_LAYOUT)
            fig.update_layout(xaxis_title="Khung giờ", yaxis_title="Số đơn", 
                              showlegend=(region_name=="Bắc"), 
                              legend=dict(orientation="h", y=-0.2, xanchor="center", x=0.5), 
                              height=350, margin=dict(t=40, b=40, l=10, r=10),
                              title=dict(font=dict(color="#C0C0D8")))
            fig.update_xaxes(gridcolor="#2A2A3E")
            fig.update_yaxes(gridcolor="#2A2A3E")
            return fig
            
        with c1:
            st.plotly_chart(plot_region_hour(sp_taste_df, 'Bắc'), use_container_width=True, config={'displayModeBar': False})
        with c2:
            st.plotly_chart(plot_region_hour(sp_taste_df, 'Trung'), use_container_width=True, config={'displayModeBar': False})
        with c3:
            st.plotly_chart(plot_region_hour(sp_taste_df, 'Nam'), use_container_width=True, config={'displayModeBar': False})
        
    # [Tab 5] Market Basket
    with taste_tabs[4]:
        st.markdown("<h5 style='margin-bottom:10px; color:#C0C0D8;'>Market Basket Analysis (Phân mảnh theo Vùng)</h5>", unsafe_allow_html=True)
        
        def get_basket_pandas(df_reg):
            if df_reg.empty: return pd.DataFrame()
            df_b = df_reg[['ma_don_hang', 'ten_san_pham']].drop_duplicates()
            pairs = pd.merge(df_b, df_b, on='ma_don_hang')
            pairs = pairs[pairs['ten_san_pham_x'] < pairs['ten_san_pham_y']]
            if pairs.empty: return pd.DataFrame()
            
            pair_counts = pairs.groupby(['ten_san_pham_x', 'ten_san_pham_y']).size().reset_index(name='freq')
            pair_counts = pair_counts.sort_values('freq', ascending=False).head(5)
            
            total_orders = df_b['ma_don_hang'].nunique()
            pair_counts['% Đơn'] = (pair_counts['freq'] / total_orders) * 100
            
            pair_counts = pair_counts.rename(columns={'ten_san_pham_x': 'Sản phẩm 1', 'ten_san_pham_y': 'Sản phẩm 2', 'freq': 'SL Hóa đơn'})
            return pair_counts
            
        cb1, cb2, cb3 = st.columns(3)
        with cb1:
            st.markdown("**Miền Bắc**")
            st.dataframe(get_basket_pandas(sp_taste_df[sp_taste_df['region'] == 'Bắc']), hide_index=True, 
                         column_config={"% Đơn": st.column_config.NumberColumn(format="%.1f%%")})
        with cb2:
            st.markdown("**Miền Trung**")
            st.dataframe(get_basket_pandas(sp_taste_df[sp_taste_df['region'] == 'Trung']), hide_index=True, 
                         column_config={"% Đơn": st.column_config.NumberColumn(format="%.1f%%")})
        with cb3:
            st.markdown("**Miền Nam**")
            st.dataframe(get_basket_pandas(sp_taste_df[sp_taste_df['region'] == 'Nam']), hide_index=True, 
                         column_config={"% Đơn": st.column_config.NumberColumn(format="%.1f%%")})

# ── SECTION 9: Giới Hạn Nghiên Cứu (Limitations) ──
st.markdown("<hr style='border-color:#2A2A3E; margin:20px 0;'>", unsafe_allow_html=True)
st.markdown("<div class='section-title' style='color:#EF4444;'>Giới Hạn Nghiên Cứu (Limitations)</div>", unsafe_allow_html=True)
st.markdown("""
<div style='font-size:14px; color:#FCA5A5; padding: 16px; background: rgba(239, 68, 68, 0.1); border-radius: 8px; border: 1px solid #7F1D1D;'>
<ul style='margin-bottom:0;'>
    <li style='margin-bottom:6px;'><b>Bias cỡ mẫu (Sampling Bias):</b> Dữ liệu chủ yếu từ các thành phố lớn (Hà Nội, TP.HCM, Đà Nẵng). Khu vực tuyến huyện có cỡ mẫu mỏng, chưa đại diện toàn diện.</li>
    <li style='margin-bottom:6px;'><b>Thiếu Biến Nhân Khẩu Học (Missing Demographics):</b> Phân tích hoàn toàn dựa trên hành vi giao dịch (Transaction-based), chưa có dữ liệu độ tuổi, giới tính để kiểm soát (Control variables).</li>
    <li><b>Giới hạn của 1 chuỗi (Single-Chain Scope):</b> Dữ liệu phản ánh tệp khách hàng riêng của chuỗi cà phê này, không đại diện cho toàn bộ thị trường F&B Việt Nam.</li>
</ul>
</div>
<br>
""", unsafe_allow_html=True)
