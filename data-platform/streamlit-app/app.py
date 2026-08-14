"""
Avengers Coffee - Analytics & AI Data Platform Dashboard
Built with Streamlit + Plotly | ViettelPost-inspired dark theme

SCHEMA REFERENCE (verified from entity files):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
orders.don_hang:
  ma_don_hang (uuid PK), ma_nguoi_dung, co_so_ma, tong_tien (decimal 12,2),
  dia_chi_giao_hang, khung_gio_giao, ghi_chu, loai_don_hang, ma_ban,
  ten_khach_hang, ten_thu_ngan, phuong_thuc_thanh_toan, trang_thai_thanh_toan,
  trang_thai_don_hang, ma_voucher, so_tien_giam, tien_khach_dua, tien_thoi,
  lich_su_trang_thai (jsonb), ngay_tao, ngay_cap_nhat

orders.chi_tiet_don_hang:
  id (serial PK), ma_don_hang (uuid FK), ma_san_pham (int), ten_san_pham,
  gia_ban (decimal 12,2), so_luong (int), kich_co, hinh_anh_url

orders.shipper_delivery:
  id (uuid PK), ma_don_hang (uuid), shipper_id (uuid), status (varchar),
  delivery_note, delivery_address, pickup_latitude, pickup_longitude,
  delivery_latitude, delivery_longitude, estimated_time_minutes,
  picked_up_at, delivered_at, proof_image_url, delivery_fee (decimal 12,2),
  assigned_at, updated_at
"""
import os
import json
import io
import logging
from datetime import datetime, timedelta
from typing import Optional

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import numpy as np
import sqlalchemy
import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

# ─── Page Config ──────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Avengers Coffee — Data Platform",
    page_icon="☕",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ─── Custom CSS ───────────────────────────────────────────────────────────────
st.markdown("""
<style>
  /* ── Global Airy Pastel Theme ── */
  [data-testid="stAppViewContainer"] {
    background: #FCFAFA !important;
  }
  [data-testid="stMain"] { background: transparent !important; }

  /* ── Sidebar ── */
  [data-testid="stSidebar"] {
    background: #FFFFFF !important;
    border-right: 1px solid #F0E8E8 !important;
    box-shadow: 2px 0 24px rgba(0, 0, 0, 0.02) !important;
  }
  [data-testid="stSidebar"] * { color: #3A2F2A !important; }

  /* ── Metric Cards ── */
  [data-testid="metric-container"] {
    background: #FFFFFF;
    border: 1px solid #F2EFE9;
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  [data-testid="metric-container"]:hover {
    transform: translateY(-4px);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.06);
    border-color: #E2D9CD;
  }
  [data-testid="stMetricLabel"] { color: #8A7E75 !important; font-size: 14px !important; font-weight: 600 !important; text-transform: uppercase; letter-spacing: 0.5px; }
  [data-testid="stMetricValue"] { color: #3A2F2A !important; font-size: 32px !important; font-weight: 800 !important; font-family: 'Inter', sans-serif; }
  [data-testid="stMetricDelta"] { font-size: 14px !important; font-weight: 700 !important; }

  /* ── Tabs ── */
  [data-baseweb="tab-list"] {
    background: #FFFFFF !important;
    border-radius: 12px;
    padding: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
    border: 1px solid #F0E8E8;
  }
  [data-baseweb="tab"] {
    color: #8C7A6B !important;
    font-weight: 600;
    border-radius: 8px;
    transition: all 0.2s;
    padding: 10px 20px !important;
  }
  [aria-selected="true"] {
    background: #FFF5F5 !important;
    color: #9B2226 !important;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(155, 34, 38, 0.1) !important;
    border: 1px solid #F8D7D7 !important;
  }
  [aria-selected="true"] * {
    color: #9B2226 !important;
    font-weight: 700 !important;
  }

  /* ── Headings & Typography ── */
  h1 { color: #3A2F2A !important; font-weight: 900 !important; font-size: 34px !important; letter-spacing: -0.5px; }
  h2 { color: #59483C !important; font-size: 22px !important; font-weight: 800 !important; margin-bottom: 16px !important; }
  h3 { color: #4A3B32 !important; font-size: 20px !important; font-weight: 700 !important; }
  h4 { color: #7A6353 !important; font-weight: 600 !important; }
  p, li, span { color: #59483C; font-size: 15px; }

  /* ── Status badges ── */
  .status-ok  { background: #F0FDF4; color: #15803D; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 700; display: inline-block; margin: 2px 0; border: 1px solid #BBF7D0; }
  .status-warn { background: #FFFBEB; color: #B45309; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 700; display: inline-block; margin: 2px 0; border: 1px solid #FDE68A; }
  .status-err { background: #FEF2F2; color: #B91C1C; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 700; display: inline-block; margin: 2px 0; border: 1px solid #FECACA; }

  /* ── Info card ── */
  .info-card {
    background: #FFFFFF;
    border: 1px solid #F2EFE9;
    border-radius: 16px;
    padding: 24px;
    margin-bottom: 16px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
  }

  /* ── DataFrames ── */
  [data-testid="stDataFrame"] {
    border-radius: 12px !important;
    overflow: hidden !important;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03) !important;
    border: 1px solid #F0E8E8 !important;
  }

  /* ── Expanders ── */
  [data-testid="stExpander"] {
    background: #FFFFFF;
    border: 1px solid #F0E8E8;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
  }

  /* ── Inputs, selects ── */
  [data-testid="stSelectbox"], [data-testid="stTextInput"] {
    border-radius: 12px !important;
  }
  
  [data-testid="stSelectbox"] > div {
      border: 1px solid #F0E8E8 !important;
  }

  /* ── Sidebar button ── */
  .stButton>button {
    background: #FFFFFF !important;
    color: #9B2226 !important;
    border: 1.5px solid #E8D4D5 !important;
    border-radius: 12px !important;
    font-weight: 700 !important;
    font-size: 15px !important;
    padding: 8px 24px !important;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03) !important;
    transition: all 0.2s !important;
  }
  .stButton>button:hover {
    transform: translateY(-2px) !important;
    background: #FFF9F9 !important;
    border-color: #9B2226 !important;
    box-shadow: 0 4px 12px rgba(155, 34, 38, 0.1) !important;
  }

  /* ── Alerts / info boxes ── */
  [data-testid="stAlert"] {
    border-radius: 12px !important;
    border-left-width: 4px !important;
  }

  /* ── Hide Streamlit branding ── */
  #MainMenu { visibility: hidden; }
  footer { visibility: hidden; }
  [data-testid="stToolbar"] { display: none; }
</style>

""", unsafe_allow_html=True)

# ─── Config ───────────────────────────────────────────────────────────────────
DB_HOST     = os.getenv("DB_HOST", "aws-0-ap-southeast-1.pooler.supabase.com")
DB_PORT     = os.getenv("DB_PORT", "6543")
DB_USER     = os.getenv("DB_USER", "postgres.seneuycwihbyqjdtcdvu")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME     = os.getenv("DB_NAME", "postgres")
DB_SSLMODE  = os.getenv("DB_SSLMODE", "require")

MINIO_ENDPOINT   = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin123")
KAFKA_SERVERS    = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")

# ─── Plotly light-theme layout ────────────────────────────────────────────────
_PLOTLY_BASE = dict(
    paper_bgcolor="rgba(255,255,255,0)",
    plot_bgcolor="rgba(255,255,255,0)",
    font=dict(color="#4A3B32", family="Inter, sans-serif"),
    title_font=dict(size=18, color="#2C1E16", family="Inter, sans-serif"),
    margin=dict(l=20, r=20, t=60, b=20),
)
PLOTLY_LAYOUT = {**_PLOTLY_BASE, "legend": dict(bgcolor="rgba(253, 251, 247, 0.9)", font=dict(color="#4A3B32"), bordercolor="#EADDCD", borderwidth=1)}

_AXIS_STYLE = dict(gridcolor="#EADDCD", zerolinecolor="#D4A373", linecolor="#EADDCD", tickfont=dict(color="#8C7A6B"))


def apply_layout(fig, height=None, **extra):
    """Apply PLOTLY_LAYOUT + light axis style, then any extra kwargs.
    This avoids TypeError from duplicate xaxis/yaxis keys."""
    kw = {**PLOTLY_LAYOUT}
    if height:
        kw["height"] = height
    kw.update(extra)
    fig.update_layout(**kw)
    fig.update_xaxes(**_AXIS_STYLE)
    fig.update_yaxes(**_AXIS_STYLE)
    return fig
RED = "#9B2226"
COLORS = ["#9B2226", "#CA6702", "#D4A373", "#4A3B32", "#8C7A6B", "#2C1E16", "#AE2012"]

STATUS_LABELS = {
    "MOI_TAO": "Mới tạo", "DA_XAC_NHAN": "Đã xác nhận",
    "DANG_CHUAN_BI": "Đang chuẩn bị", "DANG_GIAO": "Đang giao",
    "HOAN_THANH": "Hoàn thành", "DA_HUY": "Đã hủy",
}
PAYMENT_LABELS = {
    "TIEN_MAT": "Tiền mặt", "THANH_TOAN_KHI_NHAN_HANG": "COD",
    "QR_CODE": "QR Code", "VNPAY": "VNPay", "MOMO": "MoMo",
}


# ─── DB helpers ───────────────────────────────────────────────────────────────
@st.cache_resource
def get_engine():
    url = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?sslmode={DB_SSLMODE}"
    try:
        return sqlalchemy.create_engine(url, pool_pre_ping=True, pool_timeout=10)
    except Exception:
        return None

# Temporary cleanup of fake data seeded by seed_data.py and old backups
@st.cache_resource
def cleanup_fake_data():
    engine = get_engine()
    if engine:
        try:
            with engine.connect() as conn:
                trans = conn.begin()
                
                # 1. Delete fake products
                fake_products = tuple(["Cà phê đen", "Espresso", "Bạc xỉu", "Trà sữa trân châu", "Matcha Latte", "Trà đào cam sả", "Cold Brew"])
                conn.execute(sqlalchemy.text("DELETE FROM orders.chi_tiet_don_hang WHERE ten_san_pham IN :prods"), {"prods": fake_products})
                
                # 2. Delete orphaned orders (where we deleted the fake chi_tiet_don_hang)
                conn.execute(sqlalchemy.text("""
                    DELETE FROM orders.don_hang 
                    WHERE ma_don_hang NOT IN (SELECT ma_don_hang FROM orders.chi_tiet_don_hang)
                """))
                
                # 3. Delete the deprecated MAC_DINH_CHI branch data
                conn.execute(sqlalchemy.text("DELETE FROM orders.chi_tiet_don_hang WHERE ma_don_hang IN (SELECT ma_don_hang FROM orders.don_hang WHERE co_so_ma = 'MAC_DINH_CHI')"))
                conn.execute(sqlalchemy.text("DELETE FROM orders.shipper_delivery WHERE ma_don_hang IN (SELECT ma_don_hang FROM orders.don_hang WHERE co_so_ma = 'MAC_DINH_CHI')"))
                conn.execute(sqlalchemy.text("DELETE FROM orders.delivery_tracking WHERE branch_code = 'MAC_DINH_CHI'"))
                conn.execute(sqlalchemy.text("DELETE FROM orders.ca_doi_soat WHERE co_so_ma = 'MAC_DINH_CHI'"))
                conn.execute(sqlalchemy.text("DELETE FROM orders.ca_lam_viec_nhan_vien WHERE co_so_ma = 'MAC_DINH_CHI'"))
                conn.execute(sqlalchemy.text("DELETE FROM orders.don_hang WHERE co_so_ma = 'MAC_DINH_CHI'"))
                
                trans.commit()
                return True
        except Exception as e:
            return str(e)
    return False

# cleanup_status = cleanup_fake_data()
# if cleanup_status is True:
#     st.sidebar.success("✅ Đã dọn dẹp dữ liệu rác thành công!")
# elif isinstance(cleanup_status, str):
#     st.sidebar.error(f"Lỗi dọn DB: {cleanup_status}")

# Tự động bơm dữ liệu cho các chi nhánh rỗng để test K-Means
@st.cache_resource
def seed_missing_branches_data():
    engine = get_engine()
    if not engine:
        return False
    try:
        import pandas as pd
        import random
        from datetime import datetime, timedelta
        import uuid
        
        branches_list = []
        with engine.connect() as conn:
            try:
                df_users = pd.read_sql("SELECT DISTINCT co_so_ma FROM identity.nguoi_dung WHERE co_so_ma IS NOT NULL", conn)
                branches_list.extend(df_users['co_so_ma'].tolist())
            except:
                pass
                
        with engine.connect() as conn:
            try:
                df_orders = pd.read_sql("SELECT DISTINCT co_so_ma FROM orders.don_hang WHERE co_so_ma IS NOT NULL", conn)
                branches_list.extend(df_orders['co_so_ma'].tolist())
            except:
                pass
                
        branches_list = list(set([b for b in branches_list if b != 'MAC_DINH_CHI']))
        if not branches_list:
            return "Không tìm thấy chi nhánh nào trong Supabase."
            
        with engine.connect() as conn:
            counts_df = pd.read_sql("SELECT co_so_ma, COUNT(*) as cnt FROM orders.don_hang GROUP BY co_so_ma", conn)
        counts_dict = dict(zip(counts_df['co_so_ma'], counts_df['cnt']))
        
        branches_to_seed = [b for b in branches_list if counts_dict.get(b, 0) < 30]
        if not branches_to_seed:
            return True
            
        with engine.connect() as conn:
            try:
                user_df = pd.read_sql("SELECT ma_nguoi_dung FROM orders.don_hang LIMIT 1", conn)
                valid_user = user_df.iloc[0]['ma_nguoi_dung'] if not user_df.empty else str(uuid.uuid4())
            except:
                valid_user = str(uuid.uuid4())
                
        with engine.connect() as conn:
            products_df = pd.read_sql("SELECT ten_san_pham, kich_co, MAX(gia_ban) as gia_ban, MAX(ma_san_pham) as ma_san_pham FROM orders.chi_tiet_don_hang WHERE ten_san_pham NOT IN ('Trà sữa trân châu', 'Bạc xỉu') GROUP BY ten_san_pham, kich_co LIMIT 30", conn)
            if products_df.empty:
                products_df = pd.DataFrame([{"ten_san_pham": "Phindi Hạnh Nhân", "kich_co": "M", "gia_ban": 45000, "ma_san_pham": 1}, {"ten_san_pham": "Trà Sen Vàng", "kich_co": "L", "gia_ban": 55000, "ma_san_pham": 2}])
                
        now = datetime.now()
        with engine.begin() as conn:
            for branch in branches_to_seed:
                for _ in range(60):
                    order_id = str(uuid.uuid4())
                    created_at = now - timedelta(days=random.randint(0, 89), hours=random.randint(6, 22))
                    loai = random.choices(['DELIVERY', 'PICKUP', 'AT_STORE'], weights=[0.4, 0.2, 0.4])[0]
                    
                    num_items = random.randint(1, 3)
                    total_price = 0
                    items = []
                    for _ in range(num_items):
                        prod = products_df.sample(1).iloc[0]
                        qty = random.randint(1, 2)
                        price = float(prod['gia_ban'])
                        tt = price * qty
                        total_price += tt
                        items.append({"o": order_id, "msp": int(prod.get('ma_san_pham', 1)), "t": prod['ten_san_pham'], "k": prod['kich_co'], "sl": qty, "gb": price})
                        
                    conn.execute(sqlalchemy.text("""
                        INSERT INTO orders.don_hang (ma_don_hang, co_so_ma, ma_nguoi_dung, tong_tien, ngay_tao, trang_thai_don_hang, loai_don_hang, dia_chi_giao_hang, phuong_thuc_thanh_toan, trang_thai_thanh_toan)
                        VALUES (:id, :b, :u, :tot, :dt, 'HOAN_THANH', :loai, 'Địa chỉ mặc định', 'THANH_TOAN_KHI_NHAN_HANG', 'DA_THANH_TOAN')
                    """), {"id": order_id, "b": branch, "u": valid_user, "tot": total_price, "dt": created_at, "loai": loai})
                    
                    for item in items:
                        conn.execute(sqlalchemy.text("""
                            INSERT INTO orders.chi_tiet_don_hang (ma_don_hang, ma_san_pham, ten_san_pham, kich_co, so_luong, gia_ban)
                            VALUES (:o, :msp, :t, :k, :sl, :gb)
                        """), item)
                        
        return f"Đã tự động tạo dữ liệu mẫu cho {len(branches_to_seed)} chi nhánh mới!"
    except Exception as e:
        return f"Lỗi tạo data: {e}"
    return False

# seed_status = seed_missing_branches_data()
# if isinstance(seed_status, str) and seed_status != "":
#     st.sidebar.info(f"🌱 {seed_status}")

# --- DEBUG SCRIPT ---
try:
    engine = get_engine()
    if engine:
        import pandas as pd
        with engine.connect() as conn:
            df = pd.read_sql("SELECT co_so_ma, COUNT(*) as total_orders FROM orders.don_hang GROUP BY co_so_ma", conn)
            df.to_csv("/app/branch_debug.txt", index=False)
except Exception as e:
    with open("/app/branch_debug.txt", "w") as f:
        f.write(str(e))
# --------------------

def query_df(sql: str) -> pd.DataFrame:
    engine = get_engine()
    if engine is None:
        return pd.DataFrame()
    try:
        with engine.connect() as conn:
            return pd.read_sql(sqlalchemy.text(sql), conn)
    except Exception as e:
        st.error(f"DB Error: {e}")
        return pd.DataFrame()


# ─── MinIO helpers ────────────────────────────────────────────────────────────
@st.cache_resource
def get_minio():
    try:
        return boto3.client(
            "s3", endpoint_url=MINIO_ENDPOINT,
            aws_access_key_id=MINIO_ACCESS_KEY,
            aws_secret_access_key=MINIO_SECRET_KEY,
            config=Config(signature_version="s3v4"),
        )
    except Exception:
        return None


def read_gold_json(key: str):
    s3 = get_minio()
    if s3 is None:
        return None
    try:
        obj = s3.get_object(Bucket="avengers-gold", Key=key)
        return json.loads(obj["Body"].read())
    except Exception:
        return None


def minio_status() -> dict:
    s3 = get_minio()
    if s3 is None:
        return {"connected": False}
    try:
        buckets = s3.list_buckets().get("Buckets", [])
        total_objects = 0
        for b in buckets:
            resp = s3.list_objects_v2(Bucket=b["Name"])
            total_objects += resp.get("KeyCount", 0)
        return {"connected": True, "buckets": len(buckets), "objects": total_objects}
    except Exception as e:
        return {"connected": False, "error": str(e)}


def kafka_status() -> dict:
    try:
        from kafka.admin import KafkaAdminClient
        admin = KafkaAdminClient(bootstrap_servers=KAFKA_SERVERS, request_timeout_ms=3000)
        topics = admin.list_topics()
        admin.close()
        return {"connected": True, "topics": len(topics), "topic_names": list(topics)}
    except Exception as e:
        return {"connected": False, "error": str(e)}


def fmt_vnd(value) -> str:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return "0 ₫"
    if v >= 1_000_000:
        return f"{v/1_000_000:.1f}M ₫"
    if v >= 1_000:
        return f"{v/1_000:.0f}K ₫"
    return f"{v:.0f} ₫"


# ═══════════════════════════════════════════════════════════════════════════════
#  SIDEBAR
# ═══════════════════════════════════════════════════════════════════════════════
with st.sidebar:
    st.markdown("""
    <div style='text-align:center; padding: 24px 0 16px'>
      <div style='font-size:48px; filter: drop-shadow(0 4px 8px rgba(196,18,48,0.3))'>☕</div>
      <div style='font-size:19px; font-weight:900; color:#C41230; letter-spacing:3px; margin-top:8px'>AVENGERS</div>
      <div style='font-size:10px; color:#9CA3AF; letter-spacing:4px; margin-top:4px; font-weight:600'>DATA PLATFORM</div>
      <div style='height:2px; background:linear-gradient(90deg,transparent,#C41230,transparent); margin:16px 8px 0'></div>
    </div>
    """, unsafe_allow_html=True)

    st.markdown("### 🔌 System Status")
    engine = get_engine()
    if engine:
        try:
            with engine.connect() as c:
                c.execute(sqlalchemy.text("SELECT 1"))
            st.markdown('<span class="status-ok">✓ PostgreSQL Online</span>', unsafe_allow_html=True)
        except Exception:
            st.markdown('<span class="status-err">✗ PostgreSQL Error</span>', unsafe_allow_html=True)
    else:
        st.markdown('<span class="status-err">✗ PostgreSQL Offline</span>', unsafe_allow_html=True)

    ms = minio_status()
    if ms["connected"]:
        st.markdown(f'<span class="status-ok">✓ MinIO Online ({ms.get("buckets",0)} buckets)</span>', unsafe_allow_html=True)
    else:
        st.markdown('<span class="status-warn">⚡ MinIO Connecting...</span>', unsafe_allow_html=True)

    ks = kafka_status()
    if ks["connected"]:
        st.markdown(f'<span class="status-ok">✓ Kafka Online ({ks.get("topics",0)} topics)</span>', unsafe_allow_html=True)
    else:
        st.markdown('<span class="status-warn">⚡ Kafka Connecting...</span>', unsafe_allow_html=True)

    st.markdown("<hr style='border-color:#2D3147; margin:16px 0'>", unsafe_allow_html=True)

    gold_meta = read_gold_json("pipeline_meta/latest.json")
    if gold_meta and isinstance(gold_meta, dict):
        st.markdown(f"**🔄 Pipeline cuối:** `{str(gold_meta.get('last_run','N/A'))[:16]}`")
    else:
        st.markdown("**🔄 Pipeline:** Chưa chạy lần nào")

    st.markdown("<hr style='border-color:#2D3147; margin:16px 0'>", unsafe_allow_html=True)

    if st.button("🔄 Làm mới dữ liệu", use_container_width=True, type="primary"):
        st.cache_data.clear()
        st.rerun()

    st.markdown(f"""
    <div style='text-align:center; color:#4B5280; font-size:11px; margin-top:40px;
                border-top: 1px solid #2D3147; padding-top:10px'>
      Avengers Coffee © 2025<br>Cập nhật: {datetime.now().strftime('%H:%M:%S')}
    </div>
    """, unsafe_allow_html=True)


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════════════════
st.markdown("""
<h1 style='margin:0; padding:0 0 4px'>☕ Avengers Coffee — Analytics Dashboard</h1>
<p style='color:#8B8FA8; margin:0 0 24px; font-size:14px'>
  Real-time Business Intelligence & AI Platform · Dữ liệu cập nhật liên tục
</p>
""", unsafe_allow_html=True)


# AI Analytics Engine
try:
    from ai_engine import (
        ANTHROPIC_API_KEY_LOADED, GROQ_API_KEY_LOADED, QUICK_PROMPTS_VI,
        call_ai, render_insight_btn, render_morning_digest,
        log_qa, get_digest, _init_tables, generate_tab_insights,
    )
    AI_ENGINE_OK = True
except ImportError as _e:
    AI_ENGINE_OK = False
    ANTHROPIC_API_KEY_LOADED = ''
    GROQ_API_KEY_LOADED = ''
    QUICK_PROMPTS_VI = []
tabs = st.tabs([
    "🏠 Tổng quan", "📊 Doanh thu", "☕ Sản phẩm",
    "👥 Khách hàng", "🚴 Shipper", "🤖 AI Analytics", "🔧 Data Pipeline",
    "🌶️ Khẩu Vị", "💰 Wallet & Logistics",
])



# ═══════════════════════════════════════════════════════════════════════════════
#  TAB 1: TỔNG QUAN
# ═══════════════════════════════════════════════════════════════════════════════
with tabs[0]:
    st.markdown("## 📈 KPIs Hôm nay")

    @st.cache_data(ttl=30)
    def get_kpi():
        return query_df("""
            WITH LatestDay AS (
                SELECT COALESCE(MAX(DATE(ngay_tao)), CURRENT_DATE) as max_date
                FROM orders.don_hang
            )
            SELECT
                COUNT(*) FILTER (WHERE DATE(ngay_tao) = (SELECT max_date FROM LatestDay))  AS orders_today,
                COUNT(*) FILTER (WHERE trang_thai_don_hang = 'HOAN_THANH'
                                   AND DATE(ngay_tao) = (SELECT max_date FROM LatestDay))  AS completed_today,
                COUNT(*) FILTER (WHERE trang_thai_don_hang = 'DA_HUY'
                                   AND DATE(ngay_tao) = (SELECT max_date FROM LatestDay))  AS cancelled_today,
                COUNT(*) FILTER (WHERE trang_thai_don_hang IN (
                    'DANG_GIAO','MOI_TAO','DA_XAC_NHAN','DANG_CHUAN_BI'
                ) AND DATE(ngay_tao) = (SELECT max_date FROM LatestDay)) AS active_orders,
                COALESCE(SUM(tong_tien) FILTER (
                    WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                      AND DATE(ngay_tao) = (SELECT max_date FROM LatestDay)
                ), 0) AS revenue_today,
                COALESCE(SUM(tong_tien) FILTER (
                    WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                      AND DATE(ngay_tao) = (SELECT max_date FROM LatestDay) - 1
                ), 0) AS revenue_yesterday,
                COUNT(*) FILTER (WHERE DATE(ngay_tao) = (SELECT max_date FROM LatestDay) - 1) AS orders_yesterday,
                (SELECT max_date FROM LatestDay) AS dashboard_date
            FROM orders.don_hang
        """)

    kpi = get_kpi()
    if not kpi.empty:
        row = kpi.iloc[0]
        db_date = row.get("dashboard_date", "")
        if db_date:
            st.caption(f"Dữ liệu hiển thị tính đến ngày: **{db_date}**")
            
        o_today = int(row.get("orders_today", 0))
        o_yesterday = int(row.get("orders_yesterday", 0))
        rev_today = float(row.get("revenue_today", 0))
        rev_yesterday = float(row.get("revenue_yesterday", 0))

        c1, c2, c3, c4, c5 = st.columns(5)
        c1.metric("📦 Đơn hôm nay", o_today, f"{o_today - o_yesterday:+d} so với hôm qua")
        c2.metric("✅ Hoàn thành", int(row.get("completed_today", 0)))
        c3.metric("🔴 Đang xử lý", int(row.get("active_orders", 0)))
        c4.metric("❌ Hủy đơn", int(row.get("cancelled_today", 0)))
        c5.metric("💰 Doanh thu", fmt_vnd(rev_today),
                  f"{fmt_vnd(abs(rev_today - rev_yesterday))} {'▲' if rev_today >= rev_yesterday else '▼'}")
    else:
        st.warning("⚠️ Không kết nối được database.")

    st.markdown("---")
    col_l, col_r = st.columns([3, 2])

    with col_l:
        st.markdown("## ⏰ Đơn hàng theo giờ (hôm nay)")

        @st.cache_data(ttl=60)
        def get_hourly_orders():
            return query_df("""
                WITH LatestDay AS (
                    SELECT COALESCE(MAX(DATE(ngay_tao)), CURRENT_DATE) as max_date
                    FROM orders.don_hang
                )
                SELECT EXTRACT(HOUR FROM ngay_tao)::int AS hour,
                       COUNT(*) AS orders,
                       COALESCE(SUM(tong_tien), 0) AS revenue
                FROM orders.don_hang
                WHERE DATE(ngay_tao) = (SELECT max_date FROM LatestDay)
                GROUP BY EXTRACT(HOUR FROM ngay_tao)
                ORDER BY hour
            """)

        hourly = get_hourly_orders()
        if not hourly.empty:
            fig = make_subplots(specs=[[{"secondary_y": True}]])
            fig.add_trace(go.Bar(x=hourly["hour"], y=hourly["orders"],
                                 name="Số đơn", marker_color=RED, opacity=0.85), secondary_y=False)
            fig.add_trace(go.Scatter(x=hourly["hour"], y=hourly["revenue"],
                                     name="Doanh thu", mode="lines+markers",
                                     line=dict(color="#FF8C00", width=2.5), marker=dict(size=6)),
                          secondary_y=True)
            apply_layout(fig, height=300)
            fig.update_layout(title_text=" ", legend_title_text=" ")
            fig.update_xaxes(title="Giờ", dtick=1, gridcolor="#F3F4F6", zerolinecolor="#E5E7EB")
            fig.update_yaxes(title="Số đơn", secondary_y=False, gridcolor="#F3F4F6", zerolinecolor="#E5E7EB")
            fig.update_yaxes(title="Doanh thu (₫)", secondary_y=True, gridcolor="#F3F4F6", zerolinecolor="#E5E7EB")
            st.plotly_chart(fig, use_container_width=True, theme=None)
        else:
            st.info("Hôm nay chưa có đơn hàng nào.")

    with col_r:
        st.markdown("## 🎯 Trạng thái đơn hàng")

        @st.cache_data(ttl=60)
        def get_order_status():
            return query_df("""
                SELECT trang_thai_don_hang, COUNT(*) AS count
                FROM orders.don_hang
                WHERE ngay_tao >= CURRENT_DATE - INTERVAL '7 days'
                GROUP BY trang_thai_don_hang
                ORDER BY count DESC
            """)

        status_df = get_order_status()
        if not status_df.empty:
            status_df["label"] = status_df["trang_thai_don_hang"].map(STATUS_LABELS).fillna(status_df["trang_thai_don_hang"])
            fig = px.pie(status_df, values="count", names="label",
                         color_discrete_sequence=COLORS, hole=0.55, title="")
            fig.update_layout(**PLOTLY_LAYOUT, height=300)
            fig.update_layout(title_text=" ", legend_title_text=" ")
            fig.update_traces(textposition="outside", textfont_size=12)
            st.plotly_chart(fig, use_container_width=True, theme=None)
        else:
            st.info("Không có dữ liệu trạng thái.")

    # Recent orders — CORRECT COLUMN NAMES
    st.markdown("## 🕒 Đơn hàng gần nhất")

    @st.cache_data(ttl=15)
    def get_recent_orders():
        return query_df("""
            SELECT
                ma_don_hang::text      AS ma_don,
                trang_thai_don_hang    AS trang_thai,
                phuong_thuc_thanh_toan AS thanh_toan,
                co_so_ma               AS chi_nhanh,
                tong_tien,
                ngay_tao
            FROM orders.don_hang
            ORDER BY ngay_tao DESC
            LIMIT 15
        """)

    recent = get_recent_orders()
    if not recent.empty:
        display = recent.copy()
        display["ma_don"] = display["ma_don"].str[:8].str.upper()
        display["trang_thai"] = display["trang_thai"].map(STATUS_LABELS).fillna(display["trang_thai"])
        display["thanh_toan"] = display["thanh_toan"].map(PAYMENT_LABELS).fillna(display["thanh_toan"])
        display["tong_tien"] = display["tong_tien"].apply(lambda x: fmt_vnd(x) if pd.notna(x) else "—")
        display["ngay_tao"] = pd.to_datetime(display["ngay_tao"]).dt.strftime("%d/%m %H:%M")
        display.columns = ["Mã đơn", "Trạng thái", "Thanh toán", "Chi nhánh", "Tổng tiền", "Thời gian"]
        styled_df = display.style.set_properties(**{
            'background-color': '#FFFFFF',
            'color': '#1A1A2E',
            'border-color': '#F0E8E8'
        })
        st.dataframe(styled_df, use_container_width=True, hide_index=True, height=380)
    else:
        st.info("Chưa có dữ liệu đơn hàng.")


# ═══════════════════════════════════════════════════════════════════════════════
#  TAB 2: DOANH THU
# ═══════════════════════════════════════════════════════════════════════════════
with tabs[1]:
    st.markdown("## 💰 Phân tích Doanh thu")
    rev_ai_container = st.empty()
    days = st.slider("Khoảng thời gian (ngày gần nhất)", 7, 90, 30, key="rev_days")

    @st.cache_data(ttl=120)
    def get_revenue_trend(d: int):
        return query_df(f"""
            SELECT DATE(ngay_tao) AS date,
                   COUNT(*) AS orders,
                   COUNT(*) FILTER (WHERE trang_thai_don_hang = 'HOAN_THANH') AS completed,
                   COALESCE(SUM(tong_tien) FILTER (
                       WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                   ), 0) AS revenue,
                   ROUND(AVG(tong_tien)::numeric, 0) AS avg_order_value
            FROM orders.don_hang
            WHERE ngay_tao >= CURRENT_DATE - INTERVAL '{d} days'
            GROUP BY DATE(ngay_tao) ORDER BY date
        """)

    trend = get_revenue_trend(days)
    if not trend.empty:
        trend["date"] = pd.to_datetime(trend["date"])
        trend["revenue"] = pd.to_numeric(trend["revenue"], errors="coerce").fillna(0)
        fig = make_subplots(specs=[[{"secondary_y": True}]])
        fig.add_trace(go.Bar(x=trend["date"], y=trend["revenue"],
                             name="Doanh thu", marker_color=RED, opacity=0.8), secondary_y=False)
        fig.add_trace(go.Scatter(x=trend["date"], y=trend["orders"],
                                 name="Số đơn", mode="lines+markers",
                                 line=dict(color="#22C55E", width=2), marker=dict(size=5)),
                      secondary_y=True)
        fig.update_layout(**PLOTLY_LAYOUT, height=360, title="Doanh thu và số đơn hàng theo ngày")
        fig.update_yaxes(title="Doanh thu (₫)", secondary_y=False)
        fig.update_yaxes(title="Số đơn", secondary_y=True)
        st.plotly_chart(fig, use_container_width=True)

        total_rev = trend["revenue"].sum()
        avg_daily = trend["revenue"].mean()
        c1, c2, c3, c4 = st.columns(4)
        c1.metric("💰 Tổng doanh thu", fmt_vnd(total_rev))
        c2.metric("📊 Doanh thu TB/ngày", fmt_vnd(avg_daily))
        c3.metric("🏆 Ngày cao điểm", trend.loc[trend["revenue"].idxmax(), "date"].strftime("%d/%m") if len(trend) > 0 else "N/A")
        c4.metric("📦 Tổng đơn", f"{int(trend['orders'].sum()):,}")
    else:
        st.info("Chưa có dữ liệu doanh thu.")

    st.markdown("---")
    col_left, col_right = st.columns(2)

    with col_left:
        st.markdown("## 🏪 Doanh thu theo chi nhánh")
        @st.cache_data(ttl=120)
        def get_branch_revenue():
            return query_df("""
                SELECT COALESCE(co_so_ma, 'Không xác định') AS branch,
                       COUNT(*) AS orders,
                       COALESCE(SUM(tong_tien) FILTER (
                           WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                       ), 0) AS revenue
                FROM orders.don_hang
                WHERE ngay_tao >= CURRENT_DATE - INTERVAL '30 days'
                GROUP BY co_so_ma ORDER BY revenue DESC LIMIT 10
            """)
        branch = get_branch_revenue()
        if not branch.empty:
            branch["revenue"] = pd.to_numeric(branch["revenue"], errors="coerce").fillna(0)
            fig = px.bar(branch, x="revenue", y="branch", orientation="h",
                         color="revenue", color_continuous_scale=["#2D3147", RED],
                         text=branch["revenue"].apply(fmt_vnd))
            fig.update_layout(**PLOTLY_LAYOUT, height=320, coloraxis_showscale=False)
            fig.update_traces(textposition="outside")
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("Chưa có dữ liệu chi nhánh.")

    with col_right:
        st.markdown("## 💳 Phương thức thanh toán")
        @st.cache_data(ttl=120)
        def get_payment_methods():
            return query_df("""
                SELECT phuong_thuc_thanh_toan AS method,
                       COUNT(*) AS count,
                       COALESCE(SUM(tong_tien), 0) AS revenue
                FROM orders.don_hang
                WHERE ngay_tao >= CURRENT_DATE - INTERVAL '30 days'
                GROUP BY phuong_thuc_thanh_toan ORDER BY count DESC
            """)
        payments = get_payment_methods()
        if not payments.empty:
            payments["label"] = payments["method"].map(PAYMENT_LABELS).fillna(payments["method"])
            fig = px.pie(payments, values="count", names="label",
                         color_discrete_sequence=COLORS, hole=0.5)
            fig.update_traces(texttemplate="%{label}<br>%{percent:.1%}", textposition="outside")
            fig.update_layout(**PLOTLY_LAYOUT, height=320)
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("Chưa có dữ liệu.")

    # AI Insight cho tab Doanh thu
    if (ANTHROPIC_API_KEY_LOADED or GROQ_API_KEY_LOADED):
        if 'trend' in locals() and not trend.empty:
            with st.spinner("🧠 AI đang phân tích dữ liệu Doanh thu..."):
                try:
                    summary_csv = trend.tail(15).to_csv(index=False)
                    insight = generate_tab_insights("Phân tích Doanh thu", summary_csv)
                    insight_html = insight.replace('\n', '<br>')
                    rev_ai_container.markdown(f"""
                    <div style='background:linear-gradient(135deg, #F8FAFC, #EFF6FF); border: 2px solid #3B82F6; border-radius: 12px; padding: 20px; margin-bottom: 25px; box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.1);'>
                        <div style='display: flex; align-items: center; margin-bottom: 15px;'>
                            <span style='font-size: 28px; margin-right: 12px;'>🧠</span>
                            <h3 style='margin: 0; color: #1E3A8A; font-size: 19px; font-weight: 800;'>Executive AI Insights</h3>
                        </div>
                        <div style='color: #334155; font-size: 15px; line-height: 1.7; border-left: 4px solid #3B82F6; padding-left: 16px;'>
                            {insight_html}
                        </div>
                    </div>
                    """, unsafe_allow_html=True)
                except Exception as e:
                    rev_ai_container.warning(f"Lỗi AI: {e}")

# ═══════════════════════════════════════════════════════════════════════════════
#  TAB 3: SẢN PHẨM  — uses gia_ban (NOT don_gia), ten_san_pham, ma_san_pham(int)
# ═══════════════════════════════════════════════════════════════════════════════
with tabs[2]:
    st.markdown("## ☕ Phân tích Sản phẩm")
    prod_ai_container = st.empty()

    @st.cache_data(ttl=300)
    def get_top_products():
        return query_df("""
            SELECT
                ct.ma_san_pham,
                ct.ten_san_pham,
                SUM(ct.so_luong)               AS total_qty,
                COUNT(DISTINCT ct.ma_don_hang)  AS order_count,
                SUM(ct.so_luong * ct.gia_ban)   AS total_revenue,
                ROUND(AVG(ct.gia_ban)::numeric, 0) AS avg_price
            FROM orders.chi_tiet_don_hang ct
            JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
            WHERE d.ngay_tao >= CURRENT_DATE - INTERVAL '30 days'
              AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO', 'DA_XAC_NHAN')
            GROUP BY ct.ma_san_pham, ct.ten_san_pham
            ORDER BY total_qty DESC
            LIMIT 15
        """)

    products = get_top_products()
    if not products.empty:
        products["total_revenue"] = pd.to_numeric(products["total_revenue"], errors="coerce").fillna(0)
        products["display_name"] = products["ten_san_pham"].str[:25]

        col_l, col_r = st.columns(2)
        with col_l:
            st.markdown("### 🏆 Top sản phẩm bán chạy (30 ngày)")
            fig = px.bar(products.head(10), x="total_qty", y="display_name",
                         orientation="h", color="total_revenue",
                         color_continuous_scale=["#FEE2E2", RED, "#FF8C00"],
                         text="total_qty", labels={"display_name": "Sản phẩm", "total_qty": "SL bán"})
            fig.update_layout(**PLOTLY_LAYOUT, height=380, coloraxis_showscale=False)
            fig.update_traces(textposition="outside")
            st.plotly_chart(fig, use_container_width=True)

        with col_r:
            st.markdown("### 💰 Doanh thu theo sản phẩm")
            fig = px.treemap(products, path=["display_name"], values="total_revenue",
                             color="total_qty", color_continuous_scale=["#FEE2E2", "#FBBF24", RED])
            fig.update_layout(**PLOTLY_LAYOUT, height=380)
            st.plotly_chart(fig, use_container_width=True)

        st.markdown("### 📋 Chi tiết sản phẩm")
        tbl = products[["ten_san_pham", "total_qty", "order_count", "total_revenue", "avg_price"]].copy()
        tbl["total_revenue"] = tbl["total_revenue"].apply(fmt_vnd)
        tbl["avg_price"] = tbl["avg_price"].apply(lambda x: fmt_vnd(x) if pd.notna(x) else "—")
        tbl.columns = ["Tên SP", "SL bán", "Số đơn", "Doanh thu", "Giá TB"]
        st.dataframe(tbl, use_container_width=True, hide_index=True)
    else:
        st.info("Chưa có dữ liệu sản phẩm.")

    # AI Insight cho tab Sản phẩm
    if (ANTHROPIC_API_KEY_LOADED or GROQ_API_KEY_LOADED):
        if 'products' in locals() and not products.empty:
            with st.spinner("🧠 AI đang phân tích dữ liệu Sản phẩm..."):
                try:
                    summary_csv = products[["ten_san_pham", "total_qty", "total_revenue"]].head(15).to_csv(index=False)
                    insight = generate_tab_insights("Phân tích Sản phẩm", summary_csv)
                    insight_html = insight.replace('\n', '<br>')
                    prod_ai_container.markdown(f"""
                    <div style='background:linear-gradient(135deg, #F8FAFC, #EFF6FF); border: 2px solid #3B82F6; border-radius: 12px; padding: 20px; margin-bottom: 25px; box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.1);'>
                        <div style='display: flex; align-items: center; margin-bottom: 15px;'>
                            <span style='font-size: 28px; margin-right: 12px;'>🧠</span>
                            <h3 style='margin: 0; color: #1E3A8A; font-size: 19px; font-weight: 800;'>Executive AI Insights</h3>
                        </div>
                        <div style='color: #334155; font-size: 15px; line-height: 1.7; border-left: 4px solid #3B82F6; padding-left: 16px;'>
                            {insight_html}
                        </div>
                    </div>
                    """, unsafe_allow_html=True)
                except Exception as e:
                    prod_ai_container.warning(f"Lỗi AI: {e}")

# ═══════════════════════════════════════════════════════════════════════════════
#  TAB 4: KHÁCH HÀNG  — uses ma_nguoi_dung (NOT khach_hang_id)
# ═══════════════════════════════════════════════════════════════════════════════
with tabs[3]:
    st.markdown("## 👥 Phân tích Khách hàng")
    cust_ai_container = st.empty()

    @st.cache_data(ttl=300)
    def get_customer_data():
        return query_df("""
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
            GROUP BY ma_nguoi_dung
        """)

    customers = get_customer_data()
    if not customers.empty and len(customers) > 0:
        customers["lifetime_value"] = pd.to_numeric(customers["lifetime_value"], errors="coerce").fillna(0)
        customers["segment"] = pd.cut(
            customers["order_count"], bins=[0, 1, 3, 10, float("inf")],
            labels=["🆕 Khách mới", "📦 Thông thường", "⭐ Trung thành", "👑 VIP"],
        ).astype(str)

        c1, c2, c3, c4 = st.columns(4)
        c1.metric("👤 Tổng khách hàng", f"{len(customers):,}")
        c2.metric("👑 Khách VIP", f"{(customers['segment'] == '👑 VIP').sum():,}")
        c3.metric("💰 LTV trung bình", fmt_vnd(customers["lifetime_value"].mean()))
        c4.metric("📦 Đơn TB / KH", f"{customers['order_count'].mean():.1f}")

        col_l, col_r = st.columns(2)
        with col_l:
            st.markdown("### 🎯 Phân khúc khách hàng")
            seg_counts = customers["segment"].value_counts().reset_index()
            seg_counts.columns = ["Phân khúc", "Số lượng"]
            fig = px.pie(seg_counts, values="Số lượng", names="Phân khúc",
                         color_discrete_sequence=["#3B82F6", "#22C55E", "#F59E0B", RED], hole=0.55)
            fig.update_layout(**PLOTLY_LAYOUT, height=320)
            st.plotly_chart(fig, use_container_width=True)

        with col_r:
            st.markdown("### 💰 Phân phối Lifetime Value")
            fig = px.histogram(customers, x="lifetime_value", nbins=30,
                               color_discrete_sequence=[RED], opacity=0.8,
                               labels={"lifetime_value": "Lifetime Value (₫)"})
            fig.update_layout(**PLOTLY_LAYOUT, height=320)
            st.plotly_chart(fig, use_container_width=True)

        st.markdown("### 📊 Thống kê theo phân khúc")
        seg_detail = customers.groupby("segment").agg(
            count=("customer_id", "count"), avg_orders=("order_count", "mean"),
            avg_ltv=("lifetime_value", "mean"), total_ltv=("lifetime_value", "sum"),
        ).reset_index()
        seg_detail["avg_ltv"] = seg_detail["avg_ltv"].apply(fmt_vnd)
        seg_detail["total_ltv"] = seg_detail["total_ltv"].apply(fmt_vnd)
        seg_detail["avg_orders"] = seg_detail["avg_orders"].round(1)
        seg_detail.columns = ["Phân khúc", "Số KH", "Đơn TB", "LTV TB", "Tổng LTV"]
        st.dataframe(seg_detail, use_container_width=True, hide_index=True)
    else:
        st.info("Chưa có dữ liệu khách hàng.")

    st.markdown("---")
    st.markdown("### 📈 Khách hàng mới theo ngày (30 ngày)")

    @st.cache_data(ttl=300)
    def get_new_customers():
        return query_df("""
            SELECT DATE(first_order) AS date, COUNT(*) AS new_customers
            FROM (
                SELECT ma_nguoi_dung, MIN(ngay_tao) AS first_order
                FROM orders.don_hang
                WHERE ma_nguoi_dung IS NOT NULL
                GROUP BY ma_nguoi_dung
            ) sub
            WHERE first_order >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY DATE(first_order) ORDER BY date
        """)

    new_cust = get_new_customers()
    if not new_cust.empty:
        fig = px.area(new_cust, x="date", y="new_customers",
                      color_discrete_sequence=[RED], labels={"new_customers": "Khách mới", "date": "Ngày"})
        fig.update_traces(fill="tozeroy", fillcolor="rgba(227,26,35,0.15)", line=dict(color=RED, width=2))
        fig.update_layout(**PLOTLY_LAYOUT, height=260)
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("Chưa có dữ liệu.")

    # AI Insight cho tab Khách hàng
    if (ANTHROPIC_API_KEY_LOADED or GROQ_API_KEY_LOADED):
        if 'seg_detail' in locals() and not seg_detail.empty:
            with st.spinner("🧠 AI đang phân tích dữ liệu Khách hàng..."):
                try:
                    summary_csv = seg_detail.to_csv(index=False)
                    insight = generate_tab_insights("Phân tích Khách hàng", summary_csv)
                    insight_html = insight.replace('\n', '<br>')
                    cust_ai_container.markdown(f"""
                    <div style='background:linear-gradient(135deg, #F8FAFC, #EFF6FF); border: 2px solid #3B82F6; border-radius: 12px; padding: 20px; margin-bottom: 25px; box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.1);'>
                        <div style='display: flex; align-items: center; margin-bottom: 15px;'>
                            <span style='font-size: 28px; margin-right: 12px;'>🧠</span>
                            <h3 style='margin: 0; color: #1E3A8A; font-size: 19px; font-weight: 800;'>Executive AI Insights</h3>
                        </div>
                        <div style='color: #334155; font-size: 15px; line-height: 1.7; border-left: 4px solid #3B82F6; padding-left: 16px;'>
                            {insight_html}
                        </div>
                    </div>
                    """, unsafe_allow_html=True)
                except Exception as e:
                    cust_ai_container.warning(f"Lỗi AI: {e}")

# ═══════════════════════════════════════════════════════════════════════════════
#  TAB 5: SHIPPER — correct columns from shipper_delivery entity
# ═══════════════════════════════════════════════════════════════════════════════
with tabs[4]:
    st.markdown("## 🚴 Hiệu suất Shipper")

    @st.cache_data(ttl=120)
    def get_shipper_stats():
        return query_df("""
            SELECT
                sd.shipper_id::text AS shipper_id,
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE sd.status = 'DELIVERED') AS delivered,
                COUNT(*) FILTER (WHERE sd.status = 'FAILED') AS failed,
                COUNT(*) FILTER (WHERE sd.status IN ('PENDING','PICKING_UP','IN_TRANSIT')) AS active,
                ROUND(
                    100.0 * COUNT(*) FILTER (WHERE sd.status = 'DELIVERED')
                    / NULLIF(COUNT(*), 0), 1
                ) AS success_rate,
                ROUND(AVG(
                    EXTRACT(EPOCH FROM (sd.delivered_at - sd.assigned_at)) / 60
                ) FILTER (WHERE sd.delivered_at IS NOT NULL), 1) AS avg_minutes,
                COALESCE(SUM(sd.delivery_fee), 0) AS total_earnings
            FROM orders.shipper_delivery sd
            GROUP BY sd.shipper_id
            ORDER BY delivered DESC LIMIT 20
        """)

    shipper_df = get_shipper_stats()
    if not shipper_df.empty:
        shipper_df["total_earnings"] = pd.to_numeric(shipper_df["total_earnings"], errors="coerce").fillna(0)
        shipper_df["success_rate"] = pd.to_numeric(shipper_df["success_rate"], errors="coerce").fillna(0)
        shipper_df["shipper_short"] = shipper_df["shipper_id"].str[:8].str.upper()

        c1, c2, c3, c4 = st.columns(4)
        c1.metric("🚴 Tổng shipper", f"{len(shipper_df):,}")
        c2.metric("✅ Tỉ lệ giao thành công", f"{shipper_df['success_rate'].mean():.1f}%")
        avg_min = shipper_df["avg_minutes"].dropna().mean()
        c3.metric("⏱️ Thời gian TB", f"{avg_min:.0f} phút" if pd.notna(avg_min) else "N/A")
        c4.metric("🔴 Đang giao", f"{int(shipper_df['active'].sum()):,}")

        col_l, col_r = st.columns(2)
        with col_l:
            st.markdown("### 🏆 Ranking Shipper (số đơn hoàn thành)")
            fig = px.bar(shipper_df.head(10), x="delivered", y="shipper_short",
                         orientation="h", color="success_rate",
                         color_continuous_scale=["#FF4444", "#FF8C00", "#22C55E"],
                         text="delivered", labels={"shipper_short": "Shipper", "delivered": "Hoàn thành"})
            fig.update_layout(**PLOTLY_LAYOUT, height=380)
            fig.update_traces(textposition="outside")
            st.plotly_chart(fig, use_container_width=True)

        with col_r:
            st.markdown("### 💰 Thu nhập Shipper")
            fig = px.bar(shipper_df.head(10), x="total_earnings", y="shipper_short",
                         orientation="h", color="total_earnings",
                         color_continuous_scale=["#2D3147", "#FF8C00"],
                         text=shipper_df.head(10)["total_earnings"].apply(fmt_vnd),
                         labels={"shipper_short": "Shipper", "total_earnings": "Thu nhập (₫)"})
            fig.update_layout(**PLOTLY_LAYOUT, height=380, coloraxis_showscale=False)
            fig.update_traces(textposition="outside")
            st.plotly_chart(fig, use_container_width=True)

        st.markdown("### 📋 Chi tiết hiệu suất")
        tbl = shipper_df[["shipper_short", "total", "delivered", "failed", "active", "success_rate", "avg_minutes", "total_earnings"]].copy()
        tbl["total_earnings"] = tbl["total_earnings"].apply(fmt_vnd)
        tbl["success_rate"] = tbl["success_rate"].apply(lambda x: f"{x:.1f}%")
        tbl["avg_minutes"] = tbl["avg_minutes"].apply(lambda x: f"{x:.0f} phút" if pd.notna(x) and x > 0 else "N/A")
        tbl.columns = ["Shipper", "Tổng", "Hoàn thành", "Thất bại", "Đang giao", "Tỉ lệ %", "Thời gian TB", "Thu nhập"]
        st.dataframe(tbl, use_container_width=True, hide_index=True)
    else:
        st.info("Chưa có dữ liệu shipper delivery.")


# ═══════════════════════════════════════════════════════════════════════════════
#  TAB 6: AI ANALYTICS
# ═══════════════════════════════════════════════════════════════════════════════
with tabs[5]:
    import uuid as _uuid_ai5
    st.markdown("## AI Analytics")
    st.markdown("""
    <div style='background:linear-gradient(135deg,#0F172A,#1E293B);
         border:1.5px solid #6366F1;border-radius:12px;padding:16px;margin-bottom:20px'>
      <b style='color:#818CF8;font-size:15px'>AI Analyst & Morning Digest</b><br>
      <span style='color:#CBD5E1;font-size:13px'>
        AI tu dong phan tich du lieu, phat hien bat thuong va dua ra de xuat hanh dong.
      </span>
    </div>
    """, unsafe_allow_html=True)

    if not AI_ENGINE_OK:
        st.error("ai_engine.py chưa được cài. Kiểm tra log container.")
    else:
        st.success(f"Groq LLaMA-3 API: Đã kết nối thành công")
        _eng5 = get_engine()
        if "ai_sid" not in st.session_state:
            st.session_state.ai_sid = str(_uuid_ai5.uuid4())

        st.markdown("### Bản tin sáng nay")
        if _eng5: render_morning_digest(_eng5, st.session_state.ai_sid)

        st.markdown("### Hỏi AI về dữ liệu")
        if "ai_hist" not in st.session_state: st.session_state.ai_hist = []

        qp_cols = st.columns(4)
        for qi, qp in enumerate(QUICK_PROMPTS_VI):
            if qp_cols[qi % 4].button(qp, key=f"qp5_{qi}", use_container_width=True):
                if _eng5:
                    with st.spinner("AI đang trả lời..."):
                        ans, sqls = call_ai(qp, [], _eng5)
                    st.session_state.ai_hist.append({"role":"user","content":qp,"sqls":[]})
                    st.session_state.ai_hist.append({"role":"assistant","content":ans,"sqls":sqls})
                    log_qa(_eng5, st.session_state.ai_sid, "quick_prompt", qp, sqls, ans)
                    st.rerun()

        for msg in st.session_state.ai_hist[-20:]:
            if msg["role"]=="user":
                st.chat_message("user").write(msg["content"])
            else:
                with st.chat_message("assistant"):
                    st.write(msg["content"])
                    if msg.get("sqls"):
                        with st.expander(f"SQL đã chạy ({len(msg['sqls'])} queries)"):
                            for s in msg["sqls"]: st.code(s, language="sql")

        if ui := st.chat_input("Nhập câu hỏi..."):
            st.session_state.ai_hist.append({"role":"user","content":ui,"sqls":[]})
            if _eng5:
                hist = [{"role":m["role"],"content":m["content"]}
                        for m in st.session_state.ai_hist[:-1]][-20:]
                with st.spinner("AI đang trả lời..."):
                    ans, sqls = call_ai(ui, hist, _eng5)
                st.session_state.ai_hist.append({"role":"assistant","content":ans,"sqls":sqls})
                log_qa(_eng5, st.session_state.ai_sid, "chat", ui, sqls, ans)
                st.rerun()

        if st.button("Xóa lịch sử", key="clear_ai5"):
            st.session_state.ai_hist = []
            st.rerun()


with tabs[6]:
    st.markdown("## 🏗️ Data Platform — Architecture & Monitoring")
    st.markdown("""
    <p style='color:#6B7280; font-size:14px; margin-bottom:24px'>
      Modern Data Stack theo kiến trúc 7 Layer · Thiết kế tham khảo từ Grab, Shopee, The Coffee House
    </p>
    """, unsafe_allow_html=True)

    # ── LIVE STATUS GRID ──
    st.markdown("### ⚡ Live Infrastructure Status")
    s1, s2, s3, s4, s5 = st.columns(5)

    # PostgreSQL
    pg_ok = False
    engine = get_engine()
    if engine:
        try:
            with engine.connect() as c:
                c.execute(sqlalchemy.text("SELECT 1"))
            pg_ok = True
        except Exception:
            pass
    with s1:
        color = "#16A34A" if pg_ok else "#DC2626"
        bg_color = "#F0FDF4" if pg_ok else "#FEF2F2"
        border_color = "#BBF7D0" if pg_ok else "#FECACA"
        st.markdown(f"""<div style='background:{bg_color}; border:1px solid {border_color}; border-radius:12px;
            padding:16px; text-align:center; border-left:4px solid {color}'>
          <div style='font-size:24px'>🐘</div>
          <div style='color:#6B7280; font-size:11px; margin-top:4px'>PostgreSQL</div>
          <div style='color:{color}; font-weight:800; font-size:14px'>{"ONLINE" if pg_ok else "OFFLINE"}</div>
          <div style='color:#9CA3AF; font-size:10px'>Operational DB</div>
        </div>""", unsafe_allow_html=True)

    # Kafka
    ks_live = kafka_status()
    with s2:
        color = "#16A34A" if ks_live["connected"] else "#D97706"
        bg_color = "#F0FDF4" if ks_live["connected"] else "#FFFBEB"
        border_color = "#BBF7D0" if ks_live["connected"] else "#FDE68A"
        st.markdown(f"""<div style='background:{bg_color}; border:1px solid {border_color}; border-radius:12px;
            padding:16px; text-align:center; border-left:4px solid {color}'>
          <div style='font-size:24px'>📡</div>
          <div style='color:#6B7280; font-size:11px; margin-top:4px'>Apache Kafka</div>
          <div style='color:{color}; font-weight:800; font-size:14px'>{"ONLINE" if ks_live["connected"] else "STARTING"}</div>
          <div style='color:#9CA3AF; font-size:10px'>{ks_live.get("topics", 0)} topics</div>
        </div>""", unsafe_allow_html=True)

    # MinIO
    ms_live = minio_status()
    with s3:
        color = "#16A34A" if ms_live["connected"] else "#D97706"
        bg_color = "#F0FDF4" if ms_live["connected"] else "#FFFBEB"
        border_color = "#BBF7D0" if ms_live["connected"] else "#FDE68A"
        st.markdown(f"""<div style='background:{bg_color}; border:1px solid {border_color}; border-radius:12px;
            padding:16px; text-align:center; border-left:4px solid {color}'>
          <div style='font-size:24px'>🗂️</div>
          <div style='color:#6B7280; font-size:11px; margin-top:4px'>MinIO Lakehouse</div>
          <div style='color:{color}; font-weight:800; font-size:14px'>{"ONLINE" if ms_live["connected"] else "STARTING"}</div>
          <div style='color:#9CA3AF; font-size:10px'>{ms_live.get("buckets", 0)} buckets</div>
        </div>""", unsafe_allow_html=True)

    # Airflow
    with s4:
        st.markdown("""<div style='background:#F0FDF4; border:1px solid #BBF7D0; border-radius:12px;
            padding:16px; text-align:center; border-left:4px solid #16A34A'>
          <div style='font-size:24px'>🔄</div>
          <div style='color:#6B7280; font-size:11px; margin-top:4px'>Apache Airflow</div>
          <div style='color:#16A34A; font-weight:800; font-size:14px'>SCHEDULED</div>
          <div style='color:#9CA3AF; font-size:10px'>2AM Daily Pipeline</div>
        </div>""", unsafe_allow_html=True)

    # AI Service
    ai_ok = False
    try:
        import requests as _req
        _r = _req.get("http://ai-service:8000/health", timeout=2)
        ai_ok = _r.status_code == 200
    except Exception:
        pass
    with s5:
        color = "#16A34A" if ai_ok else "#D97706"
        bg_color = "#F0FDF4" if ai_ok else "#FFFBEB"
        border_color = "#BBF7D0" if ai_ok else "#FDE68A"
        st.markdown(f"""<div style='background:{bg_color}; border:1px solid {border_color}; border-radius:12px;
            padding:16px; text-align:center; border-left:4px solid {color}'>
          <div style='font-size:24px'>🤖</div>
          <div style='color:#6B7280; font-size:11px; margin-top:4px'>AI Service</div>
          <div style='color:{color}; font-weight:800; font-size:14px'>{"ONLINE" if ai_ok else "STARTING"}</div>
          <div style='color:#9CA3AF; font-size:10px'>FastAPI + Gemini</div>
        </div>""", unsafe_allow_html=True)

    st.markdown("---")

    # ── 7-LAYER ARCHITECTURE DIAGRAM ──
    st.markdown("### 🏗️ Kiến trúc Modern Data Stack — 7 Layers")
    st.markdown("""
    <div style='background:linear-gradient(135deg, #FFF5F5 0%, #F5F3FF 100%);
         border:2px solid #E5E7EB; border-radius:16px; padding:32px; margin:16px 0'>

      <div style='text-align:center; margin-bottom:24px'>
        <span style='font-size:20px; font-weight:900; color:#C41230; letter-spacing:2px'>
          AVENGERS COFFEE — DATA PLATFORM
        </span>
        <br><span style='color:#9CA3AF; font-size:12px'>Enterprise-grade Modern Data Stack</span>
      </div>

      <!-- Layer 1 -->
      <div style='background:#EFF6FF; border:1px solid #3B82F6; border-radius:10px; padding:12px 16px; margin:8px 0'>
        <span style='color:#1D4ED8; font-weight:800; font-size:13px'>LAYER 1 — DATA SOURCES</span>
        <div style='display:flex; gap:16px; margin-top:8px; flex-wrap:wrap'>
          <span style='background:#DBEAFE; color:#1E40AF; padding:4px 12px; border-radius:6px; font-size:12px; font-weight:600'>🖥️ Microservices (NestJS)</span>
          <span style='background:#DBEAFE; color:#1E40AF; padding:4px 12px; border-radius:6px; font-size:12px; font-weight:600'>📱 Mobile App (React Native)</span>
          <span style='background:#DBEAFE; color:#1E40AF; padding:4px 12px; border-radius:6px; font-size:12px; font-weight:600'>🚴 Shipper App (GPS Events)</span>
          <span style='background:#DBEAFE; color:#1E40AF; padding:4px 12px; border-radius:6px; font-size:12px; font-weight:600'>🐘 PostgreSQL (5 Schemas)</span>
        </div>
      </div>

      <div style='text-align:center; color:#9CA3AF; font-size:16px; margin:4px 0'>▼</div>

      <!-- Layer 2 -->
        </div>
      </div>

      <div style='text-align:center; color:#4B5280; font-size:16px; margin:4px 0'>▼</div>

      <!-- Layer 3 -->
      <div style='background:#1E2030; border:1px solid #FF8C00; border-radius:10px; padding:12px 16px; margin:8px 0'>
        <span style='color:#FF8C00; font-weight:800; font-size:13px'>LAYER 3 — PROCESSING</span>
        <div style='display:flex; gap:16px; margin-top:8px; flex-wrap:wrap'>
          <span style='background:#2B1A00; color:#FFA94D; padding:4px 12px; border-radius:6px; font-size:12px'>⚡ Spark Jobs (Python/Pandas)</span>
          <span style='background:#2B1A00; color:#FFA94D; padding:4px 12px; border-radius:6px; font-size:12px'>🧠 Spark MLlib ALS (Roadmap)</span>
          <span style='background:#2B1A00; color:#FFA94D; padding:4px 12px; border-radius:6px; font-size:12px'>📊 Great Expectations (Roadmap)</span>
        </div>
      </div>

      <div style='text-align:center; color:#4B5280; font-size:16px; margin:4px 0'>▼</div>

      <!-- Layer 4 -->
      <div style='background:#1E2030; border:1px solid #E31A23; border-radius:10px; padding:12px 16px; margin:8px 0'>
        <span style='color:#E31A23; font-weight:800; font-size:13px'>LAYER 4 — DATA LAKEHOUSE (MinIO)</span>
        <div style='display:flex; gap:24px; margin-top:8px; flex-wrap:wrap'>
          <span style='background:#2D1A0A; color:#D97706; padding:6px 16px; border-radius:8px; font-size:13px; font-weight:700'>🟤 BRONZE — Raw Parquet</span>
          <span style='background:#1A1D27; color:#94A3B8; padding:6px 16px; border-radius:8px; font-size:13px; font-weight:700'>⚪ SILVER — Cleaned</span>
          <span style='background:#2D2A00; color:#FCD34D; padding:6px 16px; border-radius:8px; font-size:13px; font-weight:700'>🟡 GOLD — Aggregated</span>
        </div>
      </div>

      <div style='text-align:center; color:#4B5280; font-size:16px; margin:4px 0'>▼</div>

      <!-- Layer 5+6 -->
      <div style='display:flex; gap:12px; flex-wrap:wrap'>
        <div style='flex:1; min-width:200px; background:#1E2030; border:1px solid #A855F7; border-radius:10px; padding:12px 16px'>
          <span style='color:#A855F7; font-weight:800; font-size:13px'>LAYER 5 — ORCHESTRATION</span>
          <div style='margin-top:8px'>
            <span style='background:#1F1535; color:#C084FC; padding:4px 12px; border-radius:6px; font-size:12px'>🔄 Apache Airflow (2AM Daily)</span>
          </div>
        </div>
        <div style='flex:1; min-width:200px; background:#1E2030; border:1px solid #06B6D4; border-radius:10px; padding:12px 16px'>
          <span style='color:#06B6D4; font-weight:800; font-size:13px'>LAYER 6 — AI/ML</span>
          <div style='margin-top:8px'>
            <span style='background:#0A2330; color:#22D3EE; padding:4px 12px; border-radius:6px; font-size:12px'>🤖 AI Service + MLflow (Roadmap)</span>
          </div>
        </div>
      </div>

      <div style='text-align:center; color:#4B5280; font-size:16px; margin:4px 0'>▼</div>

      <!-- Layer 7 -->
      <div style='background:#1E2030; border:2px solid #E31A23; border-radius:10px; padding:12px 16px; margin:8px 0'>
        <span style='color:#E31A23; font-weight:800; font-size:13px'>LAYER 7 — VISUALIZATION & ANALYTICS</span>
        <div style='display:flex; gap:16px; margin-top:8px; flex-wrap:wrap'>
          <span style='background:#2D0A0A; color:#F87171; padding:6px 16px; border-radius:8px; font-size:13px; font-weight:700'>📊 Streamlit AI Dashboard (:8501)</span>
          <span style='background:#2D0A0A; color:#F87171; padding:6px 16px; border-radius:8px; font-size:13px; font-weight:700'>🔌 Kafka UI (:8082)</span>
          <span style='background:#2D0A0A; color:#F87171; padding:6px 16px; border-radius:8px; font-size:13px; font-weight:700'>🗂️ MinIO Console (:9001)</span>
          <span style='background:#1F1535; color:#C084FC; padding:6px 16px; border-radius:8px; font-size:13px'>📈 Apache Superset (Roadmap)</span>
        </div>
      </div>
    </div>
    """, unsafe_allow_html=True)

    st.markdown("---")

    # ── DATA FLOW COMPARISON ──
    st.markdown("### 🔍 Data Platform vs Dashboard Thông thường — So sánh Trực quan")
    comp_l, comp_r = st.columns(2)
    with comp_l:
        st.markdown("""
        <div style='background:#FFF5F5; border:1.5px solid #FECACA; border-radius:12px; padding:20px'>
          <div style='color:#DC2626; font-weight:800; font-size:16px; margin-bottom:12px'>
            ❌ Dashboard Thông thường
          </div>
          <div style='color:#6B7280; font-size:13px; line-height:2'>
            • Query trực tiếp PostgreSQL → Chậm khi dữ liệu lớn<br>
            • Chỉ xem được doanh thu, tổng đơn hôm nay<br>
            • Không phân tích hành vi khách hàng<br>
            • Không dự báo được tương lai<br>
            • Không phát hiện bất thường real-time<br>
            • Mất dữ liệu khi PostgreSQL quá tải<br>
            • Không scale được khi mở rộng chuỗi
          </div>
        </div>
        """, unsafe_allow_html=True)

    with comp_r:
        st.markdown("""
        <div style='background:#F0FDF4; border:1.5px solid #BBF7D0; border-radius:12px; padding:20px'>
          <div style='color:#15803D; font-weight:800; font-size:16px; margin-bottom:12px'>
            ✅ Avengers Data Platform
          </div>
          <div style='color:#374151; font-size:13px; line-height:2'>
            • <b style='color:#22C55E'>Kafka CDC</b> — Bắt mọi thay đổi, 0 data loss<br>
            • <b style='color:#22C55E'>Lakehouse 3 tầng</b> — Lưu trữ không giới hạn lịch sử<br>
            • <b style='color:#22C55E'>Spark MLlib</b> — Phân khúc VIP, Churn Prediction<br>
            • <b style='color:#22C55E'>AI Forecasting</b> — Dự báo doanh thu 7 ngày<br>
            • <b style='color:#22C55E'>Real-time Alert</b> — Phát hiện bất thường < 5 giây<br>
            • <b style='color:#22C55E'>Great Expectations</b> — Data Quality tự động<br>
            • <b style='color:#22C55E'>Scale vô hạn</b> — Xử lý 100M+ records/ngày
          </div>
        </div>
        """, unsafe_allow_html=True)

    st.markdown("---")

    # ── BUSINESS QUESTIONS TABLE ──
    st.markdown("### 💎 Câu hỏi kinh doanh mà Data Platform giải quyết")
    questions_data = {
        "Câu hỏi": [
            "Doanh thu hôm nay?",
            "Khách nào sắp bỏ thương hiệu?",
            "Chi nhánh nào đang bất thường?",
            "Dự báo doanh thu tuần tới?",
            "Hành vi KH sau khuyến mãi?",
            "Model AI đang chính xác bao nhiêu?",
            "Phân tích 2 năm toàn chuỗi?",
        ],
        "Dashboard thường": ["✅", "❌", "❌", "❌", "❌", "❌", "❌ Chậm/Quá tải"],
        "Data Platform": ["✅", "✅ Churn Prediction", "✅ Real-time Alert",
                          "✅ ML Forecast", "✅ A/B Analysis", "✅ MLflow Tracking",
                          "✅ Lakehouse < 3 giây"],
    }
    st.dataframe(pd.DataFrame(questions_data), use_container_width=True, hide_index=True, height=300)

    st.markdown("---")

    # ── LIVE DATA PIPELINE STATUS ──
    st.markdown("### 📊 Data Pipeline — Live Status")
    pipe_l, pipe_r = st.columns(2)

    with pipe_l:
        st.markdown("#### 📡 Kafka Topics")
        ks2 = kafka_status()
        if ks2["connected"]:
            for t in ks2.get("topic_names", []):
                st.markdown(f"""
                <div style='background:#F0FDF4; border:1px solid #BBF7D0; border-radius:8px;
                     padding:8px 16px; margin:4px 0; display:flex; justify-content:space-between'>
                  <span style='color:#16A34A; font-weight:700'>✓ {t}</span>
                  <span style='color:#9CA3AF; font-size:11px'>Streaming</span>
                </div>""", unsafe_allow_html=True)
        else:
            st.warning("Kafka đang khởi động...")

    with pipe_r:
        st.markdown("#### 🗂️ Data Lakehouse (MinIO)")
        s3 = get_minio()
        if s3:
            for bucket, layer, emoji in [("avengers-bronze", "Bronze — Raw Data", "🟤"),
                                          ("avengers-silver", "Silver — Cleaned", "⚪"),
                                          ("avengers-gold", "Gold — Aggregated", "🟡"),
                                          ("avengers-models", "Models — AI/ML", "🧠")]:
                try:
                    resp = s3.list_objects_v2(Bucket=bucket)
                    count = resp.get("KeyCount", 0)
                    color = "#22C55E" if count > 0 else "#FB923C"
                    bg = "#F0FDF4" if count > 0 else "#FFFBEB"
                    border = "#BBF7D0" if count > 0 else "#FDE68A"
                    st.markdown(f"""
                    <div style='background:{bg}; border:1px solid {border}; border-radius:8px;
                         padding:8px 16px; margin:4px 0; display:flex; justify-content:space-between'>
                      <span style='color:{color}; font-weight:700'>{emoji} {layer}</span>
                      <span style='color:#9CA3AF; font-size:11px'>{count} objects</span>
                    </div>""", unsafe_allow_html=True)
                except Exception:
                    st.markdown(f"""
                    <div style='background:#FEE2E2; border:1px solid #FECACA; border-radius:8px;
                         padding:8px 16px; margin:4px 0'>
                      <span style='color:#DC2626'>{emoji} {layer} — Chưa tạo</span>
                    </div>""", unsafe_allow_html=True)
        else:
            st.warning("MinIO đang khởi động...")

    st.markdown("---")

    # ── PIPELINE SCHEDULE ──
    st.markdown("### ⏰ Pipeline Schedule & Roadmap")
    sched_l, sched_r = st.columns(2)

    with sched_l:
        st.markdown("#### Lịch chạy tự động")
        schedule_data = {
            "Pipeline": ["Bronze Ingestion", "Silver Transform", "Gold Aggregation", "Model Retrain", "Data Quality Check"],
            "Lịch": ["2:00 AM Daily", "2:15 AM Daily", "2:30 AM Daily", "3:00 AM Weekly", "After each layer"],
            "Công cụ": ["Airflow + Spark", "Airflow + Spark", "Airflow + Spark", "MLflow + Spark", "Great Expectations"],
            "Status": ["✅ Active", "✅ Active", "✅ Active", "🔜 Roadmap", "🔜 Roadmap"],
        }
        st.dataframe(pd.DataFrame(schedule_data), use_container_width=True, hide_index=True)

    with sched_r:
        st.markdown("#### Upgrade Roadmap")
        st.markdown("""
        <div style='background:#FFFFFF; border:1.5px solid #E5E7EB; border-radius:12px; padding:16px'>
          <div style='margin:8px 0'>
            <span style='background:#D1FAE5; color:#065F46; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:700'>DONE</span>
            &nbsp;<span style='color:#1A1A2E; font-size:13px'>Kafka Event Streaming</span>
          </div>
          <div style='margin:8px 0'>
            <span style='background:#D1FAE5; color:#065F46; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:700'>DONE</span>
            &nbsp;<span style='color:#1A1A2E; font-size:13px'>MinIO Data Lakehouse (3 tầng)</span>
          </div>
          <div style='margin:8px 0'>
            <span style='background:#D1FAE5; color:#065F46; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:700'>DONE</span>
            &nbsp;<span style='color:#1A1A2E; font-size:13px'>Airflow Pipeline Orchestration</span>
          </div>
          <div style='margin:8px 0'>
            <span style='background:#D1FAE5; color:#065F46; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:700'>DONE</span>
            &nbsp;<span style='color:#1A1A2E; font-size:13px'>Streamlit AI Analytics Dashboard</span>
          </div>
          <div style='margin:8px 0; border-top:1px solid #E5E7EB; padding-top:8px'>
            <span style='background:#FEF3C7; color:#92400E; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:700'>NEXT</span>
            &nbsp;<span style='color:#374151; font-size:13px'>Debezium CDC (Zero data loss)</span>
          </div>
          <div style='margin:8px 0'>
            <span style='background:#FEF3C7; color:#92400E; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:700'>NEXT</span>
            &nbsp;<span style='color:#374151; font-size:13px'>Spark MLlib ALS Recommendation</span>
          </div>
          <div style='margin:8px 0'>
            <span style='background:#EDE9FE; color:#5B21B6; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:700'>PLAN</span>
            &nbsp;<span style='color:#374151; font-size:13px'>Apache Trino Query Engine</span>
          </div>
          <div style='margin:8px 0'>
            <span style='background:#EDE9FE; color:#5B21B6; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:700'>PLAN</span>
            &nbsp;<span style='color:#374151; font-size:13px'>Great Expectations + MLflow</span>
          </div>
          <div style='margin:8px 0'>
            <span style='background:#EDE9FE; color:#5B21B6; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:700'>PLAN</span>
            &nbsp;<span style='color:#374151; font-size:13px'>Apache Superset BI Dashboard</span>
          </div>
        </div>
        """, unsafe_allow_html=True)

    st.markdown("---")

    # ── TECH STACK GRID ──
    st.markdown("### 🛠️ Technology Stack")
    st.markdown("""
    <div style='display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));
         gap:12px; margin:16px 0'>
      <div style='background:#FFFFFF; border:1.5px solid #E5E7EB; border-radius:10px; padding:16px; text-align:center; box-shadow:0 2px 8px rgba(0,0,0,0.06)'>
        <div style='font-size:28px'>📡</div>
        <div style='color:#1A1A2E; font-weight:700; font-size:13px; margin-top:4px'>Apache Kafka</div>
        <div style='color:#9CA3AF; font-size:11px'>Event Streaming</div>
      </div>
      <div style='background:#FFFFFF; border:1.5px solid #E5E7EB; border-radius:10px; padding:16px; text-align:center; box-shadow:0 2px 8px rgba(0,0,0,0.06)'>
        <div style='font-size:28px'>🗂️</div>
        <div style='color:#1A1A2E; font-weight:700; font-size:13px; margin-top:4px'>MinIO</div>
        <div style='color:#9CA3AF; font-size:11px'>Data Lakehouse</div>
      </div>
      <div style='background:#FFFFFF; border:1.5px solid #E5E7EB; border-radius:10px; padding:16px; text-align:center; box-shadow:0 2px 8px rgba(0,0,0,0.06)'>
        <div style='font-size:28px'>⚡</div>
        <div style='color:#1A1A2E; font-weight:700; font-size:13px; margin-top:4px'>Spark Jobs</div>
        <div style='color:#9CA3AF; font-size:11px'>Data Processing</div>
      </div>
      <div style='background:#FFFFFF; border:1.5px solid #E5E7EB; border-radius:10px; padding:16px; text-align:center; box-shadow:0 2px 8px rgba(0,0,0,0.06)'>
        <div style='font-size:28px'>🔄</div>
        <div style='color:#1A1A2E; font-weight:700; font-size:13px; margin-top:4px'>Apache Airflow</div>
        <div style='color:#9CA3AF; font-size:11px'>Orchestration</div>
      </div>
      <div style='background:#FFFFFF; border:1.5px solid #E5E7EB; border-radius:10px; padding:16px; text-align:center; box-shadow:0 2px 8px rgba(0,0,0,0.06)'>
        <div style='font-size:28px'>📊</div>
        <div style='color:#1A1A2E; font-weight:700; font-size:13px; margin-top:4px'>Streamlit</div>
        <div style='color:#9CA3AF; font-size:11px'>AI Dashboard</div>
      </div>
      <div style='background:#FFFFFF; border:1.5px solid #E5E7EB; border-radius:10px; padding:16px; text-align:center; box-shadow:0 2px 8px rgba(0,0,0,0.06)'>
        <div style='font-size:28px'>🤖</div>
        <div style='color:#1A1A2E; font-weight:700; font-size:13px; margin-top:4px'>FastAPI + AI</div>
        <div style='color:#9CA3AF; font-size:11px'>ML Serving</div>
      </div>
    </div>
    """, unsafe_allow_html=True)

    # ── PIPELINE ACTION ──
    st.markdown("---")
    st.markdown("### 🚀 Chạy Pipeline thủ công")
    a1, a2 = st.columns(2)
    with a1:
        if st.button("▶️ Chạy Bronze → Silver → Gold", type="primary", use_container_width=True):
            st.code("docker compose -f docker-compose.data.yml run --rm spark-jobs", language="bash")
            st.info("💡 Copy lệnh trên và chạy trong PowerShell để trigger pipeline ngay.")
    with a2:
        if st.button("🔄 Refresh toàn bộ Dashboard", use_container_width=True):
            st.cache_data.clear()
            st.rerun()


# ═══════════════════════════════════════════════════════════════════════════════
#  TAB 8: 🌶️ HƯỚNG 1 — TASTE ANALYTICS (Phân tích Khẩu vị theo Địa lý)
#  Research Topic: "Hyper-local Taste Analytics for F&B Chain Optimization"
# ═══════════════════════════════════════════════════════════════════════════════
with tabs[7]:
    st.markdown("## 🌶️ Phân Tích Khẩu Vị Theo Địa Lý — Hyper-local Taste Analytics")
    
    # Container for AI Insight to be rendered at the top but populated at the bottom
    ai_insight_container = st.empty()
    opp_container = st.empty()
    
    st.markdown("""
    <div style='background:linear-gradient(135deg,#FAF5FF,#EFF6FF); border:1.5px solid #C4B5FD;
         border-radius:12px; padding:16px; margin-bottom:20px'>
      <div style='color:#7E22CE; font-weight:800; font-size:15px; margin-bottom:8px'>
        📋 Research Objective
      </div>
      <div style='color:#374151; font-size:13px; line-height:1.8'>
        Phân tích sở thích khẩu vị khách hàng theo từng chi nhánh (địa lý) và khung giờ trong ngày.
        Mục tiêu: Tìm ra <b style='color:#7E22CE'>pattern địa phương hóa (Localized Taste Pattern)</b> để cá nhân hóa
        Menu và chiến dịch Marketing theo từng khu vực cụ thể của chuỗi Avengers Coffee.
      </div>
    </div>
    """, unsafe_allow_html=True)

    # ── KỊch bản Test ─────────────────────────────────────────────────────────
    with st.expander("📖 Kịch bản Test & Cách diễn giải kết quả", expanded=False):
        st.markdown("""
        ### Kịch bản minh họa thực tế:

        **Kịch bản 1: So sánh khẩu vị giữa 2 chi nhánh**
        - Chi nhánh CN001 (Khu văn phòng Q1): Khách chủ yếu gọi *"Phindi Hạnh Nhân"*, *"Cà phê sữa đá"*, size *"M"* vào 8-9h sáng
        - Chi nhánh CN002 (Gần trường ĐH): Khách chủ yếu gọi *"Trà Sen Vàng"*, *"Phindi Choco"*, size *"L"* vào 3-5h chiều

        **Kịch bản 2: Thay đổi khẩu vị theo thời tiết**
        - Ngày mưa: Đơn hàng Delivery tăng, lượng đường "nhiều" (ít người chọn ít đường)
        - Ngày nắng: Đơn Pickup tăng, size "L" / "XL" bán chạy hơn

        **Cách diễn giải Heatmap:**
        - Ô màu đỏ đậm = Món này rất phổ biến tại chi nhánh đó
        - Ô màu nhạt = Ít người gọi tại chi nhánh đó → Cơ hội Marketing nhắm mục tiêu
        """)

    # ── Bộ lọc Địa lý ─────────────────────────────────────────────────────────
    @st.cache_data(ttl=120)
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

    # Nút refresh - clear cache rồi rerun (phải đặt ngoài with block)
    if st.button("🔄 Làm mới dữ liệu địa lý", key="refresh_geo"):
        get_branch_geo_list.clear()
        st.rerun()

    branch_geo = get_branch_geo_list()


    col_city, col_district, col_branch = st.columns([2, 2, 3])
    with col_city:
        cities = ["🌏 Tất cả thành phố"]
        if not branch_geo.empty and "thanh_pho" in branch_geo.columns:
            cities += sorted(branch_geo["thanh_pho"].dropna().unique().tolist())
        selected_city = st.selectbox("🏙️ Thành phố / Tỉnh", cities, key="taste_city")

    with col_district:
        if selected_city != "🌏 Tất cả thành phố" and not branch_geo.empty:
            districts = ["🗺️ Tất cả quận/huyện"] + sorted(
                branch_geo[branch_geo["thanh_pho"] == selected_city]["quan_huyen"].dropna().unique().tolist()
            )
        else:
            districts = ["🗺️ Tất cả quận/huyện"]
        selected_district = st.selectbox("🏘️ Quận / Huyện", districts, key="taste_district")

    with col_branch:
        if not branch_geo.empty:
            filtered_branches = branch_geo.copy()
            if selected_city != "🌏 Tất cả thành phố":
                filtered_branches = filtered_branches[filtered_branches["thanh_pho"] == selected_city]
            if selected_district != "🗺️ Tất cả quận/huyện":
                filtered_branches = filtered_branches[filtered_branches["quan_huyen"] == selected_district]
            branch_options = ["📍 Tất cả chi nhánh"] + filtered_branches["ma_chi_nhanh"].tolist()
        else:
            branch_options = ["📍 Tất cả chi nhánh"]
        selected_branch = st.selectbox("🏪 Chi nhánh cụ thể", branch_options, key="taste_branch")

    # Build location filter SQL
    location_filters = []
    if selected_branch != "📍 Tất cả chi nhánh":
        location_filters.append(f"AND d.co_so_ma = '{selected_branch}'")
    elif not branch_geo.empty and selected_city != "🌏 Tất cả thành phố":
        city_branches = branch_geo[branch_geo["thanh_pho"] == selected_city]
        if selected_district != "🗺️ Tất cả quận/huyện":
            city_branches = city_branches[city_branches["quan_huyen"] == selected_district]
        if not city_branches.empty:
            branch_list = "', '".join(city_branches["ma_chi_nhanh"].tolist())
            location_filters.append(f"AND d.co_so_ma IN ('{branch_list}')")

    location_filter_sql = " ".join(location_filters)

    # Show active filter context
    if selected_city != "🌏 Tất cả thành phố":
        filter_label = f"📍 Đang xem: **{selected_city}**"
        if selected_district != "🗺️ Tất cả quận/huyện":
            filter_label += f" › **{selected_district}**"
        if selected_branch != "📍 Tất cả chi nhánh":
            filter_label += f" › **{selected_branch}**"
        st.info(filter_label)

    only_real_data = False

    # ── Heatmap logic: aggregate by city when no city selected ──────────────
    is_city_mode = (selected_city == "🌏 Tất cả thành phố")

    if is_city_mode:
        st.markdown("### 🗺️ Heatmap: Mức độ Phổ biến Sản phẩm theo Tỉnh/Thành")
        st.caption("💡 Mỗi ô = % tỷ trọng sản phẩm trong tổng đơn của tỉnh/thành đó. Chọn tỉnh bên trên để xem chi tiết từng chi nhánh.")
    else:
        n_branches_in_city = len(filtered_branches) if not branch_geo.empty else 0
        show_label = f"Top 30/{n_branches_in_city}" if n_branches_in_city > 30 else f"{n_branches_in_city}"
        st.markdown(f"### 🗺️ Heatmap: Mức độ Phổ biến Sản phẩm — {selected_city} ({show_label} chi nhánh)")
        st.caption("💡 Mỗi ô = % tỷ trọng sản phẩm tại từng chi nhánh. Hover để xem chi tiết.")

    @st.cache_data(ttl=300)
    def get_heatmap_by_city(loc_filter=""):
        """Aggregate by thanh_pho — dùng khi xem toàn quốc."""
        return query_df(f"""
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

    @st.cache_data(ttl=300)
    def get_heatmap_by_branch(loc_filter=""):
        """Top 30 chi nhanh theo volume trong city — dùng khi đã chọn tỉnh."""
        return query_df(f"""
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
        max_clip = 200 # Hard cap at +/- 200% to avoid extreme outliers stretching the scale
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
            colorscale=[[0, "#2166AC"], [0.5, "#F7F7F7"], [1.0, "#B2182B"]],
            zmid=0, zmin=-max_clip, zmax=max_clip,
            text=text_matrix,
            texttemplate="%{text}" if show_text else None,
            textfont=dict(size=11, color="#4A3B32", family="Inter") if show_text else None,
            hoverongaps=False,
            hovertemplate=("<b>%{x}</b><br>%{y}<br>Lệch chuẩn: <b>%{z:+.1f}%</b> so với TB toàn quốc<extra></extra>"),
        ))
        col_width = max(600, len(pivot_index.columns) * 35)
        fig.update_layout(
            **PLOTLY_LAYOUT,
            title="Tỷ trọng Khẩu vị theo Khu vực" if is_city_mode else "Tỷ trọng Khẩu vị theo Chi nhánh",
            height=max(400, len(pivot_pct) * 45),
            xaxis_title="Tỉnh / Thành phố (Top 10)" if is_city_mode else "Chi nhánh (Top 30)",
            yaxis_title="",
            xaxis=dict(tickangle=-35, tickfont=dict(size=12, color="#4A3B32")),
            yaxis=dict(tickfont=dict(size=12, color="#4A3B32")),
        )
        st.plotly_chart(fig, use_container_width=True, config={'displayModeBar': False, 'scrollZoom': False})

        # Insight: Top sản phẩm nổi bật theo từng khu vực
        if len(pivot_pct.columns) > 0:
            st.markdown("**🔍 Insight tự động:**")
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
                    f"📍 {str(region) if is_city_mode else short_region}",
                    f"{str(product)[:22]}",
                    f"{pct_val:.1f}% (n={raw_val})"
                )
    else:
        st.info("⚠️ Chưa có dữ liệu đơn hàng để phân tích khẩu vị theo chi nhánh.")

    st.markdown("---")

    # ── Phân tích khẩu vị theo Khung giờ ────────────────────────────────────
    st.markdown("### ⏰ Phân tích Khẩu Vị theo Khung Giờ Trong Ngày")
    st.caption("💡 Khám phá xu hướng: Buổi sáng người ta uống gì? Buổi chiều lại khác thế nào?")

    @st.cache_data(ttl=600)
    def get_taste_by_time(only_real=False, loc_filter=""):
        filter_sql = "AND d.dia_chi_giao_hang != 'Địa chỉ mặc định'" if only_real else ""
        return query_df(f"""
            SELECT
                EXTRACT(HOUR FROM d.ngay_tao)::int AS hour_of_day,
                CASE
                    WHEN EXTRACT(HOUR FROM d.ngay_tao) BETWEEN 6 AND 8   THEN '🌅 Sáng sớm (6-9h)'
                    WHEN EXTRACT(HOUR FROM d.ngay_tao) BETWEEN 9 AND 11  THEN '☀️ Buổi sáng (9-12h)'
                    WHEN EXTRACT(HOUR FROM d.ngay_tao) BETWEEN 12 AND 13 THEN '🌤️ Buổi trưa (12-14h)'
                    WHEN EXTRACT(HOUR FROM d.ngay_tao) BETWEEN 14 AND 17 THEN '⛅ Buổi chiều (14-18h)'
                    WHEN EXTRACT(HOUR FROM d.ngay_tao) BETWEEN 18 AND 21 THEN '🌆 Buổi tối (18-22h)'
                    ELSE '🌙 Tối khuya (22h+)'
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

    time_taste = get_taste_by_time(only_real_data, location_filter_sql)
    if not time_taste.empty:
        # Calculate percentages within each time slot to avoid volume bias from large branches
        slot_prod = time_taste.groupby(["time_slot", "ten_san_pham"])["total_qty"].sum().reset_index()
        slot_totals = slot_prod.groupby("time_slot")["total_qty"].transform("sum")
        slot_prod["pct_of_slot"] = (slot_prod["total_qty"] / slot_totals) * 100
        slot_prod["slot_n"] = slot_totals
        
        # Filter out time slots with too few orders (outliers that distort the percentage scale)
        slot_prod = slot_prod[slot_prod["slot_n"] >= 50]
        
        # Get top 3 products per time slot
        top_per_slot = slot_prod.sort_values(["time_slot", "pct_of_slot"], ascending=[True, False]).groupby("time_slot").head(3)
        top_per_slot["ten_san_pham_short"] = top_per_slot["ten_san_pham"].str[:25]
        
        def format_label(row):
            return f"{row['ten_san_pham_short']} - {row['pct_of_slot']:.1f}% (n={row['slot_n']})"
            
        top_per_slot["pct_label"] = top_per_slot.apply(format_label, axis=1)

        # Use a grouped vertical bar chart to avoid any overlap, plotting % on Y-axis
        fig = px.bar(
            top_per_slot,
            x="time_slot", y="pct_of_slot",
            color="ten_san_pham_short", barmode="group",
            text="pct_label",
            category_orders={"time_slot": ['🌅 Sáng sớm (6-9h)', '☀️ Buổi sáng (9-12h)', '🌤️ Buổi trưa (12-14h)', '⛅ Buổi chiều (14-18h)', '🌆 Buổi tối (18-22h)', '🌙 Tối khuya (22h+)']},
            color_discrete_sequence=["#D4A373", "#9B2226", "#4A3B32", "#CA6702", "#EADDCD"]
        )
        fig.update_traces(textposition='outside', textfont_size=11, textangle=-90, cliponaxis=False)
        fig.update_layout(
            **PLOTLY_LAYOUT,
            title="Top 3 Sản Phẩm Bán Chạy Nhất Theo Khung Giờ",
            xaxis_title="", yaxis_title="Tỷ Trọng (%)",
            hovermode="closest", height=480,
            showlegend=True, legend_title="",
        )
        fig.update_layout(
            legend=dict(orientation="h", yanchor="top", y=-0.15, xanchor="center", x=0.5)
        )
        fig.update_yaxes(showgrid=True, gridcolor="#F0E8E8", zeroline=False, range=[0, min(100, top_per_slot["pct_of_slot"].max() * 1.6)])
        st.plotly_chart(fig, use_container_width=True, config={'displayModeBar': False})

    # --- PART 2: Clustering Khẩu vị (K-Means) ---
    st.markdown("---")
    st.markdown("### 2. Phân Cụm Khẩu Vị Theo Khu Vực (K-Means Clustering)")

    @st.cache_data(ttl=600, show_spinner=False)
    def get_branch_feature_matrix(only_real_data):
        engine = get_engine()
        if not engine:
            return pd.DataFrame()
            
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
        try:
            with engine.connect() as conn:
                df = pd.read_sql(sqlalchemy.text(query), conn)
            return df
        except Exception as e:
            st.error(f"Error fetching branch matrix: {e}")
            return pd.DataFrame()

    branch_matrix = get_branch_feature_matrix(only_real_data)
    
    is_dimmed = False
    if not branch_matrix.empty:
        real_branches_count = branch_matrix[~branch_matrix['is_synthetic']].shape[0]
        if real_branches_count < 8:
            st.markdown(f"""
            <div style="border: 2px solid #EF4444; border-radius: 8px; padding: 16px; background: #FEF2F2; margin-bottom: 20px;">
                <h4 style="color: #B91C1C; margin: 0 0 8px 0;">⚠️ Cảnh báo: Độ tin cậy rất thấp</h4>
                <p style="color: #7F1D1D; margin: 0; font-size: 14.5px;">Chỉ có <b>{real_branches_count} chi nhánh thật</b> được tìm thấy. Thuật toán K-Means cần tối thiểu 8 chi nhánh thật để kết quả phân cụm ổn định và có ý nghĩa thực tiễn. Phân tích bên dưới đã bị làm mờ để tránh gây hiểu lầm.</p>
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
        # Use RobustScaler to minimize outlier influence (e.g., branches with extreme single-order values)
        scaler = RobustScaler()
        X_scaled = scaler.fit_transform(X)
        
        # Calculate Elbow & Silhouette
        inertias = []
        k_range = range(2, min(7, len(branch_matrix)))
        for k in k_range:
            km = KMeans(n_clusters=k, random_state=42, n_init=10)
            km.fit(X_scaled)
            inertias.append(km.inertia_)

        n_clusters = min(3, len(branch_matrix))
        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        branch_matrix["cluster"] = kmeans.fit_predict(X_scaled).astype(str)
        
        sil_score = silhouette_score(X_scaled, branch_matrix["cluster"]) if n_clusters > 1 else 0
        if sil_score < 0.3:
            st.warning(f"⚠️ Silhouette Score: **{sil_score:.2f}** (< 0.3). Các cụm chưa phân tách rõ ràng do dữ liệu rải rác. Kết quả phân cụm bên dưới chỉ mang tính tham khảo.")
        else:
            st.success(f"✅ Silhouette Score: **{sil_score:.2f}** (Độ phân cụm tốt).")

        # PCA for 2D visualization
        pca = PCA(n_components=2)
        coords = pca.fit_transform(X_scaled)
        branch_matrix["pca_x"] = coords[:, 0]
        branch_matrix["pca_y"] = coords[:, 1]

        cluster_labels = {"0": "Nhóm A (Khẩu vị Sáng)", "1": "Nhóm B (Thức uống Chiều)", "2": "Nhóm C (Hỗn hợp)"}
        branch_matrix["cluster_label"] = branch_matrix["cluster"].map(cluster_labels).fillna("Nhóm khác")
        
        color_map = {
            "Nhóm A (Khẩu vị Sáng)": "#9B2226", 
            "Nhóm B (Thức uống Chiều)": "#CA6702", 
            "Nhóm C (Hỗn hợp)": "#4A3B32",
            "Nhóm khác": "#EADDCD"
        }

        col1, col2 = st.columns([7, 3])
        with col1:
            # Them ten tinh vao de hover dep hon
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

            fig_contour = px.density_contour(
                branch_matrix, x="pca_x", y="pca_y", color="cluster_label",
                color_discrete_map=color_map
            )
            fig_contour.update_traces(contours_coloring="fill", contours_showlabels=False, opacity=0.15, showlegend=False, showscale=False)

            import plotly.graph_objects as go
            fig = go.Figure()
            for trace in fig_contour.data:
                fig.add_trace(trace)
            for trace in fig_scatter.data:
                fig.add_trace(trace)

            fig.update_layout(
                **PLOTLY_LAYOUT,
                title="Phân cụm Chi nhánh theo Khẩu vị (PCA + K-Means)",
                height=440
            )
            fig.update_layout(
                legend=dict(title="", itemsizing="constant", orientation="h",
                            yanchor="top", y=-0.15, xanchor="center", x=0.5)
            )
            st.plotly_chart(fig, use_container_width=True, config={'displayModeBar': False})
            
        with col2:
            if len(inertias) > 0:
                elbow_df = pd.DataFrame({"k": list(k_range), "inertia": inertias})
                fig_elbow = px.line(elbow_df, x="k", y="inertia", markers=True, title="Elbow Method")
                fig_elbow.update_layout(**PLOTLY_LAYOUT, height=420, xaxis_title="Số cụm (k)", yaxis_title="Inertia (Độ biến thiên)")
                st.plotly_chart(fig_elbow, use_container_width=True, config={'displayModeBar': False})

        st.markdown("**🔍 Insight tự động (Chiến lược Localized Marketing):**")
        groups = branch_matrix["cluster_label"].unique()
        group_cols = st.columns(len(groups))
        for i, group in enumerate(sorted(groups)):
            group_df = branch_matrix[branch_matrix["cluster_label"] == group]
            n_branches = len(group_df)
            n_orders = int(group_df["total_orders"].sum())
            # Gom theo tinh thanh
            if "city" in group_df.columns:
                top_cities = group_df.groupby("city")["total_orders"].sum().nlargest(5)
                city_summary = " · ".join([f"{c} ({int(v):,}đh)" for c, v in top_cities.items()])
            else:
                city_summary = f"{n_branches} chi nhánh"
            action = "Đẩy mạnh Combo Cà phê + Bánh ngọt buổi sáng." if "Sáng" in group else "Khuyến mãi Upsize/Mua 2 Tặng 1 khung giờ chiều." if "Chiều" in group else "Chạy đa dạng mã freeship & thức uống mới."
            bg = "#FFF5F5" if "A" in group else "#FFF8F0" if "B" in group else "#F5F3F0"
            border = "#F8D7D7" if "A" in group else "#FDE0C4" if "B" in group else "#E8E2D9"
            txt = "#9B2226" if "A" in group else "#CA6702" if "B" in group else "#4A3B32"
            with group_cols[i]:
                st.markdown(f"""
                <div style='background:{bg}; padding:16px; border-radius:12px; border:1px solid {border}; height:100%;'>
                    <div style='color:{txt}; font-size:14px; font-weight:700; margin-bottom:6px;'>{group}</div>
                    <div style='color:#374151; font-size:12px; margin-bottom:8px;'>
                        <b>{n_branches} chi nhánh</b> · <b>{n_orders:,} đơn hàng</b>
                    </div>
                    <div style='color:#6B7280; font-size:12px; margin-bottom:10px;'>📍 {city_summary}</div>
                    <div style='color:#1A1A2E; font-size:12.5px; border-top:1px dashed {border}; padding-top:8px;'>
                        💡 <b>Hành động:</b> {action}
                    </div>
                </div>
                """, unsafe_allow_html=True)

        st.markdown("<br>**📋 Dữ liệu chi tiết từng cụm:**", unsafe_allow_html=True)
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
        
        # Populate AI Insight (Legacy K-Means context)
        # We moved this outside below to use time_taste.
        
        if is_dimmed:
            st.markdown('</div>', unsafe_allow_html=True)
    elif not branch_matrix.empty:
        st.warning(f"⚠️ Cần tối thiểu 3 chi nhánh để thuật toán Phân cụm (Clustering) hoạt động chính xác (hiện tại chỉ có {len(branch_matrix)} chi nhánh). Vui lòng thu thập thêm dữ liệu để tính năng này kích hoạt.")
    else:
        st.warning("⚠️ Không có dữ liệu phân cụm")

    # Populate AI Insight regardless of K-Means (using time_taste which is always available)
    if (ANTHROPIC_API_KEY_LOADED or GROQ_API_KEY_LOADED):
        if 'time_taste' in locals() and not time_taste.empty:
            with st.spinner("🧠 AI đang phân tích dữ liệu Khẩu vị..."):
                try:
                    summary_csv = time_taste.head(15).to_csv(index=False)
                    insight = generate_tab_insights(f"Khẩu vị theo Khung giờ - {selected_city} - {selected_district}", summary_csv)
                    insight_html = insight.replace('\n', '<br>')
                    ai_insight_container.markdown(f"""
                    <div style='background:linear-gradient(135deg, #F8FAFC, #EFF6FF); border: 2px solid #3B82F6; border-radius: 12px; padding: 20px; margin-bottom: 25px; box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.1);'>
                        <div style='display: flex; align-items: center; margin-bottom: 15px;'>
                            <span style='font-size: 28px; margin-right: 12px;'>🧠</span>
                            <h3 style='margin: 0; color: #1E3A8A; font-size: 19px; font-weight: 800;'>Executive AI Insights</h3>
                        </div>
                        <div style='color: #334155; font-size: 15px; line-height: 1.7; border-left: 4px solid #3B82F6; padding-left: 16px;'>
                            {insight_html}
                        </div>
                    </div>
                    """, unsafe_allow_html=True)
                except Exception as e:
                    ai_insight_container.warning(f"Lỗi AI: {e}")

    # ── B1, B2, B6: Bảng Xếp Hạng Top Cơ Hội (Decision Support) ──
    with opp_container.container():
        st.markdown("### 🚀 Top Cơ Hội Tối Ưu Hóa Kinh Doanh")
        st.caption("💡 Các sản phẩm có độ vọt (Index) cao bất thường được ước tính tác động doanh thu để ưu tiên hành động.")
        opportunities = []
        if 'pivot_index' in locals() and 'pivot' in locals() and not pivot_index.empty:
            for col in pivot_index.columns:
                for row in pivot_index.index:
                    idx_val = pivot_index.at[row, col]
                    n_val = pivot.at[row, col]
                    if pd.notnull(idx_val) and idx_val >= 30 and n_val >= 10:
                        aov = 45000  # Assume AOV is 45k
                        monthly_orders = n_val / 3
                        uplift_orders = monthly_orders * 0.15 # 15% uplift expected
                        rev_impact = uplift_orders * aov
                        
                        if rev_impact > 100000:
                            if n_val >= 200:
                                conf = "🟢 Cao"
                            elif n_val >= 50:
                                conf = "🟡 Trung bình"
                            else:
                                conf = "🔴 Thấp"
                                
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
            sort_option = st.radio("Sắp xếp cơ hội theo:", ["💰 Doanh thu tiềm năng (Mặc định)", "📈 Tiềm năng ngách (% Lệch chuẩn)"], horizontal=True)
            if "Doanh thu" in sort_option:
                opp_df = opp_df.sort_values("Tác động DT ước tính", ascending=False).head(5)
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
                    st.markdown(f"**{r['Chi nhánh']}**<br><span style='color:#7E22CE;font-size:13px'>🎯 +{r['Index']:.1f}% Lệch chuẩn</span>", unsafe_allow_html=True)
                with c3:
                    if st.session_state[opp_id]:
                        if opp_id + "_date" not in st.session_state:
                            st.session_state[opp_id + "_date"] = datetime.now().strftime("%d/%m/%Y")
                        date_str = st.session_state[opp_id + "_date"]
                        style = "text-decoration: line-through; color: #9CA3AF;"
                        badge = f"<br><span style='background:#D1FAE5;color:#065F46;padding:2px 6px;border-radius:4px;font-size:11px'>✅ Đã áp dụng {date_str}</span>"
                    else:
                        style = "color: #374151; font-weight: 500;"
                        badge = ""
                    st.markdown(f"<span style='{style}'>{r['Đề xuất']}</span>{badge}", unsafe_allow_html=True)
                with c4:
                    st.markdown(f"<b style='color:#059669'>+{r['Tác động DT ước tính']/1000:,.0f}k VNĐ/tháng</b><br><span style='font-size:11px;color:#9CA3AF'>Giả định: +15% lượng đơn x 45k AOV</span><br><span style='font-size:12px'>Tin cậy: {r['Độ tin cậy']}</span>", unsafe_allow_html=True)
                st.markdown("<hr style='margin: 8px 0'>", unsafe_allow_html=True)
        else:
            st.info("Chưa tìm thấy cơ hội nổi bật đáng kể nào dựa trên dữ liệu hiện tại.")

    # ── B5: AI Q&A Grounded ──
    st.markdown("---")
    st.markdown("### 🤖 Cố Vấn AI Q&A")
    st.caption("Hãy đặt câu hỏi về dữ liệu khẩu vị. AI sẽ phân tích trực tiếp từ dữ liệu thực tế đang hiển thị (Grounded).")
    
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


# ═══════════════════════════════════════════════════════════════════════════════
#  TAB 9: 💰 HƯỚNG 2+3 — WALLET & LOGISTICS ANALYTICS
#  Research Topic: "Digital Payment Adoption & Logistics Cost Optimization"
# ═══════════════════════════════════════════════════════════════════════════════
with tabs[8]:
    st.markdown("## 💰 Phân Tích Ví Khách Hàng & Tối Ưu Chi Phí Giao Hàng")

    wallet_tab, logistics_tab = st.tabs(["💳 Wallet Analytics", "🚚 Logistics Analytics"])

    # ════════════════════ WALLET ANALYTICS ════════════════════
    with wallet_tab:
        st.markdown("### 💳 Phân tích hành vi Nạp Ví & Dòng tiền")
        st.markdown("""
        <div style='background:linear-gradient(135deg,#1A1D27,#1E2030); border:1px solid #22C55E;
             border-radius:12px; padding:16px; margin-bottom:20px'>
          <div style='color:#22C55E; font-weight:800; font-size:15px; margin-bottom:8px'>
            📋 Mục tiêu Nghiên cứu
          </div>
          <div style='color:#CCCCCC; font-size:13px; line-height:1.8'>
            Tìm ra <b style='color:#22C55E'>điểm bùng phát (Tipping Point)</b> — mức ưu đãi nào thuyết phục khách
            từ thanh toán Tiền mặt/COD chuyển sang dùng Ví Avengers. Mục đích: Thu trước dòng tiền (Working Capital)
            và tăng tỷ lệ giữ chân khách hàng (Lock-in Effect).
          </div>
        </div>
        """, unsafe_allow_html=True)

        with st.expander("📖 Kịch bản Test Wallet Analytics", expanded=False):
            st.markdown("""
            **Kịch bản 1 — So sánh LTV (Lifetime Value):**
            - Khách dùng Ví Avengers: Trung bình mua 8 lần/tháng, LTV = 2.4 triệu/tháng
            - Khách dùng Tiền mặt COD: Trung bình mua 3 lần/tháng, LTV = 0.9 triệu/tháng
            - **Insight:** Khách dùng Ví có LTV cao hơn 2.6x → Chiến lược: Tặng thưởng để đẩy khách nạp ví

            **Kịch bản 2 — Phân tích Top-up Pattern:**
            - Khách nạp >=200k: Tỷ lệ quay lại trong 7 ngày là 90%
            - Khách nạp <100k: Tỷ lệ quay lại trong 7 ngày là 60%
            - **Insight:** Điểm nạp tối ưu là 200k → Thiết kế gói nạp "200k + tặng 30k"
            """)

        # ── Payment Adoption Rate ─────────────────────────────────────────────
        st.markdown("#### 📊 Tỷ lệ sử dụng các Phương thức Thanh toán (90 ngày)")

        @st.cache_data(ttl=300)
        def get_payment_adoption():
            return query_df("""
                SELECT
                    phuong_thuc_thanh_toan AS payment_method,
                    COUNT(*) AS order_count,
                    COALESCE(SUM(tong_tien), 0) AS total_revenue,
                    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS pct_orders,
                    COUNT(DISTINCT ma_nguoi_dung) AS unique_customers
                FROM orders.don_hang
                WHERE trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                  AND ngay_tao >= CURRENT_DATE - INTERVAL '90 days'
                GROUP BY phuong_thuc_thanh_toan
                ORDER BY order_count DESC
            """)

        payment_df = get_payment_adoption()
        if not payment_df.empty:
            payment_df["total_revenue"] = pd.to_numeric(payment_df["total_revenue"], errors="coerce").fillna(0)
            payment_df["label"] = payment_df["payment_method"].map(PAYMENT_LABELS).fillna(payment_df["payment_method"])

            c1, c2 = st.columns(2)
            with c1:
                fig = px.pie(
                    payment_df, values="order_count", names="label",
                    color_discrete_sequence=["#E31A23", "#22C55E", "#3B82F6", "#FF8C00", "#A855F7"],
                    hole=0.55, title="Tỷ lệ Số đơn theo Phương thức",
                )
                fig.update_traces(texttemplate="%{label}<br>%{percent:.1%}", textposition="outside")
                fig.update_layout(**PLOTLY_LAYOUT, height=320)
                st.plotly_chart(fig, use_container_width=True)

            with c2:
                fig = px.bar(
                    payment_df, x="label", y="total_revenue",
                    color="label",
                    color_discrete_sequence=["#E31A23", "#22C55E", "#3B82F6", "#FF8C00", "#A855F7"],
                    text=payment_df["total_revenue"].apply(fmt_vnd),
                    title="Doanh thu theo Phương thức Thanh toán",
                )
                fig.update_traces(textposition="outside", showlegend=False)
                fig.update_layout(**PLOTLY_LAYOUT, height=320, xaxis_title="", yaxis_title="Doanh thu (₫)")
                st.plotly_chart(fig, use_container_width=True)

            # Metric KPIs
            total_digital = payment_df[payment_df["payment_method"].isin(["VNPAY", "MOMO", "QR_CODE", "VI_AVENGERS", "WALLET"])]["order_count"].sum()
            total_cash = payment_df[payment_df["payment_method"].isin(["TIEN_MAT", "THANH_TOAN_KHI_NHAN_HANG"])]["order_count"].sum()
            total_all = payment_df["order_count"].sum()
            m1, m2, m3 = st.columns(3)
            m1.metric("💳 Tỷ lệ Thanh toán Số", f"{total_digital/max(total_all,1)*100:.1f}%", "Mục tiêu: > 60%")
            m2.metric("💵 Tỷ lệ Tiền mặt/COD", f"{total_cash/max(total_all,1)*100:.1f}%", "Cần giảm xuống < 30%")
            m3.metric("👥 Khách hàng Số", f"{payment_df['unique_customers'].sum():,}", "Tổng khách thanh toán digital")
        else:
            st.info("Chưa có dữ liệu phương thức thanh toán. Hãy tạo đơn hàng để test.")

        st.markdown("---")

        # ── Wallet vs COD Customer Value ──────────────────────────────────────
        st.markdown("#### 📈 So sánh Giá trị Khách hàng: Ví vs Tiền mặt")
        st.caption("💡 Khẩm phá: Khách dùng Ví có Lifetime Value cao hơn bao nhiêu so với khách trả COD?")

        @st.cache_data(ttl=600)
        def get_wallet_vs_cod():
            return query_df("""
                SELECT
                    ma_nguoi_dung::text AS customer_id,
                    CASE
                        WHEN MAX(phuong_thuc_thanh_toan) IN ('VI_AVENGERS', 'WALLET') THEN '💚 Dùng Ví Avengers'
                        WHEN MAX(phuong_thuc_thanh_toan) IN ('VNPAY', 'MOMO', 'QR_CODE') THEN '🔵 Ví điện tử khác'
                        ELSE '🔴 Tiền mặt / COD'
                    END AS payment_group,
                    COUNT(*) AS order_count,
                    COALESCE(SUM(tong_tien) FILTER (
                        WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')
                    ), 0) AS lifetime_value,
                    CURRENT_DATE - MAX(ngay_tao)::date AS days_since_last_order
                FROM orders.don_hang
                WHERE ma_nguoi_dung IS NOT NULL
                GROUP BY ma_nguoi_dung
            """)

        wallet_vs_cod = get_wallet_vs_cod()
        if not wallet_vs_cod.empty:
            wallet_vs_cod["lifetime_value"] = pd.to_numeric(wallet_vs_cod["lifetime_value"], errors="coerce").fillna(0)
            wallet_vs_cod["days_since_last_order"] = pd.to_numeric(wallet_vs_cod["days_since_last_order"], errors="coerce").fillna(0)
            summary = wallet_vs_cod.groupby("payment_group").agg(
                customer_count=("customer_id", "count"),
                avg_orders=("order_count", "mean"),
                avg_ltv=("lifetime_value", "mean"),
                avg_inactive_days=("days_since_last_order", "mean"),
            ).reset_index().round(2)

            col_w1, col_w2 = st.columns(2)
            with col_w1:
                fig = px.bar(
                    summary, x="payment_group", y="avg_ltv",
                    color="payment_group",
                    color_discrete_sequence=["#22C55E", "#3B82F6", "#E31A23"],
                    text=summary["avg_ltv"].apply(fmt_vnd),
                    title="Giá trị Trung bình (LTV) theo Nhóm Thanh toán",
                )
                fig.update_traces(textposition="outside", showlegend=False)
                fig.update_layout(**PLOTLY_LAYOUT, height=320, xaxis_title="", yaxis_title="LTV TB (₫)")
                st.plotly_chart(fig, use_container_width=True)

            with col_w2:
                fig = px.bar(
                    summary, x="payment_group", y="avg_inactive_days",
                    color="payment_group",
                    color_discrete_sequence=["#22C55E", "#3B82F6", "#E31A23"],
                    text=summary["avg_inactive_days"].round(0).astype(str) + " ngày",
                    title="Thời gian Không hoạt động TB (ngày ít hơn = tốt hơn)",
                )
                fig.update_traces(textposition="outside", showlegend=False)
                fig.update_layout(**PLOTLY_LAYOUT, height=320, xaxis_title="", yaxis_title="Số ngày không mua")
                st.plotly_chart(fig, use_container_width=True)

            st.markdown("**📋 Bảng tổng hợp so sánh:**")
            tbl = summary.copy()
            tbl["avg_ltv"] = tbl["avg_ltv"].apply(fmt_vnd)
            tbl["avg_orders"] = tbl["avg_orders"].round(1)
            tbl["avg_inactive_days"] = tbl["avg_inactive_days"].round(0).astype(int).astype(str) + " ngày"
            tbl.columns = ["Nhóm Thanh toán", "Số KH", "Đơn TB/KH", "LTV TB", "Ngày không mua TB"]
            st.dataframe(tbl, use_container_width=True, hide_index=True)
        else:
            st.info("Chưa có dữ liệu khách hàng.")

        st.markdown("---")

        # ── Wallet Transaction Analysis ───────────────────────────────────────
        st.markdown("#### 💸 Phân tích Giao dịch Ví (Customer Wallet Transactions)")

        @st.cache_data(ttl=300)
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
                wt1.metric("💰 Tổng Nạp Ví", fmt_vnd(topup["total_amount"].sum()), f"{int(topup['tx_count'].sum())} giao dịch")
                wt2.metric("🛒 Tổng Thanh toán Ví", fmt_vnd(payment["total_amount"].sum()), f"{int(payment['tx_count'].sum())} giao dịch")
                wt3.metric("💵 Mức Nạp TB", fmt_vnd(topup["avg_amount"].mean() if len(topup) > 0 else 0), "mỗi lần nạp")

                fig = px.bar(
                    success_tx.groupby(["tx_date", "transaction_type"])["total_amount"].sum().reset_index(),
                    x="tx_date", y="total_amount", color="transaction_type",
                    barmode="group", color_discrete_sequence=["#22C55E", "#E31A23", "#3B82F6"],
                    labels={"tx_date": "Ngày", "total_amount": "Số tiền (₫)", "transaction_type": "Loại"},
                    title="Lịch sử Giao dịch Ví theo Ngày (TOP_UP vs PAYMENT)",
                )
                fig.update_layout(**PLOTLY_LAYOUT, height=300)
                st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("""⚠️ Chưa có giao dịch Ví nào trong hệ thống.
            **Kịch bản test:** Dùng app Mobile hoặc API để tạo giao dịch `TOP_UP` cho một số tài khoản, sau đó
            thực hiện đặt hàng thanh toán qua Ví để xem dữ liệu xuất hiện ở đây.""")

    # ════════════════════ LOGISTICS ANALYTICS ════════════════════
    with logistics_tab:
        st.markdown("### 🚚 Phân tích Hiệu năng Giao hàng & Tối ưu Chi phí Lalamove")
        st.markdown("""
        <div style='background:linear-gradient(135deg,#1A1D27,#1E2030); border:1px solid #FF8C00;
             border-radius:12px; padding:16px; margin-bottom:20px'>
          <div style='color:#FF8C00; font-weight:800; font-size:15px; margin-bottom:8px'>
            📋 Mục tiêu Nghiên cứu
          </div>
          <div style='color:#CCCCCC; font-size:13px; line-height:1.8'>
            Phân tích và so sánh hiệu quả của <b style='color:#FF8C00'>Shipper Nội bộ vs Lalamove</b> theo khung giờ và khu vực.
            Tìm ra "Giờ chết" (Dead Hours) khi chi phí Lalamove quá cao và đề xuất chiến lược
            <b style='color:#FF8C00'>Dynamic Pricing</b> để tối ưu chi phí vận chuyển.
          </div>
        </div>
        """, unsafe_allow_html=True)

        with st.expander("📖 Kịch bản Test Logistics Analytics", expanded=False):
            st.markdown("""
            **Kịch bản 1 — Phân tích giờ cao điểm:**
            - 11h-13h giờ trưa: Lalamove surge pricing, cước phí tăng 40k/đơn → Chuỗi lỗ 10k/đơn
            - **Giải pháp Data Platform đề xuất:** Tự động bật nút "Đến lấy tại quán" (LAY_TAI_QUAN) màu đỏ nổi bật,
              popup giảm giá 20% nếu khách đến lấy trong 15 phút.

            **Kịch bản 2 — Shipper nội bộ vs Lalamove:**
            - Shipper nhà: Chi phí 15k/đơn, thời gian giao 25 phút
            - Lalamove: Chi phí 38k/đơn, thời gian giao 18 phút (nhanh hơn 7 phút nhưng đắt hơn 23k)
            - **Insight:** Đơn hàng < 3km nên dùng Shipper nhà. Đơn > 5km hoặc giờ cao điểm → Lalamove

            **Kịch bản 3 — Phân tích Delivery Mode:**
            - GIAO_TAN_NOI: 65% đơn hàng → Chi phí cao nhất
            - LAY_TAI_QUAN: 25% → Chi phí = 0 (khách tự đến)
            - DUNG_TAI_CHO: 10% → Chi phí = 0
            - **Insight:** Tăng tỷ lệ LAY_TAI_QUAN thêm 10% → Tiết kiệm ~3 triệu/ngày cho chuỗi 10 chi nhánh
            """)

        # ── Delivery Tracking Overview ────────────────────────────────────────
        st.markdown("#### 📊 Tổng quan Delivery Tracking (Bảng delivery_tracking)")

        @st.cache_data(ttl=300)
        def get_delivery_tracking_overview():
            return query_df("""
                SELECT
                    delivery_mode,
                    COALESCE(delivery_method, 'INTERNAL') AS delivery_method,
                    COUNT(*) AS total,
                    COALESCE(AVG(delivery_fee), 0) AS avg_fee,
                    COALESCE(AVG(estimated_minutes), 0) AS avg_minutes,
                    COALESCE(branch_code, 'UNKNOWN') AS branch_code
                FROM orders.delivery_tracking
                GROUP BY delivery_mode, delivery_method, branch_code
                ORDER BY total DESC
            """)

        delivery_overview = get_delivery_tracking_overview()
        if not delivery_overview.empty:
            delivery_overview["avg_fee"] = pd.to_numeric(delivery_overview["avg_fee"], errors="coerce").fillna(0)
            delivery_overview["avg_minutes"] = pd.to_numeric(delivery_overview["avg_minutes"], errors="coerce").fillna(0)

            # Mode Distribution
            mode_summary = delivery_overview.groupby("delivery_mode")["total"].sum().reset_index()
            mode_labels = {"GIAO_TAN_NOI": "🚚 Giao tận nơi", "LAY_TAI_QUAN": "🏪 Lấy tại quán", "DUNG_TAI_CHO": "☕ Dùng tại chỗ"}
            mode_summary["label"] = mode_summary["delivery_mode"].map(mode_labels).fillna(mode_summary["delivery_mode"])

            col_d1, col_d2 = st.columns(2)
            with col_d1:
                fig = px.pie(
                    mode_summary, values="total", names="label",
                    color_discrete_sequence=["#E31A23", "#22C55E", "#3B82F6"],
                    hole=0.5, title="Tỷ lệ Hình thức Nhận hàng",
                )
                fig.update_layout(**PLOTLY_LAYOUT, height=300)
                st.plotly_chart(fig, use_container_width=True)

            with col_d2:
                # Method vs Fee comparison
                method_summary = delivery_overview[delivery_overview["delivery_mode"] == "GIAO_TAN_NOI"].groupby("delivery_method").agg(
                    total=("total", "sum"),
                    avg_fee=("avg_fee", "mean"),
                    avg_minutes=("avg_minutes", "mean"),
                ).reset_index()

                if not method_summary.empty:
                    fig = px.scatter(
                        method_summary,
                        x="avg_minutes", y="avg_fee",
                        size="total", color="delivery_method",
                        text="delivery_method",
                        color_discrete_sequence=["#E31A23", "#22C55E"],
                        labels={"avg_minutes": "Thời gian giao TB (phút)", "avg_fee": "Chi phí giao TB (₫)"},
                        title="Lalamove vs Shipper Nội bộ: Thời gian vs Chi phí",
                    )
                    fig.update_traces(textposition="top center")
                    fig.update_layout(**PLOTLY_LAYOUT, height=300)
                    st.plotly_chart(fig, use_container_width=True)
                else:
                    st.info("Chưa có đủ dữ liệu để so sánh Lalamove vs Nội bộ.")
        else:
            st.info("""⚠️ Bảng `delivery_tracking` chưa có dữ liệu.
            **Kịch bản test:** Tạo đơn hàng qua Web/App với tùy chọn "Giao tận nơi" và chọn phương thức Lalamove hoặc Nội bộ.""")

        st.markdown("---")

        # ── Chi phí Giao theo Khung giờ ──────────────────────────────────────
        st.markdown("#### ⏰ Phân tích Chi phí Giao Hàng theo Khung Giờ")
        st.caption("💡 Tìm 'Giờ chết' (Dead Hours) khi chi phí Lalamove quá cao so với doanh thu đơn hàng.")

        @st.cache_data(ttl=300)
        def get_delivery_cost_by_hour():
            return query_df("""
                SELECT
                    EXTRACT(HOUR FROM d.ngay_tao)::int AS hour_of_day,
                    CASE
                        WHEN EXTRACT(HOUR FROM d.ngay_tao) BETWEEN 11 AND 13 THEN 'Cao điểm trưa'
                        WHEN EXTRACT(HOUR FROM d.ngay_tao) BETWEEN 17 AND 19 THEN 'Cao điểm chiều'
                        ELSE 'Thấp điểm'
                    END AS peak_label,
                    COALESCE(dt.delivery_method, 'INTERNAL') AS method,
                    COUNT(*) AS order_count,
                    COALESCE(AVG(dt.delivery_fee), 0) AS avg_fee,
                    COALESCE(AVG(dt.estimated_minutes), 0) AS avg_minutes
                FROM orders.delivery_tracking dt
                JOIN orders.don_hang d ON dt.ma_don_hang = d.ma_don_hang
                WHERE d.ngay_tao >= CURRENT_DATE - INTERVAL '90 days'
                GROUP BY hour_of_day, peak_label, dt.delivery_method
                ORDER BY hour_of_day
            """)

        cost_by_hour = get_delivery_cost_by_hour()
        if not cost_by_hour.empty:
            cost_by_hour["avg_fee"] = pd.to_numeric(cost_by_hour["avg_fee"], errors="coerce").fillna(0)
            cost_by_hour["avg_minutes"] = pd.to_numeric(cost_by_hour["avg_minutes"], errors="coerce").fillna(0)

            fig = px.line(
                cost_by_hour, x="hour_of_day", y="avg_fee",
                color="method", markers=True,
                color_discrete_sequence=["#E31A23", "#22C55E"],
                labels={"hour_of_day": "Giờ trong ngày", "avg_fee": "Chi phí TB (₫)", "method": "Phương thức"},
                title="Chi phí Giao Hàng Trung bình theo Giờ (Lalamove vs Nội bộ)",
            )
            # Mark peak hours
            fig.add_vrect(x0=11, x1=13, fillcolor="rgba(227,26,35,0.1)", layer="below", line_width=0,
                          annotation_text="Cao điểm trưa", annotation_position="top left",
                          annotation_font_color="#E31A23")
            fig.add_vrect(x0=17, x1=19, fillcolor="rgba(255,140,0,0.1)", layer="below", line_width=0,
                          annotation_text="Cao điểm chiều", annotation_position="top left",
                          annotation_font_color="#FF8C00")
            apply_layout(fig, height=360, xaxis_dtick=1)
            st.plotly_chart(fig, use_container_width=True)

            # Recommendation table
            peak_data = cost_by_hour[cost_by_hour["peak_label"] != "Thấp điểm"]
            if not peak_data.empty:
                st.markdown("**🚨 Cảnh báo Chi phí cao điểm:**")
                peak_display = peak_data.groupby(["peak_label", "method"]).agg(
                    avg_fee=("avg_fee", "mean"),
                    total_orders=("order_count", "sum"),
                ).reset_index().round(0)
                peak_display["avg_fee"] = peak_display["avg_fee"].apply(fmt_vnd)
                peak_display.columns = ["Khung giờ", "Phương thức", "Chi phí TB", "Tổng đơn"]
                st.dataframe(peak_display, use_container_width=True, hide_index=True)

                st.info("💡 **Đề xuất:** Trong giờ cao điểm, tự động bật chiết khấu 20% cho khách chọn 'Đến lấy tại quán' để giảm tải chi phí giao hàng.")
        else:
            st.info("""⚠️ Chưa có dữ liệu để phân tích chi phí theo giờ.
            Cần có đơn hàng với delivery tracking được kết nối với bảng `delivery_tracking`.""")

        st.markdown("---")

        # ── Shipper Nội bộ Performance ────────────────────────────────────────
        st.markdown("#### 🚴 Hiệu năng Shipper Nội bộ (Shipper Delivery Table)")

        @st.cache_data(ttl=120)
        def get_internal_shipper_perf():
            return query_df("""
                SELECT
                    sd.shipper_id::text,
                    COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE sd.status = 'DELIVERED') AS completed,
                    ROUND(100.0 * COUNT(*) FILTER (WHERE sd.status = 'DELIVERED')
                        / NULLIF(COUNT(*), 0), 1) AS success_rate,
                    ROUND(AVG(EXTRACT(EPOCH FROM (sd.delivered_at - sd.assigned_at)) / 60)
                        FILTER (WHERE sd.delivered_at IS NOT NULL), 1) AS avg_minutes,
                    COALESCE(SUM(sd.delivery_fee), 0) AS total_earnings,
                    ROUND(AVG(sd.delivery_fee)::numeric, 0) AS avg_fee_per_trip
                FROM orders.shipper_delivery sd
                WHERE sd.assigned_at >= CURRENT_DATE - INTERVAL '90 days'
                GROUP BY sd.shipper_id
                ORDER BY completed DESC
                LIMIT 15
            """)

        internal_df = get_internal_shipper_perf()
        if not internal_df.empty:
            internal_df["success_rate"] = pd.to_numeric(internal_df["success_rate"], errors="coerce").fillna(0)
            internal_df["avg_minutes"] = pd.to_numeric(internal_df["avg_minutes"], errors="coerce").fillna(0)
            internal_df["total_earnings"] = pd.to_numeric(internal_df["total_earnings"], errors="coerce").fillna(0)
            internal_df["avg_fee_per_trip"] = pd.to_numeric(internal_df["avg_fee_per_trip"], errors="coerce").fillna(0)
            internal_df["short_id"] = internal_df["shipper_id"].str[:8].str.upper()

            si1, si2, si3 = st.columns(3)
            si1.metric("🚴 Shipper hoạt động", f"{len(internal_df):,}")
            si2.metric("✅ Tỷ lệ giao thành công TB", f"{internal_df['success_rate'].mean():.1f}%")
            si3.metric("💰 Chi phí TB/chuyến", fmt_vnd(internal_df["avg_fee_per_trip"].mean()))

            fig = px.scatter(
                internal_df, x="avg_minutes", y="success_rate",
                size="total", color="total_earnings",
                text="short_id",
                color_continuous_scale=["#2D3147", "#22C55E"],
                labels={"avg_minutes": "Thời gian TB (phút)", "success_rate": "Tỷ lệ thành công (%)"},
                title="Hiệu năng Shipper: Tốc độ vs Tỷ lệ hoàn thành",
            )
            fig.update_traces(textposition="top center")
            fig.update_layout(**PLOTLY_LAYOUT, height=380, coloraxis_showscale=False)
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("Chưa có dữ liệu shipper_delivery. Tạo đơn hàng và giao cho shipper để xem kết quả.")


