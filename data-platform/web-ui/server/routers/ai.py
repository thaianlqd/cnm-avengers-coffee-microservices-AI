import json
import logging
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException
from db import get_db_conn, GEMINI_API_KEY, GROQ_API_KEY, ANTHROPIC_API_KEY
from common import AiTextToReportRequest, AiSummarizeRequest

router = APIRouter(prefix="/api/ai", tags=["AI Data Assistant"])

DATABASE_SCHEMA_CONTEXT = """
You are an expert Data Architect & Business Intelligence Analyst for Avengers Coffee (BeanSync) chain data warehouse.
The real PostgreSQL analytics warehouse contains the following schemas and tables:
1. orders.don_hang (
     ma_don_hang UUID PRIMARY KEY,
     ngay_tao TIMESTAMP WITH TIME ZONE,
     co_so_ma VARCHAR(50) REFERENCES identity.chi_nhanh(ma_chi_nhanh),
     ma_nguoi_dung TEXT,
     ten_khach_hang VARCHAR(255),
     guest_phone VARCHAR(50),
     guest_email VARCHAR(255),
     tong_tien NUMERIC,
     trang_thai_don_hang VARCHAR(50) ['HOAN_THANH', 'DANG_GIAO', 'DA_HUY'],
     phuong_thuc_thanh_toan VARCHAR(50) ['TIEN_MAT', 'MOMO', 'VNPAY', 'NGAN_HANG_QR', 'CHUYEN_KHOAN'],
     loai_don_hang VARCHAR(50) ['TAI_QUAY', 'MANG_DI', 'GIAO_TAN_NOI']
   )
2. orders.chi_tiet_don_hang (
     ma_chi_tiet BIGINT PRIMARY KEY,
     ma_don_hang UUID REFERENCES orders.don_hang,
     ma_san_pham VARCHAR(50) REFERENCES menu.san_pham(ma_san_pham),
     ten_san_pham VARCHAR(255),
     so_luong INT,
     gia_ban NUMERIC
   )
3. menu.san_pham (
     ma_san_pham VARCHAR(50) PRIMARY KEY,
     ten_san_pham VARCHAR(255),
     ma_danh_muc VARCHAR(50) REFERENCES menu.danh_muc,
     gia_ban NUMERIC
   )
4. menu.danh_muc (
     ma_danh_muc VARCHAR(50) PRIMARY KEY,
     ten_danh_muc VARCHAR(255),
     ma_danh_muc_cha VARCHAR(50)
   )
5. identity.chi_nhanh (
     ma_chi_nhanh VARCHAR(50) PRIMARY KEY,
     ten_chi_nhanh VARCHAR(255),
     thanh_pho VARCHAR(100),
     dia_chi TEXT,
     trang_thai VARCHAR(20) ['ACTIVE', 'INACTIVE']
   )
6. identity.nguoi_dung (
     ma_nguoi_dung UUID PRIMARY KEY,
     ho_ten VARCHAR(255),
     so_dien_thoai VARCHAR(20),
     email VARCHAR(255),
     diem_loyalty INT,
     vai_tro VARCHAR(50)
   )
7. gold.revenue_daily (date DATE, total_orders INT, revenue NUMERIC)
8. gold.top_products (ma_san_pham VARCHAR, ten_san_pham VARCHAR, total_quantity INT, total_revenue NUMERIC)
9. gold.customer_segments (segment VARCHAR, count INT, avg_ltv NUMERIC)
10. gold.stores_overview (store_code VARCHAR, store_name VARCHAR, city VARCHAR, total_orders INT, total_revenue NUMERIC, aov NUMERIC)

STRICT RULES FOR SQL GENERATION:
1. ONLY generate safe read-only SELECT statements. Never generate UPDATE, DELETE, DROP, ALTER, INSERT.
2. For dates: CURRENT_DATE is the current date. When user asks about today ("hôm nay"), query `DATE(d.ngay_tao) = CURRENT_DATE`.
3. When calculating revenue, filter by `trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')` unless analyzing cancellations.
4. Always use COALESCE(..., 0) for sums and calculations.
5. Limit the table query to at most 20 rows.
"""


def json_serial(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, (datetime.date, datetime.datetime)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    return str(obj)


def call_gemini_api(prompt_text: str, system_instruction: str = "") -> Optional[Dict[str, Any]]:
    """Calls real Google Gemini API using GEMINI_API_KEY from environment."""
    if not GEMINI_API_KEY:
        print("GEMINI_API_KEY is not configured in environment.")
        return None

    models_to_try = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"]
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
            res = requests.post(url, json=payload, timeout=12)
            if res.ok:
                resp_json = res.json()
                raw_text = resp_json["candidates"][0]["content"]["parts"][0]["text"].strip()
                # Remove possible markdown fences if any
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
    """Calls Groq API as backup if Gemini is unavailable."""
    if not GROQ_API_KEY:
        return None

    models = ["llama-3.1-8b-instant", "llama3-70b-8192", "mixtral-8x7b-32768"]
    for m in models:
        try:
            url = "https://api.groq.com/openai/v1/chat/completions"
            headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
            payload = {
                "model": m,
                "messages": [
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": prompt_text}
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.2
            }
            res = requests.post(url, json=payload, headers=headers, timeout=10)
            if res.ok:
                resp_json = res.json()
                raw_text = resp_json["choices"][0]["message"]["content"]
                return json.loads(raw_text)
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


@router.post("/generate-executive-report")
def generate_executive_report(payload: AiTextToReportRequest):
    user_prompt = payload.prompt.strip() if payload.prompt else "Báo cáo tổng quan hiệu suất và doanh thu toàn chuỗi"
    p_lower = user_prompt.lower()

    # Step 1: Prompt real LLM to generate the analytical plan & safe PostgreSQL SQL
    planner_prompt = f"""
Analyze this user request: "{user_prompt}"

Generate a JSON object with:
{{
  "title": "Clean, professional Vietnamese title (no emojis, no programming symbols like underscores)",
  "description": "Short 1-line Vietnamese description of this analytical perspective",
  "main_sql": "SELECT ... FROM ... (Valid PostgreSQL query to populate a data table, max 15 rows. Use Vietnamese column aliases with double quotes e.g. AS \\"Tên Sản Phẩm\\")",
  "trend_sql": "SELECT ... (Time series query for a line/area chart, e.g. date or hour as 'date', revenue as 'revenue', max 30 rows)",
  "breakdown_sql": "SELECT ... (Category, store or method breakdown for donut/bar chart, returns 'name' and 'value', max 6 rows)",
  "kpi_sql": "SELECT COUNT(*) as total_orders, COALESCE(SUM(tong_tien), 0) as total_revenue, ROUND(AVG(tong_tien), 0) as aov, ROUND(100.0 * COUNT(*) FILTER (WHERE trang_thai_don_hang = 'HOAN_THANH') / NULLIF(COUNT(*), 0), 1) as completion_rate FROM orders.don_hang WHERE ... (Matching the time window of the request)"
}}

IMPORTANT:
- If user asks about 'hôm nay' (today), use `DATE(ngay_tao) = CURRENT_DATE`.
- If user asks about '7 ngày' (7 days), use `ngay_tao >= CURRENT_DATE - INTERVAL '6 days'`.
- If user asks about '30 ngày' (30 days), use `ngay_tao >= CURRENT_DATE - INTERVAL '29 days'`.
- If user does not specify, default to the last 30 days (`ngay_tao >= CURRENT_DATE - INTERVAL '29 days'`).
"""

    plan = call_llm(planner_prompt, DATABASE_SCHEMA_CONTEXT)

    # Fallback plan if LLM failed
    if not plan or not isinstance(plan, dict) or "main_sql" not in plan:
        print("LLM planning returned invalid JSON, applying resilient SQL template")
        if any(w in p_lower for w in ["sản phẩm", "thực đơn", "món", "menu", "bán chạy"]):
            plan = {
                "title": "Báo cáo Cơ cấu Thực đơn và Sản phẩm Bán chạy",
                "description": "Phân tích doanh số và lượng tiêu thụ theo nhóm đồ uống chủ lực.",
                "main_sql": """
                    SELECT 
                        sp.ma_san_pham AS "Mã SP",
                        sp.ten_san_pham AS "Tên Sản Phẩm",
                        COALESCE(dm.ten_danh_muc, 'Cà phê') AS "Danh Mục",
                        SUM(ct.so_luong) AS "Số Lượng Đã Bán",
                        ROUND(AVG(ct.gia_ban), 0) AS "Đơn Giá (VNĐ)",
                        COALESCE(SUM(ct.so_luong * ct.gia_ban), 0) AS "Doanh Thu (VNĐ)"
                    FROM orders.chi_tiet_don_hang ct
                    JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
                    JOIN menu.san_pham sp ON ct.ma_san_pham = sp.ma_san_pham
                    LEFT JOIN menu.danh_muc dm ON sp.ma_danh_muc = dm.ma_danh_muc
                    WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                    GROUP BY sp.ma_san_pham, sp.ten_san_pham, dm.ten_danh_muc
                    ORDER BY "Doanh Thu (VNĐ)" DESC
                    LIMIT 15;
                """,
                "trend_sql": """
                    SELECT d.ngay_tao::date::text AS date, COALESCE(SUM(d.tong_tien), 0) AS revenue
                    FROM orders.don_hang d
                    WHERE d.ngay_tao >= CURRENT_DATE - INTERVAL '29 days' AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                    GROUP BY d.ngay_tao::date ORDER BY date ASC;
                """,
                "breakdown_sql": """
                    SELECT COALESCE(dm.ten_danh_muc, 'Khác') AS name, COALESCE(SUM(ct.so_luong * ct.gia_ban), 0) AS value
                    FROM orders.chi_tiet_don_hang ct
                    JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
                    JOIN menu.san_pham sp ON ct.ma_san_pham = sp.ma_san_pham
                    LEFT JOIN menu.danh_muc dm ON sp.ma_danh_muc = dm.ma_danh_muc
                    WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                    GROUP BY name ORDER BY value DESC LIMIT 6;
                """,
                "kpi_sql": """
                    SELECT COUNT(*) AS total_orders, COALESCE(SUM(tong_tien), 0) AS total_revenue, ROUND(AVG(tong_tien), 0) AS aov, ROUND(100.0 * COUNT(*) FILTER (WHERE trang_thai_don_hang = 'HOAN_THANH') / NULLIF(COUNT(*), 0), 1) AS completion_rate
                    FROM orders.don_hang WHERE ngay_tao >= CURRENT_DATE - INTERVAL '29 days' AND trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO');
                """
            }
        elif any(w in p_lower for w in ["hôm nay", "ngay hom nay", "today"]):
            plan = {
                "title": f"Báo cáo Diễn biến Kinh doanh Hôm nay ({time.strftime('%d/%m/%Y')})",
                "description": "Thống kê số liệu phát sinh thực tế trong ngày tại các cửa hàng toàn chuỗi.",
                "main_sql": """
                    SELECT 
                        d.ma_don_hang::text AS "Mã Đơn",
                        LPAD(EXTRACT(HOUR FROM d.ngay_tao)::text, 2, '0') || ':' || LPAD(EXTRACT(MINUTE FROM d.ngay_tao)::text, 2, '0') AS "Giờ Đặt",
                        COALESCE(cn.ten_chi_nhanh, d.co_so_ma) AS "Điểm Bán",
                        d.tong_tien AS "Tổng Tiền (VNĐ)",
                        d.phuong_thuc_thanh_toan AS "Hình Thức",
                        d.trang_thai_don_hang AS "Trạng Thái"
                    FROM orders.don_hang d
                    LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE DATE(d.ngay_tao) = CURRENT_DATE
                    ORDER BY d.ngay_tao DESC
                    LIMIT 15;
                """,
                "trend_sql": """
                    SELECT LPAD(EXTRACT(HOUR FROM d.ngay_tao)::text, 2, '0') || ':00' AS date, COALESCE(SUM(d.tong_tien), 0) AS revenue
                    FROM orders.don_hang d
                    WHERE DATE(d.ngay_tao) = CURRENT_DATE AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                    GROUP BY EXTRACT(HOUR FROM d.ngay_tao) ORDER BY EXTRACT(HOUR FROM d.ngay_tao) ASC;
                """,
                "breakdown_sql": """
                    SELECT COALESCE(cn.thanh_pho, 'Chưa xác định') AS name, COALESCE(SUM(d.tong_tien), 0) AS value
                    FROM orders.don_hang d
                    LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE DATE(d.ngay_tao) = CURRENT_DATE AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                    GROUP BY name ORDER BY value DESC LIMIT 6;
                """,
                "kpi_sql": """
                    SELECT COUNT(*) AS total_orders, COALESCE(SUM(tong_tien), 0) AS total_revenue, ROUND(AVG(tong_tien), 0) AS aov, ROUND(100.0 * COUNT(*) FILTER (WHERE trang_thai_don_hang = 'HOAN_THANH') / NULLIF(COUNT(*), 0), 1) AS completion_rate
                    FROM orders.don_hang WHERE DATE(ngay_tao) = CURRENT_DATE;
                """
            }
        else:
            plan = {
                "title": f"Báo cáo Điều hành Kinh doanh: {user_prompt}",
                "description": "Số liệu tổng hợp thực tế từ kho dữ liệu phân tích Avengers Coffee.",
                "main_sql": """
                    SELECT 
                        ngay_tao::date::text AS "Ngày Bán Hàng",
                        COUNT(*) AS "Số Đơn Hoàn Thành",
                        COALESCE(SUM(tong_tien), 0) AS "Doanh Thu (VNĐ)",
                        ROUND(AVG(tong_tien), 0) AS "AOV (VNĐ)"
                    FROM orders.don_hang
                    WHERE ngay_tao >= CURRENT_DATE - INTERVAL '29 days' AND trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                    GROUP BY ngay_tao::date
                    ORDER BY "Ngày Bán Hàng" DESC
                    LIMIT 15;
                """,
                "trend_sql": """
                    SELECT ngay_tao::date::text AS date, COALESCE(SUM(tong_tien), 0) AS revenue
                    FROM orders.don_hang
                    WHERE ngay_tao >= CURRENT_DATE - INTERVAL '29 days' AND trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                    GROUP BY ngay_tao::date ORDER BY date ASC;
                """,
                "breakdown_sql": """
                    SELECT 
                        CASE phuong_thuc_thanh_toan
                            WHEN 'TIEN_MAT' THEN 'Tiền mặt'
                            WHEN 'MOMO' THEN 'Ví MoMo'
                            WHEN 'VNPAY' THEN 'Cổng VNPay'
                            WHEN 'NGAN_HANG_QR' THEN 'Chuyển khoản QR'
                            ELSE 'Khác'
                        END AS name,
                        COALESCE(SUM(tong_tien), 0) AS value
                    FROM orders.don_hang
                    WHERE ngay_tao >= CURRENT_DATE - INTERVAL '29 days' AND trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                    GROUP BY name ORDER BY value DESC LIMIT 6;
                """,
                "kpi_sql": """
                    SELECT COUNT(*) AS total_orders, COALESCE(SUM(tong_tien), 0) AS total_revenue, ROUND(AVG(tong_tien), 0) AS aov, ROUND(100.0 * COUNT(*) FILTER (WHERE trang_thai_don_hang = 'HOAN_THANH') / NULLIF(COUNT(*), 0), 1) AS completion_rate
                    FROM orders.don_hang WHERE ngay_tao >= CURRENT_DATE - INTERVAL '29 days' AND trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO');
                """
            }

    # Step 2: Execute SQL queries on real PostgreSQL database
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
    executed_sql = plan.get("main_sql", "").strip()

    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                # 2.1 Main Table SQL
                if executed_sql:
                    try:
                        cur.execute(executed_sql)
                        raw_rows = cur.fetchall()
                        if raw_rows:
                            table_rows = [dict(r) for r in raw_rows]
                            table_cols = list(table_rows[0].keys())
                    except Exception as err:
                        print(f"Error executing LLM main_sql: {err}")
                        conn.rollback()

                # 2.2 Trend SQL
                trend_sql = plan.get("trend_sql", "").strip()
                if trend_sql:
                    try:
                        cur.execute(trend_sql)
                        trend_data = [{"date": str(r.get("date") or ""), "revenue": float(r.get("revenue") or r.get("value") or 0)} for r in cur.fetchall()]
                    except Exception as err:
                        print(f"Error executing trend_sql: {err}")
                        conn.rollback()

                # 2.3 Breakdown SQL (Donut / Bar)
                breakdown_sql = plan.get("breakdown_sql", "").strip()
                if breakdown_sql:
                    try:
                        cur.execute(breakdown_sql)
                        breakdown_data = [{"name": str(r.get("name") or "Mục"), "value": float(r.get("value") or 0)} for r in cur.fetchall()]
                    except Exception as err:
                        print(f"Error executing breakdown_sql: {err}")
                        conn.rollback()

                # 2.4 Real KPIs
                kpi_sql = plan.get("kpi_sql", "").strip()
                if kpi_sql:
                    try:
                        cur.execute(kpi_sql)
                        k_row = cur.fetchone()
                        if k_row:
                            rev = float(k_row.get("total_revenue") or 0.0)
                            ords = int(k_row.get("total_orders") or 0)
                            aov_v = float(k_row.get("aov") or 0.0)
                            comp_v = float(k_row.get("completion_rate") or 0.0)
                            kpi_dict["revenue"] = rev
                            kpi_dict["orders"] = ords
                            kpi_dict["aov"] = aov_v
                            kpi_dict["completion_rate"] = comp_v
                    except Exception as err:
                        print(f"Error executing kpi_sql: {err}")
                        conn.rollback()

    except Exception as e:
        print(f"Database connection error: {e}")

    # Fallback KPIs from table rows if kpi_dict is 0 but table has data
    if kpi_dict["revenue"] == 0 and table_rows:
        sum_rev = 0
        for r in table_rows:
            for k, v in r.items():
                if "tiền" in k.lower() or "doanh thu" in k.lower() or "revenue" in k.lower():
                    if isinstance(v, (int, float, Decimal)):
                        sum_rev += float(v)
        if sum_rev > 0:
            kpi_dict["revenue"] = sum_rev
            kpi_dict["orders"] = len(table_rows)
            kpi_dict["aov"] = round(sum_rev / len(table_rows))
            kpi_dict["completion_rate"] = 100.0

    # Step 3: Pass REAL query results back to Gemini 2.5 Flash for genuine analysis
    serialized_results = json.dumps(table_rows[:10], ensure_ascii=False, default=json_serial)
    summary_data = {
        "kpis": kpi_dict,
        "sample_rows": table_rows[:8],
        "breakdown": breakdown_data[:5],
        "time_trend_points": len(trend_data)
    }

    synthesis_prompt = f"""
Bạn là Chuyên gia Trưởng Phân tích Dữ liệu (Lead Business Intelligence Analyst) của chuỗi Avengers Coffee BeanSync.
Yêu cầu phân tích của người dùng: "{user_prompt}"
Tiêu đề báo cáo: "{plan.get('title')}"

DỮ LIỆU TRUY VẤN THỰC TẾ 100% TỪ DATABASE POSTGRESQL:
{json.dumps(summary_data, ensure_ascii=False, default=json_serial)}

Hãy trả về JSON:
{{
  "executive_summary": "Tóm tắt bức tranh kinh doanh trong 1-2 câu súc tích",
  "ai_insights": [
    "Nhận định 1 (ngắn gọn, chuẩn xác dựa vào số liệu thật)",
    "Nhận định 2 (ngắn gọn, chuẩn xác dựa vào số liệu thật)",
    "Khuyến nghị thực thi vận hành/kinh doanh cụ thể"
  ]
}}

LƯU Ý CỰC KỲ QUAN TRỌNG:
1. TUYỆT ĐỐI KHÔNG BỊA SỐ LIỆU.
2. Nếu hôm nay chưa có đơn (doanh thu = 0, số đơn = 0), hãy nêu rõ sự thật là ngày hôm nay chưa phát sinh giao dịch nào trên hệ thống, và đưa ra khuyến nghị kiểm tra thiết bị POS/ca làm việc.
3. Nếu có dữ liệu thực tế (ví dụ 30 ngày qua có hàng ngàn đơn), hãy phân tích chính xác dựa trên các con số trong kết quả truy vấn.
4. Trình bày bằng tiếng Việt chuyên nghiệp, chuẩn mực, không dùng emoji trong câu.
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

    return {
        "status": "success",
        "prompt": user_prompt,
        "title": plan.get("title") or "Báo cáo Phân tích AI Tùy biến",
        "description": plan.get("description") or "Phân tích số liệu thực tế từ kho dữ liệu Analytics",
        "model_used": "Google Gemini 2.5 Flash",
        "created_at": "Hôm nay, " + time.strftime("%H:%M %d/%m/%Y"),
        "kpis": kpi_dict,
        "trend_chart": trend_data,
        "donut_chart": breakdown_data,
        "bar_chart": breakdown_data,
        "table_data": {
            "title": f"Dữ liệu trích xuất: {plan.get('title') or fallback_plan['title']}",
            "columns": normalized["table_columns"],
            "rows": normalized["table_rows"],
            "total_rows": normalized["row_counts"]["main"],
        },
        "executive_summary": synthesis_data.get("executive_summary") or deterministic["executive_summary"],
        "ai_insights": synthesis_data.get("ai_insights") or deterministic["ai_insights"],
        "recommendations": synthesis_data.get("recommendations") or deterministic["recommendations"],
        "evidence": synthesis_data.get("evidence") or deterministic["evidence"],
        "sql": sql_used,
        "sql_query": sql_used["main"],
        "visualizations": {
            "trend": chart_metadata["trend"]["chart_type"],
            "breakdown": chart_metadata["breakdown"]["chart_type"],
            "table": fallback_plan["visualizations"]["table"],
        },
        "created_at": datetime.now().astimezone().isoformat(),
    }


@router.post("/summarize")
def summarize_report(payload: AiSummarizeRequest):
    compact = {"title": payload.report_title, "columns": payload.columns, "rows": (payload.data or [])[:20]}
    response = call_llm(
        json.dumps(compact, ensure_ascii=False, default=json_serial),
        "Tóm tắt dữ liệu được cung cấp bằng tiếng Việt. Trả JSON có executive_summary và ai_insights. Không bịa số liệu.",
    )
    if response:
        return {**response["data"], "provider": {key: response[key] for key in ("provider", "model", "latency_ms")}}
    return {"executive_summary": "Không có nhà cung cấp LLM; dữ liệu vẫn có thể xem trực tiếp.", "ai_insights": [], "provider": {"provider": "deterministic", "model": "none", "latency_ms": 0}}
