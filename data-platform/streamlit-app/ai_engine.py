"""ai_engine.py - Avengers Coffee AI Analytics Engine"""
import os, re, json, datetime, sqlalchemy, streamlit as st

ANTHROPIC_API_KEY_LOADED = os.getenv("ANTHROPIC_API_KEY", "")

BLOCKED_SQL = ["insert","update","delete","drop","truncate","alter",
               "create","grant","revoke","exec","--","/*"]

QUICK_PROMPTS_VI = [
    "Sản phẩm nào bán chạy nhất 30 ngày qua?",
    "Chi nhánh nào doanh thu cao nhất tuần này?",
    "Khung giờ nào nhiều đơn nhất?",
    "Tỉ lệ Delivery vs Pickup hiện tại?",
    "Chi nhánh nào có tỉ lệ hủy đơn cao bất thường?",
    "Top 5 khách hàng VIP theo tổng chi tiêu?",
    "Doanh thu hôm qua so tuần trước?",
    "Size nào phổ biến nhất buổi sáng?",
]

_SYS = """
Bạn là AI Analyst của Avengers Coffee Data Platform. Trả lời bằng tiếng Việt có dấu chuẩn xác.
QUY TẮC:
1. KHÔNG bịa số liệu - mọi con số PHẢI đến từ tool query_database.
2. Chi nhánh có dia_chi_giao_hang='Dia chi mac dinh' -> gắn nhãn (dữ liệu demo).
3. Insight phải kèm n=..., khoảng thời gian.
4. Chỉ được SELECT. Cấm: INSERT/UPDATE/DELETE/DROP/ALTER/CREATE.
5. Dữ liệu không có trong DB -> nói rõ "Không có dữ liệu này".

SCHEMA:
orders.don_hang: ma_don_hang, co_so_ma(chi nhánh), ma_nguoi_dung,
  tong_tien(VND), ngay_tao(timestamp),
  trang_thai_don_hang(HOAN_THANH/DANG_GIAO/DA_XAC_NHAN/CHO_THANH_TOAN/DA_HUY),
  loai_don_hang(PICKUP/DELIVERY), phuong_thuc_thanh_toan,
  phi_giao_hang, tien_giam_gia,
  dia_chi_giao_hang (='Dia chi mac dinh' = dữ liệu DEMO/synthetic)

orders.chi_tiet_don_hang: ma_chi_tiet, ma_don_hang, ten_san_pham,
  kich_co(S/M/L/Nhỏ/Vừa/Lớn), so_luong(int), gia_ban(numeric)

identity.nguoi_dung: ma_nguoi_dung, ho_ten, email,
  so_dien_thoai, ngay_tao_tai_khoan

KHUNG GIỜ CHUẨN:
CASE WHEN EXTRACT(HOUR FROM ngay_tao) BETWEEN 6 AND 8 THEN 'Sáng sớm (6-9h)'
     WHEN EXTRACT(HOUR FROM ngay_tao) BETWEEN 9 AND 11 THEN 'Buổi sáng (9-12h)'
     WHEN EXTRACT(HOUR FROM ngay_tao) BETWEEN 12 AND 13 THEN 'Buổi trưa (12-14h)'
     WHEN EXTRACT(HOUR FROM ngay_tao) BETWEEN 14 AND 17 THEN 'Buổi chiều (14-18h)'
     WHEN EXTRACT(HOUR FROM ngay_tao) BETWEEN 18 AND 21 THEN 'Buổi tối (18-22h)'
     ELSE 'Tối khuya (22h+)' END

FORMAT: Bắt đầu "Dựa trên [N đơn] trong [thời gian]:", nếu có 2-3 điểm cụ thể,
        kết thúc bằng 1 đề xuất hành động ngắn. Hãy CHẮC CHẮN dùng tiếng Việt có dấu đầy đủ.
"""

_DIGEST_SYS = """
Bạn viết bản tin phân tích ngắn cho đội quản lý Avengers Coffee.
QUY TẮC: Chỉ dùng số liệu được cung cấp. KHÔNG thêm số khác.
Văn phong: ngắn gọn, chuyên nghiệp, bằng tiếng Việt có dấu chuẩn.
Tối đa 4 câu. Nếu không có bất thường: "Hệ thống hoạt động ổn định."
"""


def check_sql(sql):
    s = sql.lower().strip()
    for k in BLOCKED_SQL:
        if k in s:
            return False, f"Bi chan: tu khoa '{k}'"
    if not re.match(r"^\s*select\b", s, re.IGNORECASE):
        return False, "Chi cho phep SELECT"
    return True, ""


def run_sql(sql, engine):
    ok, err = check_sql(sql)
    if not ok:
        return {"error": err, "rows": [], "columns": [], "n": 0}
    try:
        with engine.connect() as conn:
            r = conn.execute(sqlalchemy.text(sql))
            cols = list(r.keys())
            rows = [list(x) for x in r.fetchmany(200)]
        return {"error": None, "columns": cols, "rows": rows, "n": len(rows)}
    except Exception as e:
        return {"error": str(e), "rows": [], "columns": [], "n": 0}


def fmt_result(r):
    if r["error"]:
        return f"LOI: {r['error']}"
    if not r["rows"]:
        return "Khong co du lieu."
    h = " | ".join(str(c) for c in r["columns"])
    b = "\n".join(" | ".join(str(v) for v in row) for row in r["rows"][:50])
    t = f"Ket qua ({r['n']} dong):\n{h}\n{b}"
    if r["n"] > 50:
        t += f"\n...(50/{r['n']} dong dau)"
    return t


def _init_tables(engine):
    try:
        with engine.begin() as c:
            c.execute(sqlalchemy.text("CREATE SCHEMA IF NOT EXISTS analytics"))
            c.execute(sqlalchemy.text("""
                CREATE TABLE IF NOT EXISTS analytics.ai_logs (
                    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                    session_id TEXT, chart TEXT, question TEXT,
                    sql_queries JSONB, answer TEXT,
                    ts TIMESTAMP DEFAULT NOW()
                )"""))
            c.execute(sqlalchemy.text("""
                CREATE TABLE IF NOT EXISTS analytics.morning_digest (
                    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                    digest_date DATE UNIQUE NOT NULL,
                    anomalies JSONB, narrative TEXT,
                    ts TIMESTAMP DEFAULT NOW()
                )"""))
    except Exception:
        pass


def log_qa(engine, sid, chart, question, sqls, answer):
    try:
        _init_tables(engine)
        with engine.begin() as c:
            c.execute(sqlalchemy.text("""
                INSERT INTO analytics.ai_logs
                (session_id,chart,question,sql_queries,answer)
                VALUES(:s,:c,:q,:sq::jsonb,:a)
            """), {"s": sid, "c": chart, "q": question,
                   "sq": json.dumps(sqls, ensure_ascii=False), "a": answer})
    except Exception:
        pass


GROQ_API_KEY_LOADED = os.getenv("GROQ_API_KEY", "")

def call_groq(messages, tools=None):
    if not GROQ_API_KEY_LOADED:
        raise Exception("Chưa có GROQ_API_KEY trong file .env")
    import requests
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY_LOADED}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": messages,
        "temperature": 0.1,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"

    resp = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload, timeout=30)
    if resp.status_code != 200:
        raise Exception(f"Error {resp.status_code}: {resp.text}")
    return resp.json()


def call_ai(question, history, engine, chart_context=None):
    """Call Groq AI. Returns (answer_str, sqls_list)."""
    tools = [{
        "type": "function",
        "function": {
            "name": "query_database",
            "description": "Chay SQL SELECT tren PostgreSQL.",
            "parameters": {
                "type": "object",
                "properties": {"sql": {"type": "string"}},
                "required": ["sql"]
            }
        }
    }]
    content = question
    if chart_context:
        content = f"Phân tích biểu đồ: {question}\n\nDữ liệu biểu đồ:\n{chart_context}"
    
    msgs = [{"role": "system", "content": _SYS}]
    msgs.extend(history)
    msgs.append({"role": "user", "content": content})
    
    sqls = []
    for _ in range(6):
        try:
            data = call_groq(msgs, tools=tools)
        except Exception as e:
            return f"Lỗi API: {e}", sqls
            
        if "choices" not in data or not data["choices"]:
            return "Lỗi API: Không nhận được phản hồi.", sqls
            
        choice = data["choices"][0]
        msg = choice["message"]
        
        if choice.get("finish_reason") == "tool_calls" or msg.get("tool_calls"):
            msgs.append(msg)
            for tc in msg.get("tool_calls", []):
                if tc["function"]["name"] == "query_database":
                    try:
                        args = json.loads(tc["function"]["arguments"])
                        sql = args.get("sql", "")
                    except Exception:
                        sql = ""
                    sqls.append(sql)
                    result_str = fmt_result(run_sql(sql, engine))
                    msgs.append({
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "name": tc["function"]["name"],
                        "content": result_str
                    })
        else:
            return msg.get("content", ""), sqls
            
    return "Lỗi xử lý. Vui lòng thử lại.", sqls


@st.cache_data(ttl=3600, show_spinner=False)
def generate_tab_insights(tab_name, data_context):
    """Generates premium insights for a specific tab based on data context."""
    sys_prompt = f"""Bạn là AI Analyst cấp cao của Avengers Coffee.
Nhiệm vụ: Phân tích dữ liệu từ Tab '{tab_name}' và đưa ra Insight "bén", cao cấp.
Viết bằng tiếng Việt có dấu, phong cách chuyên nghiệp, thuyết phục sếp (C-level).
Không quá 4 câu. CHẮC CHẮN dùng tiếng Việt có dấu. Không cần giới thiệu dài dòng."""
    
    msgs = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": f"Dữ liệu của tab '{tab_name}':\n{data_context}\nHãy phân tích và giải thích ý nghĩa kinh doanh."}
    ]
    try:
        resp = call_groq(msgs)
        return resp["choices"][0]["message"].get("content", "")
    except Exception as e:
        return f"(AI chưa thể tạo insight lúc này: {e})"


def _get_anomalies(engine):
    sql = """
    WITH daily AS (
        SELECT co_so_ma AS branch, DATE(ngay_tao) AS dt,
            COUNT(*) AS cnt, COALESCE(SUM(tong_tien),0) AS rev
        FROM orders.don_hang
        WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO','DA_XAC_NHAN')
          AND ngay_tao >= CURRENT_DATE - INTERVAL '31 days'
          AND (dia_chi_giao_hang IS NULL OR dia_chi_giao_hang != 'Dia chi mac dinh')
        GROUP BY co_so_ma, DATE(ngay_tao)
    ),
    yday AS (SELECT branch, cnt, rev FROM daily WHERE dt = CURRENT_DATE - 1),
    base AS (
        SELECT branch, AVG(cnt) AS avg_cnt, AVG(rev) AS avg_rev
        FROM daily WHERE dt BETWEEN CURRENT_DATE-8 AND CURRENT_DATE-2
        GROUP BY branch
    )
    SELECT y.branch,
        y.cnt AS yday_orders, ROUND(b.avg_cnt::numeric,1) AS base_orders,
        ROUND(y.rev::numeric,0) AS yday_rev, ROUND(b.avg_rev::numeric,0) AS base_rev,
        ROUND(100.0*(y.rev-b.avg_rev)/NULLIF(b.avg_rev,0),1) AS rev_pct,
        ROUND(100.0*(y.cnt-b.avg_cnt)/NULLIF(b.avg_cnt,0),1) AS ord_pct
    FROM yday y JOIN base b ON y.branch=b.branch
    WHERE ABS(100.0*(y.rev-b.avg_rev)/NULLIF(b.avg_rev,0)) >= 15
    ORDER BY ABS(rev_pct) DESC LIMIT 8
    """
    r = run_sql(sql, engine)
    if r["error"] or not r["rows"]:
        return []
    return [dict(zip(r["columns"], row)) for row in r["rows"]]


def _write_narrative(anomalies):
    if not anomalies:
        return "Hệ thống hoạt động ổn định trong 24h qua. Không phát hiện bất thường."

    def v(x):
        try:
            f = float(x)
            return f"{f/1e6:.1f}tr" if f >= 1e6 else f"{f/1e3:.0f}k"
        except Exception:
            return str(x)

    lines = []
    for a in anomalies:
        chg = float(a.get("rev_pct", 0) or 0)
        sign = "tăng" if chg > 0 else "giảm"
        lines.append(f"- {a['branch']}: DT {v(a['yday_rev'])} ({sign} {abs(chg):.1f}% vs {v(a['base_rev'])}), Đơn {a['yday_orders']} vs {a['base_orders']}")
    data = "Bất thường hôm qua:\n" + "\n".join(lines)
    
    msgs = [
        {"role": "system", "content": _DIGEST_SYS},
        {"role": "user", "content": data}
    ]
    try:
        resp = call_groq(msgs)
        return resp["choices"][0]["message"].get("content", "")
    except Exception as e:
        return f"(Lỗi AI: {e})"


@st.cache_data(ttl=3600, show_spinner=False)
def get_digest(_sig, _engine):
    today = datetime.date.today()
    _init_tables(_engine)
    try:
        with _engine.connect() as c:
            row = c.execute(sqlalchemy.text(
                "SELECT narrative, anomalies, ts FROM analytics.morning_digest "
                "WHERE digest_date=:d LIMIT 1"), {"d": today}).fetchone()
            if row:
                return {"date": today, "narrative": row[0],
                        "anomalies": row[1] or [], "ts": row[2], "cached": True}
    except Exception:
        pass
    anomalies = _get_anomalies(_engine)
    narrative = _write_narrative(anomalies)
    try:
        with _engine.begin() as c:
            c.execute(sqlalchemy.text("""
                INSERT INTO analytics.morning_digest(digest_date,anomalies,narrative)
                VALUES(:d,:a::jsonb,:n)
                ON CONFLICT(digest_date) DO UPDATE
                SET anomalies=EXCLUDED.anomalies,narrative=EXCLUDED.narrative,ts=NOW()
            """), {"d": today, "a": json.dumps(anomalies, ensure_ascii=False), "n": narrative})
    except Exception:
        pass
    return {"date": today, "narrative": narrative, "anomalies": anomalies,
            "ts": datetime.datetime.now(), "cached": False}


def render_insight_btn(label, context_str, engine, session_id, key):
    if not ANTHROPIC_API_KEY_LOADED:
        st.caption("AI insight: can ANTHROPIC_API_KEY")
        return
    sk = f"ai_res_{key}"
    if st.button("AI Phan tich", key=f"ai_btn_{key}", use_container_width=False,
                 help="Claude AI phan tich bieu do nay"):
        with st.spinner("AI dang phan tich..."):
            ans, sqls = call_ai(label, [], engine, context_str)
            st.session_state[sk] = {"text": ans, "sqls": sqls}
            log_qa(engine, session_id, label, label, sqls, ans)
        st.rerun()
    if st.session_state.get(sk):
        d = st.session_state[sk]
        st.info(d["text"])
        if d.get("sqls"):
            with st.expander(f"SQL da chay ({len(d['sqls'])} queries)"):
                for s in d["sqls"]:
                    st.code(s, language="sql")
        if st.button("Dong", key=f"ai_close_{key}"):
            del st.session_state[sk]
            st.rerun()


def render_morning_digest(engine, session_id):
    if not ANTHROPIC_API_KEY_LOADED:
        return
    c1, c2 = st.columns([5, 1])
    c1.markdown("### Ban tin AI Sang nay")
    if c2.button("Lam moi", key="digest_refresh"):
        get_digest.clear()
        st.rerun()
    with st.spinner("AI dang tong hop..."):
        try:
            d = get_digest(str(engine.url), engine)
        except Exception as e:
            st.warning(f"Khong tai duoc ban tin: {e}")
            return
    anomalies = d.get("anomalies", [])
    narrative = d.get("narrative", "")
    ts = d.get("ts", "")
    ts_str = ts.strftime("%H:%M %d/%m/%Y") if hasattr(ts, "strftime") else str(ts)[:16]
    has_warn = any(abs(float(a.get("rev_pct", 0) or 0)) >= 25 for a in anomalies)
    if has_warn:
        st.error(f"Ban tin AI ({ts_str}):\n{narrative}")
    elif anomalies:
        st.warning(f"Ban tin AI ({ts_str}):\n{narrative}")
    else:
        st.success(f"Ban tin AI ({ts_str}):\n{narrative}")
    if anomalies:
        cols = st.columns(min(len(anomalies), 3))
        for i, a in enumerate(anomalies[:3]):
            chg = float(a.get("rev_pct", 0) or 0)
            arrow = "tang" if chg > 0 else "giam"
            with cols[i % 3]:
                st.metric(a.get("branch", ""), f"{arrow} {abs(chg):.1f}%",
                          f"Don: {a.get('yday_orders',0)}")
    st.markdown("---")
