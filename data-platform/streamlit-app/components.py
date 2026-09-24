import streamlit as st
import sqlalchemy
from datetime import datetime

from utils import get_engine, minio_status, kafka_status, read_gold_json
from styles import render_status_badge

@st.cache_data(ttl=300, show_spinner=False)
def _cached_pg_status():
    """Kiểm tra PostgreSQL - cache 5 phút, không check lại mỗi lần đổi tab."""
    engine = get_engine()
    if not engine:
        return False
    try:
        with engine.connect() as c:
            c.execute(sqlalchemy.text("SELECT 1"))
        return True
    except Exception:
        return False

@st.cache_data(ttl=300, show_spinner=False)
def _cached_minio_status():
    return minio_status()

@st.cache_data(ttl=300, show_spinner=False)
def _cached_kafka_status():
    return kafka_status()

def check_password():
    if "password_correct" not in st.session_state:
        st.session_state["password_correct"] = False

    if not st.session_state["password_correct"]:
        st.markdown("<br><br><br>", unsafe_allow_html=True)
        st.markdown("<h1 style='text-align: center; color: #FF4757;'>Avengers Coffee Data Platform</h1>", unsafe_allow_html=True)
        st.markdown("<h3 style='text-align: center; color: #C0C0D8;'>Hệ thống Quản trị & Phân tích Dữ liệu Nội bộ</h3>", unsafe_allow_html=True)
        st.markdown("<p style='text-align: center; color: #64748B;'>Dành riêng cho Ban Giám Đốc (C-Level) và Data Analysts.</p>", unsafe_allow_html=True)
        
        col1, col2, col3 = st.columns([1, 1.2, 1])
        with col2:
            with st.form("login_form"):
                st.text_input("👤 Tên đăng nhập", key="username")
                st.text_input("🔑 Mật khẩu", type="password", key="password")
                submit = st.form_submit_button("Đăng nhập vào Hệ thống", type="primary", use_container_width=True)
                
                if submit:
                    if st.session_state["username"] == "admin" and st.session_state["password"] == "avengers2026":
                        st.session_state["password_correct"] = True
                        st.rerun()
                    else:
                        st.error("❌ Sai tên đăng nhập hoặc mật khẩu! Vui lòng thử lại.")
        return False
    return True

def render_sidebar():
    if not check_password():
        st.stop()
        
    with st.sidebar:
        st.markdown("""
        <div style='padding: 18px 4px 14px; margin-bottom: 16px; border-bottom: 1px solid #E4E6EB;'>
          <div style='display:flex; align-items:center; gap:10px;'>
            <div style='background:#B91C1C; border-radius:10px; width:36px; height:36px;
                        display:flex; align-items:center; justify-content:center; flex-shrink:0;'>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 8h1a4 4 0 1 1 0 8h-1"></path>
                <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"></path>
                <line x1="6" y1="2" x2="6" y2="4"></line>
                <line x1="10" y1="2" x2="10" y2="4"></line>
                <line x1="14" y1="2" x2="14" y2="4"></line>
              </svg>
            </div>
            <div>
              <div style='font-size:15px; font-weight:900; color:#0D0D0D; letter-spacing:-0.3px; line-height:1.2;'>Avengers Coffee</div>
              <div style='font-size:10px; color:#9095A1; font-weight:600; letter-spacing:1px; text-transform:uppercase;'>Data Platform & AI</div>
            </div>
          </div>
        </div>
        """, unsafe_allow_html=True)

        pages_nav = [
            ("pages/01_Tong_Quan.py", "Tổng Quan", "📊"),
            ("pages/02_Doanh_Thu.py", "Doanh Thu", "💰"),
            ("pages/03_San_Pham.py", "Sản Phẩm", "☕"),
            ("pages/04_Khach_Hang.py", "Khách Hàng", "👥"),
            ("pages/05_Shipper_Giao_Hang.py", "Shipper Giao Hàng", "🛵"),
            ("pages/06_Tro_Ly_Ao_AI.py", "Trợ Lý Ảo AI", "🤖"),
            ("pages/07_Khau_Vi_So_Thich.py", "Khẩu Vị Sở Thích", "👅"),
            ("pages/08_Kham_Pha_Du_Lieu.py", "Khám Phá Dữ Liệu", "🔍"),
            ("pages/09_Kien_Truc_He_Thong.py", "Kiến Trúc Hệ Thống", "⚙️"),
            ("pages/10_Doi_Soat_Dong_Tien.py", "Cảnh Báo Rủi Ro", "💵"),
            ("pages/11_Suc_Khoe_Nhuong_Quyen.py", "Hiệu Quả Nhượng Quyền", "🏪"),
            ("pages/12_PnL_Cash_Runway.py", "Tài Chính & Lợi Nhuận", "📈"),
            ("pages/13_Kiosk_Health_Map.py", "Bản Đồ Cửa Hàng", "🗺️"),
            ("pages/14_AI_Module_Builder.py", "AI Module Builder", None),
        ]
        
        st.markdown("<div style='font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:#9095A1; margin-bottom:6px; padding-left:4px;'>Phân Tích</div>", unsafe_allow_html=True)
        for path, label, icon in pages_nav:
            st.page_link(path, label=label, icon=None)
            
        st.markdown("<hr style='border-color:#E4E6EB; margin:14px 0'>", unsafe_allow_html=True)

        st.markdown("<div style='font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:#9095A1; margin-bottom:6px; padding-left:4px;'>Trạng Thái Hệ Thống</div>", unsafe_allow_html=True)
        if _cached_pg_status():
            render_status_badge("PostgreSQL Hoạt động", "success")
        else:
            render_status_badge("PostgreSQL Gián đoạn", "error")

        ms = _cached_minio_status()
        if ms["connected"]:
            render_status_badge(f'MinIO Lakehouse ({ms.get("buckets",0)} buckets)', "success")
        else:
            render_status_badge("MinIO Đang kết nối...", "warning")

        ks = _cached_kafka_status()
        if ks["connected"]:
            render_status_badge(f'Kafka Cluster ({ks.get("topics",0)} topics)', "success")
        else:
            err_msg = ks.get("error", "Unknown Error")
            render_status_badge(f'Kafka lỗi: {err_msg[:30]}...', "warning")

        st.markdown("<hr style='border-color:#2A2A3E; margin:16px 0'>", unsafe_allow_html=True)

        gold_meta = read_gold_json("pipeline_meta/latest.json")
        if gold_meta and isinstance(gold_meta, dict):
            st.markdown(f"<div style='font-size:13px; color:#C0C0D8;'><b>Lần chạy Data Pipeline cuối:</b><br><code style='background:#1A1A2E; color:#FF4757; padding:2px 6px; border-radius:4px;'>{str(gold_meta.get('last_run','N/A'))[:16]}</code></div>", unsafe_allow_html=True)
        else:
            st.markdown("<div style='font-size:13px; color:#C0C0D8;'><b>Data Pipeline:</b> Chưa thực thi</div>", unsafe_allow_html=True)

        if "last_refresh" not in st.session_state:
            st.session_state.last_refresh = datetime.now().strftime('%H:%M:%S')

        st.markdown(f"<div style='text-align:center; color:#64748B; font-size:11px; margin-bottom:6px;'>Dữ liệu cập nhật lúc: <b style='color:#C0C0D8'>{st.session_state.last_refresh}</b></div>", unsafe_allow_html=True)

        if st.button("🔄 Làm mới Dữ liệu", use_container_width=True, type="primary", key="refresh_sidebar_data"):
            st.cache_data.clear()
            st.cache_resource.clear()
            st.session_state.last_refresh = datetime.now().strftime('%H:%M:%S')
            st.rerun()

        st.markdown(f"""
        <div style='text-align:center; color:#C0C0D8; font-size:11px; margin-top:16px; border-top: 1px solid #2A2A3E; padding-top:12px'>
          Avengers Coffee Platform © 2026<br>Thời gian hệ thống: {datetime.now().strftime('%H:%M:%S')}
        </div>
        """, unsafe_allow_html=True)

def render_section_title(title):
    """Render standardized section titles."""
    st.markdown(f"<div class='section-title' style='margin-bottom: 16px; margin-top: 8px;'>{title}</div>", unsafe_allow_html=True)

def render_kpi_card(title, value, delta=None):
    """Render a standard KPI card. Best used within st.columns()."""
    delta_html = ""
    if delta:
        delta_color = "#2ED573" if str(delta).startswith("+") else "#FF4757"
        delta_html = f"<div style='color: {delta_color}; font-size: 13px; font-weight: 600;'>{delta}</div>"
        
    st.markdown(f"""
    <div style='background-color: #1A1A2E; padding: 20px; border-radius: 12px; border: 1px solid #2A2A3E; height: 100%; display: flex; flex-direction: column; justify-content: space-between;'>
        <div style='color: #C0C0D8; font-size: 14px; font-weight: 500; margin-bottom: 8px;'>{title}</div>
        <div style='color: white; font-size: 28px; font-weight: 700; font-family: monospace;'>{value}</div>
        {delta_html}
    </div>
    """, unsafe_allow_html=True)
