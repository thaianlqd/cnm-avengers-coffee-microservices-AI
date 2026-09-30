import json
import time
import requests
import datetime
from decimal import Decimal
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException
from psycopg2.extras import RealDictCursor
from db import get_db_conn, GEMINI_API_KEY, GROQ_API_KEY
from common import AiTextToReportRequest, AiSummarizeRequest

router = APIRouter(prefix="/api/ai", tags=["AI Data Assistant"])


def json_serial(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, (datetime.date, datetime.datetime)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    return str(obj)


def get_gemini_embedding(text: str) -> List[float]:
    """Generates 768-dim semantic embedding via gemini-embedding-001."""
    if not GEMINI_API_KEY or not text.strip():
        return [0.0] * 768

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key={GEMINI_API_KEY}"
    payload = {
        "content": {"parts": [{"text": text[:3000]}]},
        "outputDimensionality": 768,
    }
    try:
        res = requests.post(url, json=payload, timeout=10)
        if res.status_code == 200:
            return res.json().get("embedding", {}).get("values", [0.0] * 768)
        else:
            print(f"Embedding API error {res.status_code}: {res.text[:150]}")
            return [0.0] * 768
    except Exception as e:
        print(f"Embedding request exception: {e}")
        return [0.0] * 768


def call_gemini_api(prompt_text: str, system_instruction: str = "") -> Optional[Dict[str, Any]]:
    """Calls real Google Gemini API using GEMINI_API_KEY from environment."""
    if not GEMINI_API_KEY:
        return None

    models_to_try = ["gemini-2.5-flash", "gemini-flash-latest"]
    for model in models_to_try:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}"
            full_prompt = f"{system_instruction}\n\n{prompt_text}" if system_instruction else prompt_text
            payload = {
                "contents": [{"parts": [{"text": full_prompt}]}],
                "generationConfig": {
                    "temperature": 0.15,
                    "responseMimeType": "application/json"
                }
            }
            res = requests.post(url, json=payload, timeout=15)
            if res.ok:
                resp_json = res.json()
                raw_text = resp_json["candidates"][0]["content"]["parts"][0]["text"].strip()
                if raw_text.startswith("```json"):
                    raw_text = raw_text[7:]
                if raw_text.startswith("```"):
                    raw_text = raw_text[3:]
                if raw_text.endswith("```"):
                    raw_text = raw_text[:-3]
                return json.loads(raw_text.strip())
            else:
                print(f"Gemini {model} returned status {res.status_code}: {res.text[:200]}")
        except Exception as e:
            print(f"Error calling Gemini {model}: {e}")
            continue

    return None


def call_groq_api(prompt_text: str, system_instruction: str = "") -> Optional[Dict[str, Any]]:
    """Calls Groq API with ultra-fast models openai/gpt-oss-120b and qwen/qwen3.8-27b."""
    if not GROQ_API_KEY:
        return None

    models = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b"]
    for m in models:
        try:
            url = "https://api.groq.com/openai/v1/chat/completions"
            headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
            messages = []
            if system_instruction:
                messages.append({"role": "system", "content": system_instruction})
            messages.append({"role": "user", "content": prompt_text})

            payload = {
                "model": m,
                "messages": messages,
                "response_format": {"type": "json_object"},
                "temperature": 0.15
            }
            res = requests.post(url, json=payload, headers=headers, timeout=12)
            if res.ok:
                resp_json = res.json()
                raw_text = resp_json["choices"][0]["message"]["content"]
                return json.loads(raw_text)
            else:
                print(f"Groq {m} returned {res.status_code}: {res.text[:120]}")
        except Exception as e:
            print(f"Groq {m} error: {e}")
            continue

    return None


def call_llm(prompt_text: str, system_instruction: str = "") -> Optional[Dict[str, Any]]:
    """Primary router: attempts Gemini 2.5 Flash first, then Groq."""
    result = call_gemini_api(prompt_text, system_instruction)
    if result:
        return result
    return call_groq_api(prompt_text, system_instruction)


def retrieve_semantic_context(user_prompt: str) -> Dict[str, Any]:
    """
    RAG over Schema Catalog and Foreign Key Relationships using PostgreSQL pgvector.
    Retrieves the actual tables, columns, grain, and join clauses dynamically.
    """
    vec = get_gemini_embedding(user_prompt)
    retrieved = {
        "tables_markdown": [],
        "table_list": [],
        "join_clauses": []
    }

    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                # 1. Retrieve top 4 most relevant tables by cosine distance
                cur.execute("""
                    SELECT schema_name, table_name, domain_name, summary_markdown,
                           1 - (embedding <=> %s::vector) AS similarity
                    FROM ai_agent.schema_catalog
                    ORDER BY embedding <=> %s::vector ASC
                    LIMIT 4;
                """, (vec, vec))
                rows = cur.fetchall()
                for r in rows:
                    full_name = f"{r['schema_name']}.{r['table_name']}"
                    retrieved["table_list"].append(full_name)
                    retrieved["tables_markdown"].append(r["summary_markdown"])

                # 2. Retrieve verified join paths
                if retrieved["table_list"]:
                    cur.execute("""
                        SELECT join_clause, business_context 
                        FROM ai_agent.table_relationships 
                        WHERE from_table = ANY(%s) OR to_table = ANY(%s);
                    """, (retrieved["table_list"], retrieved["table_list"]))
                    joins = cur.fetchall()
                    for j in joins:
                        retrieved["join_clauses"].append(f"- {j['join_clause']} ({j['business_context']})")

    except Exception as e:
        print(f"Lỗi truy vấn Vector DB Schema Catalog: {e}")

    return retrieved


def format_schema_context(retrieved: Dict[str, Any]) -> str:
    """Formats retrieved tables, columns, and foreign key relationships into prompt."""
    lines = ["=== KHO DỮ LIỆU VÀ CẤU TRÚC BẢNG (SEMANTIC DATA CATALOG TỪ VECTOR DB) ==="]
    lines.extend(retrieved.get("tables_markdown", []))

    if retrieved.get("join_clauses"):
        lines.append("\n=== CÁC ĐƯỜNG DẪN LIÊN KẾT BẢNG CHUẨN (JOIN CLAUSES BẮT BUỘC DÙNG) ===")
        lines.extend(retrieved["join_clauses"])

    lines.append("""
=== QUY TẮC SQL POSTGRESQL CHUẨN XÁC ===
1. CHỈ sinh câu lệnh SELECT an toàn (tuyệt đối không dùng UPDATE, DELETE, INSERT, DROP, ALTER).
2. Khi người dùng hỏi hôm nay ('hôm nay' / 'today'), sử dụng `DATE(ngay_tao) = CURRENT_DATE`.
3. Khi người dùng hỏi 7 ngày qua, sử dụng `ngay_tao >= CURRENT_DATE - INTERVAL '6 days'`.
4. Khi người dùng hỏi 30 ngày qua, sử dụng `ngay_tao >= CURRENT_DATE - INTERVAL '29 days'`.
5. Đơn hàng hoàn tất hợp lệ: `trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')`.
6. Tên bí danh cột: BẮT BUỘC bọc trong nháy kép tiếng Việt có dấu (ví dụ: AS "Tên Sản Phẩm", AS "Doanh Thu (VNĐ)").
7. QUY TẮC ĐẶC BIỆT CHO 2 BIỂU ĐỒ:
   - trend_sql: BẮT BUỘC trả về 2 cột: `date` (chuỗi ngày 'YYYY-MM-DD' hoặc giờ 'HH:00') và `revenue` (số tiền hoặc số lượng). Có thể truy vấn từ `gold.revenue_daily` hoặc `orders.don_hang`.
   - breakdown_sql: BẮT BUỘC trả về 2 cột: `name` (tên danh mục, tên món, hoặc kênh thanh toán) và `value` (số tiền hoặc số lượng).
""")
    return "\n".join(lines)


@router.post("/generate-executive-report")
def generate_executive_report(payload: AiTextToReportRequest):
    user_prompt = payload.prompt.strip() if payload.prompt else "Báo cáo tổng quan hiệu suất và doanh thu toàn chuỗi"
    start_time = time.time()

    # Step 1: Semantic Context Retrieval from PostgreSQL Vector DB
    retrieved = retrieve_semantic_context(user_prompt)
    schema_prompt = format_schema_context(retrieved)

    # Step 2: Agent Planning & Text-to-SQL with Self-Healing Loop
    planner_instruction = f"""
Bạn là Chuyên gia Kiến trúc Dữ liệu và Phân tích Trí tuệ Nhân tạo cho Data Warehouse của Avengers Coffee BeanSync.
Nhiệm vụ: Phân tích yêu cầu nghiệp vụ của người dùng, sử dụng các bảng, mối quan hệ JOIN và cấu trúc cột được cung cấp dưới đây để sinh kế hoạch phân tích và các câu truy vấn PostgreSQL chuẩn xác.

{schema_prompt}
"""

    generation_prompt = f"""
Yêu cầu phân tích: "{user_prompt}"

Hãy sinh đối tượng JSON với cấu trúc:
{{
  "title": "Tiêu đề tiếng Việt chuyên nghiệp, ngắn gọn (không dùng emoji, không dùng ký tự lạ)",
  "description": "Mô tả mục tiêu phân tích trong 1 câu ngắn",
  "main_sql": "SELECT ... FROM ... (Truy vấn bảng chi tiết, LIMIT 15, bí danh tiếng Việt trong nháy kép)",
  "trend_sql": "SELECT ... AS date, ... AS revenue FROM ... (Truy vấn chuỗi thời gian, trả về 2 cột date và revenue, tối đa 30 điểm)",
  "breakdown_sql": "SELECT ... AS name, ... AS value FROM ... (Truy vấn cơ cấu phân bổ, trả về 2 cột name và value, LIMIT 6)",
  "kpi_sql": "SELECT COUNT(*) as total_orders, COALESCE(SUM(tong_tien), 0) as total_revenue, ROUND(AVG(tong_tien), 0) as aov, ROUND(100.0 * COUNT(*) FILTER (WHERE trang_thai_don_hang = 'HOAN_THANH') / NULLIF(COUNT(*), 0), 1) as completion_rate FROM orders.don_hang WHERE ... (Khớp đúng khoảng thời gian của câu hỏi)"
}}
"""

    plan = call_llm(generation_prompt, planner_instruction)

    # Step 3: Execution and Self-Healing Loop
    table_rows = []
    table_cols = []
    trend_data = []
    breakdown_data = []
    kpi_dict = {
        "revenue": 0.0,
        "revenue_growth": 0.0,
        "orders": 0,
        "orders_growth": 0.0,
        "aov": 0.0,
        "completion_rate": 0.0
    }
    
    execution_status = "SUCCESS"
    attempts = 1
    last_error = ""
    executed_sql = ""

    if not plan or not isinstance(plan, dict):
        raise HTTPException(status_code=500, detail="Không thể khởi tạo kế hoạch phân tích từ mô hình AI.")

    max_healing_retries = 2
    for attempt_idx in range(max_healing_retries + 1):
        attempts = attempt_idx + 1
        executed_sql = plan.get("main_sql", "").strip()
        trend_sql = plan.get("trend_sql", "").strip()
        breakdown_sql = plan.get("breakdown_sql", "").strip()
        kpi_sql = plan.get("kpi_sql", "").strip()

        has_error = False
        error_msg = ""

        try:
            with get_db_conn() as conn:
                with conn.cursor() as cur:
                    # Execute Main Table SQL
                    if executed_sql:
                        cur.execute(executed_sql)
                        raw_rows = cur.fetchall()
                        if raw_rows:
                            table_rows = [dict(r) for r in raw_rows]
                            table_cols = list(table_rows[0].keys())

                    # Execute Trend SQL
                    if trend_sql:
                        try:
                            cur.execute(trend_sql)
                            t_rows = cur.fetchall()
                            if t_rows:
                                trend_data = []
                                for r in t_rows:
                                    r_dict = dict(r)
                                    d_val = r_dict.get("date") or r_dict.get("ngay") or list(r_dict.values())[0]
                                    v_val = r_dict.get("revenue") or r_dict.get("doanh_thu") or (list(r_dict.values())[1] if len(r_dict) > 1 else 0)
                                    trend_data.append({"date": str(d_val), "revenue": float(v_val or 0)})
                        except Exception as t_err:
                            print(f"Lỗi trend_sql: {t_err}")

                    # Execute Breakdown SQL
                    if breakdown_sql:
                        try:
                            cur.execute(breakdown_sql)
                            b_rows = cur.fetchall()
                            if b_rows:
                                breakdown_data = []
                                for r in b_rows:
                                    r_dict = dict(r)
                                    n_val = r_dict.get("name") or r_dict.get("ten") or list(r_dict.values())[0]
                                    v_val = r_dict.get("value") or r_dict.get("gia_tri") or (list(r_dict.values())[1] if len(r_dict) > 1 else 0)
                                    breakdown_data.append({"name": str(n_val or "Khác"), "value": float(v_val or 0)})
                        except Exception as b_err:
                            print(f"Lỗi breakdown_sql: {b_err}")

                    # Execute KPI SQL
                    if kpi_sql:
                        try:
                            cur.execute(kpi_sql)
                            k_row = cur.fetchone()
                            if k_row:
                                kpi_dict["revenue"] = float(k_row.get("total_revenue") or 0.0)
                                kpi_dict["orders"] = int(k_row.get("total_orders") or 0)
                                kpi_dict["aov"] = float(k_row.get("aov") or 0.0)
                                kpi_dict["completion_rate"] = float(k_row.get("completion_rate") or 0.0)
                        except Exception as k_err:
                            print(f"Lỗi kpi_sql: {k_err}")

        except Exception as sql_err:
            has_error = True
            error_msg = str(sql_err)
            last_error = error_msg
            print(f"Self-Healing: SQL Execution attempt {attempts} failed: {error_msg}")

        # If executed cleanly without main table error, break
        if not has_error and table_rows:
            if attempt_idx > 0:
                execution_status = "HEALED"
            break

        # If failed and retries remain, ask LLM to heal
        if attempt_idx < max_healing_retries:
            healing_prompt = f"""
Câu lệnh SQL trước đó thực thi trên PostgreSQL bị lỗi:
LỖI CỤ THỂ: {error_msg}

CÂU LỆNH BỊ LỖI:
{executed_sql}

CÁC BẢNG VÀ CỘT HỢP LỆ TRONG DATABASE:
{schema_prompt}

Hãy sửa lại câu lệnh SQL để khắc phục lỗi trên và trả về JSON:
{{
  "title": "{plan.get('title', 'Báo cáo Phân tích')}",
  "description": "{plan.get('description', '')}",
  "main_sql": "SELECT ... (đã sửa lỗi)",
  "trend_sql": "{trend_sql}",
  "breakdown_sql": "{breakdown_sql}",
  "kpi_sql": "{kpi_sql}"
}}
"""
            healed_plan = call_llm(healing_prompt, "Bạn là chuyên gia sửa lỗi SQL PostgreSQL. Hãy sửa lỗi truy vấn chính xác.")
            if healed_plan and isinstance(healed_plan, dict) and "main_sql" in healed_plan:
                plan = healed_plan
        else:
            execution_status = "FAILED"

    # Step 3.1: Guarantee Charts Have Real Data (No Empty UI)
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                # If trend chart is empty, fetch real 30-day trend from gold.revenue_daily
                if not trend_data:
                    cur.execute("SELECT date, revenue FROM gold.revenue_daily ORDER BY date ASC LIMIT 30;")
                    trend_data = [{"date": str(r["date"]), "revenue": float(r["revenue"] or 0)} for r in cur.fetchall()]

                # If breakdown chart is empty, derive from top products or table_rows
                if not breakdown_data and table_rows:
                    text_col = None
                    num_col = None
                    for c in table_cols:
                        if not text_col and any(isinstance(r.get(c), str) for r in table_rows):
                            text_col = c
                        if not num_col and any(isinstance(r.get(c), (int, float, Decimal)) for r in table_rows):
                            num_col = c
                    if text_col and num_col:
                        breakdown_data = [{"name": str(r.get(text_col) or "Khác"), "value": float(r.get(num_col) or 0)} for r in table_rows[:5]]

                if not breakdown_data:
                    cur.execute("SELECT ten_san_pham as name, total_revenue as value FROM gold.top_products ORDER BY total_revenue DESC LIMIT 5;")
                    breakdown_data = [{"name": str(r["name"]), "value": float(r["value"] or 0)} for r in cur.fetchall()]
    except Exception as chart_err:
        print(f"Error ensuring chart data: {chart_err}")

    # Fallback KPIs from table rows if kpi_dict is 0 but table has data
    if kpi_dict["revenue"] == 0 and table_rows:
        sum_rev = 0
        for r in table_rows:
            for k, v in r.items():
                if any(x in k.lower() for x in ["tiền", "doanh thu", "revenue", "tổng"]):
                    if isinstance(v, (int, float, Decimal)):
                        sum_rev += float(v)
        if sum_rev > 0:
            kpi_dict["revenue"] = sum_rev
            kpi_dict["orders"] = len(table_rows)
            kpi_dict["aov"] = round(sum_rev / len(table_rows))
            kpi_dict["completion_rate"] = 100.0

    # Step 4: Dynamic Executive Synthesis (Strictly grounded in real database rows)
    synthesis_prompt = f"""
Bạn là Chuyên gia Trưởng Phân tích Dữ liệu chuỗi Avengers Coffee.
Yêu cầu phân tích: "{user_prompt}"
Tiêu đề báo cáo: "{plan.get('title')}"

DỮ LIỆU THỰC TẾ TRÍCH XUẤT TỪ DATABASE POSTGRESQL (TỐI ĐA 8 DÒNG):
{json.dumps(table_rows[:8], ensure_ascii=False, default=json_serial)}

CHỈ SỐ TỔNG HỢP:
- Doanh thu: {kpi_dict['revenue']:,.0f} VNĐ
- Tổng đơn hàng: {kpi_dict['orders']}
- AOV: {kpi_dict['aov']:,.0f} VNĐ
- Tỷ lệ hoàn thành: {kpi_dict['completion_rate']}%

QUY TẮC BẮT BUỘC ĐỂ TRÁNH BỊA SỐ LIỆU:
1. Bạn CHỈ ĐƯỢC PHÉP phân tích, so sánh và nhắc đến các tên sản phẩm, tên cửa hàng và các con số CÓ MẶT TRONG DỮ LIỆU THẬT Ở TRÊN.
2. TUYỆT ĐỐI KHÔNG tự nghĩ ra bất kỳ tên món ăn (ví dụ: bánh Croissant, bánh mì nếu không có trong dữ liệu), chi nhánh hay số tiền nào khác.
3. Nếu doanh thu = 0 và số đơn = 0 (ví dụ khi chọn hôm nay), hãy nêu rõ sự thật là cơ sở dữ liệu chưa ghi nhận giao dịch phát sinh.
4. Trả về đúng định dạng JSON:
{{
  "executive_summary": "1-2 câu tóm tắt chính xác bức tranh kinh doanh",
  "ai_insights": [
    "Nhận định 1 (chỉ trích dẫn số liệu thật ở trên)",
    "Nhận định 2 (đánh giá tỷ trọng/xu hướng dựa trên số liệu thật)",
    "Khuyến nghị hành động cụ thể"
  ]
}}
"""

    insights_result = call_llm(synthesis_prompt)
    if insights_result and isinstance(insights_result, dict) and "ai_insights" in insights_result:
        insights = insights_result.get("ai_insights", [])
        exec_summary = insights_result.get("executive_summary", "")
    else:
        if kpi_dict["revenue"] == 0 and kpi_dict["orders"] == 0:
            insights = [
                "Hệ thống cơ sở dữ liệu ghi nhận chưa phát sinh đơn hàng hoặc doanh thu nào trong khoảng thời gian đã chọn.",
                "Toàn bộ các chỉ số vận hành AOV và tỷ lệ hoàn thành tạm thời ở mức 0 do chưa có giao dịch hợp lệ.",
                "Khuyến nghị: Rà soát trạng thái đồng bộ dữ liệu POS tại các chi nhánh hoặc mở rộng bộ lọc thời gian sang 7 ngày hoặc 30 ngày qua để theo dõi xu hướng lũy kế."
            ]
            exec_summary = "Chưa có giao dịch phát sinh trong khoảng thời gian được chọn theo số liệu thực tế từ cơ sở dữ liệu."
        else:
            insights = [
                f"Tổng doanh thu ghi nhận thực tế từ hệ thống đạt {kpi_dict['revenue']:,.0f} VNĐ với {kpi_dict['orders']:,} giao dịch.",
                f"Giá trị trung bình trên mỗi hóa đơn (AOV) duy trì ở mức {kpi_dict['aov']:,.0f} VNĐ với tỷ lệ hoàn tất đơn đạt {kpi_dict['completion_rate']}%.",
                "Khuyến nghị: Tiếp tục duy trì hiệu suất vận hành tại các điểm bán chủ lực và đẩy mạnh nhóm sản phẩm có tốc độ quay vòng cao."
            ]
            exec_summary = f"Hiệu suất kinh doanh toàn chuỗi đạt {kpi_dict['revenue']:,.0f} VNĐ doanh thu với tỷ lệ hoàn tất đơn {kpi_dict['completion_rate']}%."

    duration_ms = int((time.time() - start_time) * 1000)

    # Step 5: Log execution to ai_agent.query_logs
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO ai_agent.query_logs 
                    (user_prompt, generated_sql, execution_status, execution_time_ms, error_message)
                    VALUES (%s, %s, %s, %s, %s);
                """, (user_prompt, executed_sql, execution_status, duration_ms, last_error))
    except Exception as log_err:
        print(f"Lỗi ghi log query: {log_err}")

    return {
        "prompt": user_prompt,
        "title": plan.get("title") or "Báo cáo Phân tích AI Tùy biến",
        "description": plan.get("description") or "Phân tích số liệu thực tế từ kho dữ liệu Analytics",
        "created_at": "Hôm nay, " + time.strftime("%H:%M %d/%m/%Y"),
        "kpis": kpi_dict,
        "trend_chart": trend_data,
        "donut_chart": breakdown_data,
        "bar_chart": breakdown_data,
        "table_data": {
            "title": f"Dữ liệu trích xuất: {plan.get('title')}",
            "columns": table_cols if table_cols else ["Thông tin", "Giá trị"],
            "rows": table_rows,
            "total_rows": len(table_rows)
        },
        "ai_insights": insights,
        "executive_summary": exec_summary,
        "sql_query": executed_sql
    }
