"""
14_AI_Module_Builder.py
Avengers Coffee - AI Agent Module Builder
Cho phép Admin tự định nghĩa module phân tích mới,
AI Agent tự động sinh SQL, biểu đồ và insight từ dữ liệu thực.
"""
import os, json, uuid, datetime
import streamlit as st
import pandas as pd
import plotly.express as px
import requests
import sqlalchemy
from utils import get_engine
from components import render_sidebar
from styles import inject_styles, init_plotly_template

# ── Page Config ──────────────────────────────────────────────────────────────
st.set_page_config(page_title="AI Module Builder", page_icon="🧠", layout="wide")
inject_styles()
init_plotly_template()
render_sidebar()

# ── API ───────────────────────────────────────────────────────────────────────
GROQ_KEY = os.getenv("MODULE_BUILDER_API_KEY", "").split(",")[0].strip()

# ── Schema tĩnh để AI hiểu ──────────────────────────────────────────────────
TABLE_COLUMNS = {
    "orders.don_hang": [
        "ma_don_hang", "ma_nguoi_dung", "tong_tien", "dia_chi_giao_hang",
        "phuong_thuc_thanh_toan", "trang_thai_don_hang", "loai_don_hang",
        "ngay_tao", "ngay_cap_nhat", "co_so_ma",
    ],
    "orders.chi_tiet_don_hang": [
        "id", "ma_don_hang", "ma_san_pham", "ten_san_pham",
        "gia_ban", "so_luong", "kich_co", "loai_sua", "do_ngot",
    ],
    "identity.chi_nhanh": [
        "ma_chi_nhanh", "ten_chi_nhanh", "dia_chi", "thanh_pho",
        "trang_thai", "loai_diem_ban", "vi_do", "kinh_do",
    ],
    "identity.nguoi_dung": [
        "ma_nguoi_dung", "ho_ten", "email", "so_dien_thoai",
        "diem_loyalty", "tong_chi_tieu", "ngay_tao", "vai_tro",
    ],
    "franchise.kiosk": [
        "ma_kiosk", "ten_kiosk", "dia_chi", "thanh_pho",
        "trang_thai", "vi_do", "kinh_do",
    ],
}

JOIN_HINTS = """
-- JOIN phổ biến:
-- orders.don_hang d JOIN orders.chi_tiet_don_hang ct ON ct.ma_don_hang = d.ma_don_hang
-- orders.don_hang d JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
-- orders.don_hang d JOIN identity.nguoi_dung u ON d.ma_nguoi_dung = u.ma_nguoi_dung
-- identity.chi_nhanh cn JOIN franchise.kiosk k ON cn.ma_chi_nhanh = k.ma_kiosk
"""

CHART_TYPES = {
    "Cột (Bar)": "bar",
    "Đường (Line)": "line",
    "Tròn (Pie)": "pie",
    "Tán xạ (Scatter)": "scatter",
    "Bảng dữ liệu (Table)": "table",
}

# ── Helpers ───────────────────────────────────────────────────────────────────
def call_groq(messages, temperature=0.15):
    if not GROQ_KEY:
        raise Exception("Chưa có MODULE_BUILDER_API_KEY")
    resp = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {GROQ_KEY}", "Content-Type": "application/json"},
        json={"model": "groq/compound", "messages": messages, "temperature": temperature},
        timeout=30,
    )
    if resp.status_code != 200:
        raise Exception(f"Groq Error {resp.status_code}: {resp.text[:300]}")
    return resp.json()["choices"][0]["message"]["content"]


def run_sql_safe(sql: str, engine) -> pd.DataFrame:
    blocked = ["insert", "update", "delete", "drop", "truncate", "alter", "create", "grant"]
    if any(kw in sql.lower() for kw in blocked):
        raise ValueError("Chỉ cho phép SELECT")
    with engine.connect() as conn:
        return pd.read_sql(sqlalchemy.text(sql), conn)


def save_module(engine, module: dict):
    import psycopg2.extras
    bd = module.get("bang_du_lieu", []) or []
    cp = module.get("cot_phan_tich", []) or []
    ac = json.dumps(module.get("ai_config", {}), ensure_ascii=False)
    dc = json.dumps(module.get("dashboard_config", {}), ensure_ascii=False)
    with engine.begin() as conn:
        conn.execute(sqlalchemy.text("""
            INSERT INTO analytics.ai_modules
              (id, ten_module, muc_tieu, gia_tri, ket_qua_mong_muon,
               bang_du_lieu, cot_phan_tich, ai_config, dashboard_config, trang_thai)
            VALUES (
              :id, :ten, :mt, :gt, :kq,
              CAST(:bd AS text[]), CAST(:cp AS text[]),
              CAST(:ac AS jsonb), CAST(:dc AS jsonb), :ts
            )
            ON CONFLICT(id) DO UPDATE SET
              ten_module=EXCLUDED.ten_module, muc_tieu=EXCLUDED.muc_tieu,
              gia_tri=EXCLUDED.gia_tri, ket_qua_mong_muon=EXCLUDED.ket_qua_mong_muon,
              bang_du_lieu=EXCLUDED.bang_du_lieu, cot_phan_tich=EXCLUDED.cot_phan_tich,
              ai_config=EXCLUDED.ai_config, dashboard_config=EXCLUDED.dashboard_config,
              trang_thai=EXCLUDED.trang_thai, updated_at=NOW()
        """), {
            "id": module["id"], "ten": module["ten_module"],
            "mt": module.get("muc_tieu", ""), "gt": module.get("gia_tri", ""),
            "kq": module.get("ket_qua_mong_muon", ""),
            "bd": "{"+",".join(bd)+"}",
            "cp": "{"+",".join(cp)+"}",
            "ac": ac, "dc": dc,
            "ts": module.get("trang_thai", "DANG_CHAY"),
        })


def load_modules(engine) -> list:
    try:
        with engine.connect() as conn:
            rows = conn.execute(sqlalchemy.text(
                "SELECT * FROM analytics.ai_modules ORDER BY created_at DESC LIMIT 50"
            )).fetchall()
            cols = ["id", "ten_module", "muc_tieu", "gia_tri", "ket_qua_mong_muon",
                    "bang_du_lieu", "cot_phan_tich", "ai_config", "dashboard_config",
                    "trang_thai", "created_at", "updated_at"]
            return [dict(zip(cols, r)) for r in rows]
    except Exception:
        return []


def delete_module(engine, mod_id: str):
    with engine.begin() as conn:
        conn.execute(sqlalchemy.text(
            "DELETE FROM analytics.ai_modules WHERE id=:id"), {"id": mod_id})


def ai_generate_sql(module: dict) -> str:
    # Build schema hint từ các bảng được chọn
    schema_hint = ""
    for tbl in module.get("bang_du_lieu", []):
        cols = TABLE_COLUMNS.get(tbl, [])
        schema_hint += f"\n{tbl}: {', '.join(cols)}"

    cols_selected = module.get("cot_phan_tich", [])
    cols_hint = f"\nCột được chọn để phân tích: {', '.join(cols_selected)}" if cols_selected else ""

    prompt = f"""Bạn là AI Data Engineer cho Avengers Coffee.
Sinh 1 câu SQL SELECT chạy trên PostgreSQL dựa trên yêu cầu dưới đây.

TÊN MODULE: {module['ten_module']}
MỤC TIÊU: {module['muc_tieu']}
KẾT QUẢ MONG MUỐN: {module['ket_qua_mong_muon']}

BẢNG DỮ LIỆU CÓ THỂ DÙNG:{schema_hint}
{cols_hint}

GỢI Ý JOIN:{JOIN_HINTS}

YÊU CẦU SQL:
- Chỉ trả về SQL thuần, không giải thích, không markdown.
- Dữ liệu 90 ngày gần nhất (ngay_tao >= NOW() - INTERVAL '90 days').
- Alias cột rõ ràng bằng tiếng Anh.
- LIMIT tối đa 200.
- Nếu cần JOIN nhiều bảng thì JOIN đúng.
SQL:"""
    raw = call_groq([{"role": "user", "content": prompt}], temperature=0.1)
    sql = raw.strip()
    if "```" in sql:
        for p in sql.split("```"):
            p2 = p.strip().lstrip("sql").strip()
            if p2.lower().startswith("select"):
                return p2
    return sql


def ai_generate_insight(module: dict, df: pd.DataFrame) -> str:
    summary = df.head(15).to_string(index=False)
    prompt = f"""Bạn là AI Analyst của Avengers Coffee.
Phân tích kết quả module '{module['ten_module']}' và viết insight bằng tiếng Việt có dấu.

MỤC TIÊU: {module['muc_tieu']}
KẾT QUẢ MONG MUỐN: {module['ket_qua_mong_muon']}

DỮ LIỆU (top 15 dòng, tổng {len(df)} dòng):
{summary}

Viết 3 điểm ngắn gọn:
• Phát hiện nổi bật nhất
• Xu hướng hoặc bất thường
• Đề xuất hành động cụ thể"""
    return call_groq([{"role": "user", "content": prompt}], temperature=0.3)


def render_chart(df: pd.DataFrame, chart_type: str, title: str):
    if df.empty:
        st.warning("Không có dữ liệu.")
        return
    if chart_type == "table":
        st.dataframe(df, use_container_width=True)
        return

    cols = df.columns.tolist()
    x_col = cols[0]
    num_cols = df.select_dtypes(include="number").columns.tolist()
    y_col = num_cols[0] if num_cols else (cols[1] if len(cols) > 1 else cols[0])

    COLORS = ["#6366F1", "#8B5CF6", "#EC4899", "#F59E0B", "#10B981"]
    base = dict(
        paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(26,26,46,0.6)",
        font=dict(color="#C0C0D8"), title_font=dict(size=15, color="#818CF8"),
        margin=dict(l=16, r=16, t=48, b=16),
    )
    try:
        if chart_type == "bar":
            fig = px.bar(df, x=x_col, y=y_col, title=title, color_discrete_sequence=COLORS)
        elif chart_type == "line":
            fig = px.line(df, x=x_col, y=y_col, title=title, markers=True,
                          color_discrete_sequence=COLORS)
        elif chart_type == "pie":
            fig = px.pie(df, names=x_col, values=y_col if num_cols else None, title=title,
                         color_discrete_sequence=px.colors.qualitative.Set2)
        elif chart_type == "scatter":
            y2 = num_cols[1] if len(num_cols) >= 2 else y_col
            fig = px.scatter(df, x=y_col, y=y2, title=title,
                             hover_data=cols[:4], color_discrete_sequence=COLORS)
        else:
            fig = px.bar(df, x=x_col, y=y_col, title=title, color_discrete_sequence=COLORS)
        fig.update_layout(**base)
        st.plotly_chart(fig, use_container_width=True)
    except Exception as e:
        st.error(f"Lỗi vẽ biểu đồ: {e}")
        st.dataframe(df, use_container_width=True)


# ── Header ────────────────────────────────────────────────────────────────────
import datetime as _dt
_hour = _dt.datetime.now().hour
_greet = "Chào buổi sáng" if _hour < 12 else ("Chào buổi chiều" if _hour < 18 else "Chào buổi tối")

st.markdown(f"""
<div style='background:#FFFFFF; border:1px solid #E4E6EB; border-radius:14px;
            padding:20px 24px; margin-bottom:20px; box-shadow:0 1px 4px rgba(0,0,0,0.06);
            display:flex; align-items:center; justify-content:space-between;'>
  <div>
    <div style='font-size:22px; font-weight:900; color:#0D0D0D; letter-spacing:-0.4px;'>
      {_greet}, Admin 👋
    </div>
    <div style='font-size:13px; color:#9095A1; margin-top:4px;'>
      Tự định nghĩa module phân tích · AI tự động sinh SQL, biểu đồ và báo cáo insight
    </div>
  </div>
  <div style='background:#FEF2F2; border-radius:10px; padding:10px 18px; text-align:center;'>
    <div style='font-size:11px; font-weight:700; color:#B91C1C; text-transform:uppercase; letter-spacing:1px;'>AI Module Builder</div>
    <div style='font-size:11px; color:#9095A1; margin-top:2px;'>Powered by Groq</div>
  </div>
</div>
<hr style='border:none; border-top:1px solid #E4E6EB; margin:0 0 20px;'>
""", unsafe_allow_html=True)


engine = get_engine()
if not engine:
    st.error("Không kết nối được database.")
    st.stop()

tab_create, tab_list, tab_run = st.tabs(["Tạo Module Mới", "Danh Sách Module", "Chạy & Xem Kết Quả"])

# ════════════════════════════════════════════════════════════════
# TAB 1: TẠO MODULE MỚI
# ════════════════════════════════════════════════════════════════
with tab_create:
    col_l, col_r = st.columns([3, 2], gap="large")

    with col_l:
        st.markdown("**Bước 1: Đặt tên & mô tả**")
        ten_module = st.text_input("Tên Module *",
            placeholder="Ví dụ: Phân tích hành vi và profile khách hàng")
        muc_tieu = st.text_area("Mục tiêu phân tích *",
            placeholder="Hiểu rõ hành vi mua hàng của khách để cá nhân hóa marketing...",
            height=90)
        gia_tri = st.text_area("Giá trị mang lại",
            placeholder="Tăng tỷ lệ giữ chân khách hàng, giảm chi phí marketing...",
            height=70)
        ket_qua = st.text_area("Kết quả mong muốn *",
            placeholder="Biểu đồ tần suất mua, top sản phẩm theo nhóm khách...",
            height=70)

    with col_r:
        st.markdown("**Bước 2: Chọn bảng dữ liệu**")
        bang_du_lieu = st.multiselect(
            "Bảng tham gia (có thể chọn nhiều để JOIN)",
            options=list(TABLE_COLUMNS.keys()),
            default=["orders.don_hang"],
        )

        st.markdown("**Bước 3: Chọn cột phân tích**")
        available_cols = []
        for tbl in bang_du_lieu:
            for col in TABLE_COLUMNS.get(tbl, []):
                available_cols.append(f"{tbl}.{col}")

        cot_phan_tich = st.multiselect(
            "Cột cần phân tích (AI sẽ ưu tiên các cột này)",
            options=available_cols,
            default=[],
            help="Chọn để gợi ý cho AI. Nếu không chọn, AI tự quyết định."
        )

        st.markdown("**Bước 4: Loại biểu đồ**")
        chart_choice = st.selectbox("Loại biểu đồ chính", options=list(CHART_TYPES.keys()))

    st.markdown("---")
    c1, c2, c3 = st.columns([1.5, 1.5, 5])
    gen_btn = c1.button("Tạo bằng AI (tự sinh SQL)", type="primary", use_container_width=True)
    quick_btn = c2.button("Tạo nhanh (nhập SQL sau)", use_container_width=True)

    if gen_btn or quick_btn:
        if not ten_module.strip():
            st.error("Vui lòng nhập tên module!")
            st.stop()
        if not muc_tieu.strip():
            st.error("Vui lòng nhập mục tiêu!")
            st.stop()
        if not ket_qua.strip():
            st.error("Vui lòng nhập kết quả mong muốn!")
            st.stop()

        new_module = {
            "id": str(uuid.uuid4()),
            "ten_module": ten_module.strip(),
            "muc_tieu": muc_tieu.strip(),
            "gia_tri": gia_tri.strip(),
            "ket_qua_mong_muon": ket_qua.strip(),
            "bang_du_lieu": bang_du_lieu,
            "cot_phan_tich": [c.split(".")[-1] for c in cot_phan_tich],
            "ai_config": {"chart_type": CHART_TYPES[chart_choice]},
            "dashboard_config": {},
            "trang_thai": "DANG_CHAY",
        }

        if gen_btn and GROQ_KEY:
            with st.spinner("AI đang phân tích yêu cầu và sinh SQL..."):
                try:
                    sql_gen = ai_generate_sql(new_module)
                    new_module["ai_config"]["generated_sql"] = sql_gen
                    st.success("AI đã sinh SQL thành công!")
                    with st.expander("Xem SQL được AI tạo ra"):
                        st.code(sql_gen, language="sql")
                except Exception as e:
                    st.warning(f"AI sinh SQL thất bại ({e}), có thể nhập SQL thủ công ở tab 'Chạy'.")
                    new_module["ai_config"]["generated_sql"] = ""
        else:
            new_module["ai_config"]["generated_sql"] = ""

        try:
            save_module(engine, new_module)
            st.success(f"Module **{ten_module}** đã lưu! Chuyển sang tab 'Chạy & Xem Kết Quả'.")
            st.balloons()
        except Exception as e:
            st.error(f"Lỗi lưu module: {e}")

# ════════════════════════════════════════════════════════════════
# TAB 2: DANH SÁCH MODULE
# ════════════════════════════════════════════════════════════════
with tab_list:
    if st.button("Tải lại", key="reload_mods"):
        st.rerun()

    modules = load_modules(engine)
    if not modules:
        st.info("Chưa có module nào. Hãy tạo ở tab 'Tạo Module Mới'.")
    else:
        st.markdown(f"**{len(modules)} module đã tạo**")
        for i, mod in enumerate(modules):
            status_color = {"DANG_CHAY": "#10B981", "TAM_DUNG": "#F59E0B", "LOI": "#EF4444"}.get(
                mod.get("trang_thai", ""), "#6B6B85")
            with st.container():
                st.markdown(f"""
<div style='background:#1A1A2E; border:1px solid #2A2A3E; border-left:4px solid {status_color};
            border-radius:10px; padding:14px 16px; margin-bottom:10px;'>
  <div style='font-size:16px; font-weight:800; color:#C0C0D8;'>{mod['ten_module']}</div>
  <div style='color:#9090A8; font-size:13px; margin-top:6px; line-height:1.6;'>
    <b>Mục tiêu:</b> {(mod.get('muc_tieu') or '')[:100]}{'...' if len(mod.get('muc_tieu') or '') > 100 else ''}<br>
    <b>Bảng:</b> {', '.join(mod.get('bang_du_lieu') or [])} &nbsp;·&nbsp;
    <b>Tạo:</b> {str(mod.get('created_at', ''))[:16]}
  </div>
</div>""", unsafe_allow_html=True)
                ca, cb, _ = st.columns([1, 1, 5])
                if ca.button("Chạy ngay", key=f"run_{i}", use_container_width=True):
                    st.session_state["amb_run_mod"] = mod["ten_module"]
                    st.info("Chuyển sang tab 'Chạy & Xem Kết Quả' và chọn module này!")
                if cb.button("Xóa", key=f"del_{i}", use_container_width=True):
                    try:
                        delete_module(engine, mod["id"])
                        st.rerun()
                    except Exception as e:
                        st.error(f"Lỗi: {e}")

# ════════════════════════════════════════════════════════════════
# TAB 3: CHẠY & XEM KẾT QUẢ
# ════════════════════════════════════════════════════════════════
with tab_run:
    modules_run = load_modules(engine)
    if not modules_run:
        st.info("Chưa có module. Hãy tạo trước.")
    else:
        mod_map = {m["ten_module"]: m for m in modules_run}
        default_idx = 0
        if st.session_state.get("amb_run_mod") in mod_map:
            default_idx = list(mod_map.keys()).index(st.session_state["amb_run_mod"])

        sel_name = st.selectbox("Chọn module", list(mod_map.keys()), index=default_idx)
        sel = mod_map[sel_name]

        ai_cfg = sel.get("ai_config") or {}
        existing_sql = ai_cfg.get("generated_sql", "")
        chart_type = ai_cfg.get("chart_type", "bar")

        with st.expander("Thông tin module"):
            c1, c2 = st.columns(2)
            c1.markdown(f"**Mục tiêu:** {sel.get('muc_tieu','')}")
            c1.markdown(f"**Giá trị:** {sel.get('gia_tri','')}")
            c2.markdown(f"**Kết quả mong muốn:** {sel.get('ket_qua_mong_muon','')}")
            c2.markdown(f"**Bảng dữ liệu:** {', '.join(sel.get('bang_du_lieu') or [])}")

        st.markdown("**SQL truy vấn**")
        DEFAULT_SQL = """SELECT co_so_ma, COUNT(*) as so_don, SUM(tong_tien) as doanh_thu
FROM orders.don_hang
WHERE trang_thai_don_hang = 'HOAN_THANH'
  AND ngay_tao >= NOW() - INTERVAL '90 days'
GROUP BY co_so_ma ORDER BY doanh_thu DESC LIMIT 30"""

        sql_edit = st.text_area("Chỉnh sửa SQL nếu cần:",
            value=existing_sql if existing_sql else DEFAULT_SQL, height=130)

        col_r1, col_r2, col_r3 = st.columns([1, 1, 1])
        run_btn = col_r1.button("Chạy phân tích", type="primary", use_container_width=True)
        regen_btn = col_r2.button("AI tái sinh SQL", use_container_width=True)
        chart_sel = col_r3.selectbox("Biểu đồ",
            list(CHART_TYPES.keys()),
            index=list(CHART_TYPES.values()).index(chart_type)
                  if chart_type in CHART_TYPES.values() else 0,
            label_visibility="collapsed")

        if regen_btn and GROQ_KEY:
            with st.spinner("AI đang sinh lại SQL..."):
                try:
                    new_sql = ai_generate_sql(sel)
                    st.code(new_sql, language="sql")
                    st.info("Copy SQL trên vào ô bên trái rồi bấm Chạy.")
                except Exception as e:
                    st.error(f"Lỗi: {e}")

        if run_btn:
            if not sql_edit.strip():
                st.error("Chưa có SQL!")
            else:
                with st.spinner("Đang truy vấn..."):
                    try:
                        df_res = run_sql_safe(sql_edit.strip(), engine)
                    except Exception as e:
                        st.error(f"Lỗi SQL: {e}")
                        df_res = pd.DataFrame()

                if not df_res.empty:
                    st.success(f"{len(df_res)} dòng dữ liệu")

                    num_cols = df_res.select_dtypes(include="number").columns.tolist()
                    if num_cols:
                        kpi_cols = st.columns(min(len(num_cols), 4))
                        for ki, nc in enumerate(num_cols[:4]):
                            v = df_res[nc].sum()
                            kpi_cols[ki].metric(nc.replace("_", " ").title(),
                                                f"{v:,.0f}" if v > 999 else f"{v:.2f}")

                    render_chart(df_res, CHART_TYPES[chart_sel], sel["ten_module"])

                    with st.expander("Dữ liệu thô"):
                        st.dataframe(df_res, use_container_width=True)
                        st.download_button("Tải CSV",
                            df_res.to_csv(index=False).encode("utf-8"),
                            f"{sel['ten_module']}.csv", "text/csv")

                    st.markdown("---")
                    if GROQ_KEY and st.button("AI phân tích kết quả"):
                        with st.spinner("AI đang đọc dữ liệu..."):
                            try:
                                insight = ai_generate_insight(sel, df_res)
                                st.session_state[f"insight_{sel['id']}"] = insight
                            except Exception as e:
                                st.error(f"Lỗi AI: {e}")

                    if st.session_state.get(f"insight_{sel['id']}"):
                        st.markdown(f"""
<div style='background:#1A1A2E; border:1px solid #6366F1; border-radius:10px; padding:18px; margin-top:8px;'>
  <div style='font-size:13px; font-weight:700; color:#818CF8; margin-bottom:8px;'>AI Insight</div>
  <div style='color:#C0C0D8; font-size:14px; line-height:1.8; white-space:pre-wrap;'>{st.session_state[f"insight_{sel['id']}"]}</div>
</div>""", unsafe_allow_html=True)
                else:
                    st.warning("Không có dữ liệu. Kiểm tra lại SQL hoặc điều kiện lọc.")

st.markdown("<div style='color:#6B6B85; font-size:12px; text-align:center; margin-top:24px;'>AI Module Builder · Avengers Coffee · Groq LLaMA-3</div>",
            unsafe_allow_html=True)
