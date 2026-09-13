import streamlit as st
import uuid as _uuid_ai5

from utils import get_engine
from components import render_sidebar, render_section_title
from styles import inject_styles, init_plotly_template

# ─── Page Config ──────────────────────────────────────────────────────────────
st.set_page_config(page_title="Trí Tuệ Nhân Tạo (AI)", page_icon="🤖", layout="wide")
inject_styles()
init_plotly_template()
render_sidebar()

st.markdown("<h2 style='margin-bottom:24px; font-weight:800; color:#C0C0D8;'>Trung Tâm Trí Tuệ Nhân Tạo (AI Analytics)</h2>", unsafe_allow_html=True)

try:
    from ai_engine import (
        call_ai, render_morning_digest, log_qa, QUICK_PROMPTS_VI
    )
    AI_ENGINE_OK = True
except ImportError:
    AI_ENGINE_OK = False
    QUICK_PROMPTS_VI = []

st.markdown("""
<div style='background:#1A1A2E; border:1px solid #2A2A3E; border-left:4px solid #6366F1; border-radius:12px; padding:18px; margin-bottom:20px; box-shadow:0 2px 8px rgba(0,0,0,0.5);'>
  <div style='font-size:15px; font-weight:800; color:#818CF8; margin-bottom:4px;'>Trợ Lý Trí Tuệ Nhân Tạo & Bản Tin Phân Tích</div>
  <div style='color:#C0C0D8; font-size:14px; line-height:1.5;'>
    Hệ thống AI tự động tổng hợp dữ liệu, phát hiện biến động bất thường và trực tiếp truy vấn dữ liệu SQL theo câu hỏi của bạn.
  </div>
</div>
""", unsafe_allow_html=True)

if not AI_ENGINE_OK:
    st.error("Chưa kết nối được mô đun ai_engine.py. Vui lòng kiểm tra môi trường.")
else:
    st.success("Mô hình AI LLaMA-3: Trạng thái kết nối thành công")
    _eng5 = get_engine()
    if "ai_sid" not in st.session_state:
        st.session_state.ai_sid = str(_uuid_ai5.uuid4())

    st.markdown("<br>", unsafe_allow_html=True)
    render_section_title("Bản Tin Phân Tích Tổng Hợp")
    if _eng5: render_morning_digest(_eng5, st.session_state.ai_sid)

    st.markdown("<br>", unsafe_allow_html=True)
    render_section_title("Truy Vấn Dữ Liệu Thông Minh")
    if "ai_hist" not in st.session_state: st.session_state.ai_hist = []

    qp_cols = st.columns(4)
    for qi, qp in enumerate(QUICK_PROMPTS_VI):
        if qp_cols[qi % 4].button(qp, key=f"qp5_{qi}", use_container_width=True):
            if _eng5:
                with st.spinner("AI đang truy vấn dữ liệu..."):
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
                    with st.expander(f"Truy vấn SQL đã thực thi ({len(msg['sqls'])} câu truy vấn)"):
                        for s in msg["sqls"]: st.code(s, language="sql")

    if ui := st.chat_input("Nhập câu hỏi phân tích dữ liệu..."):
        st.session_state.ai_hist.append({"role":"user","content":ui,"sqls":[]})
        if _eng5:
            hist = [{"role":m["role"],"content":m["content"]}
                    for m in st.session_state.ai_hist[:-1]][-20:]
            with st.spinner("AI đang truy vấn dữ liệu..."):
                ans, sqls = call_ai(ui, hist, _eng5)
            st.session_state.ai_hist.append({"role":"assistant","content":ans,"sqls":sqls})
            log_qa(_eng5, st.session_state.ai_sid, "chat", ui, sqls, ans)
            st.rerun()

    if st.button("Xóa Lịch Sử Hội Thoại", key="clear_ai5"):
        st.session_state.ai_hist = []
        st.rerun()
