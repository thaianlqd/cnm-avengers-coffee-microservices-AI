from typing import Optional, List, Dict, Any, Literal
from datetime import date, datetime, timedelta
from pydantic import BaseModel


class SqlQueryRequest(BaseModel):
    sql: str


class PipelineTriggerRequest(BaseModel):
    target_layer: Optional[str] = "gold"


class SavedReportCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    category: Optional[str] = "sales"
    query_type: Optional[str] = "sql"
    sql_query: str
    visualization_type: Optional[str] = "table"
    x_key: Optional[str] = None
    y_key: Optional[str] = None
    ai_summary: Optional[str] = None
    created_by: Optional[str] = "Chuyên viên phân tích"
    module_config: Optional[Dict[str, Any]] = None


class ReportExportLogCreate(BaseModel):
    report_title: str
    format: str
    row_count: int = 0
    file_size: Optional[str] = "0 KB"
    status: Optional[str] = "Thành công"
    user_name: Optional[str] = "Chuyên viên phân tích"


class AiTimeRange(BaseModel):
    mode: Literal["auto", "today", "7d", "30d", "custom"] = "auto"
    start: Optional[date] = None
    end: Optional[date] = None


class AiTextToReportRequest(BaseModel):
    prompt: str
    context: Optional[str] = ""
    time_range: Optional[AiTimeRange] = None
    domain: Optional[Literal["auto", "orders", "stores", "products", "customers", "payments", "delivery"]] = "auto"
    # Session ID for tracking conversation across report generation and refinement turns.
    session_id: Optional[str] = None
    # Legacy filters remain accepted for older clients.
    date_range: Optional[str] = None
    branch: Optional[str] = "all"


class AiSummarizeRequest(BaseModel):
    report_title: str
    data: Optional[List[Dict[str, Any]]] = []
    columns: Optional[List[str]] = []


class AiReportRefineRequest(BaseModel):
    current_report: Dict[str, Any]
    feedback: str
    conversation_history: Optional[List[Dict[str, str]]] = []
    domain: Optional[str] = "auto"
    # Session ID to retrieve server-side conversation memory.
    session_id: Optional[str] = None


class AiFeedbackRequest(BaseModel):
    revision: Optional[int] = None
    session_id: Optional[str] = None
    prompt: str
    rating: Literal["positive", "negative"]
    comment: Optional[str] = ""
    final_sql: Optional[str] = ""
    intent: Optional[str] = ""



def get_filter_clauses(cur, date_range: str, branch: str, order_alias: str = "d"):
    ref_date = datetime.now().date()
    range_str = (date_range or "30days").lower().strip()

    if range_str in ("today", "1day", "1d"):
        date_cond = f"{order_alias}.ngay_tao::date = CURRENT_DATE"
        date_params = []
        prev_date_cond = f"{order_alias}.ngay_tao::date = CURRENT_DATE - INTERVAL '1 day'"
        prev_date_params = []
    elif range_str in ("7days", "7d", "week"):
        date_cond = f"{order_alias}.ngay_tao::date >= CURRENT_DATE - INTERVAL '6 days' AND {order_alias}.ngay_tao::date <= CURRENT_DATE"
        date_params = []
        prev_date_cond = f"{order_alias}.ngay_tao::date >= CURRENT_DATE - INTERVAL '13 days' AND {order_alias}.ngay_tao::date < CURRENT_DATE - INTERVAL '6 days'"
        prev_date_params = []
    elif range_str in ("14days", "14d", "2weeks"):
        date_cond = f"{order_alias}.ngay_tao::date >= CURRENT_DATE - INTERVAL '13 days' AND {order_alias}.ngay_tao::date <= CURRENT_DATE"
        date_params = []
        prev_date_cond = f"{order_alias}.ngay_tao::date >= CURRENT_DATE - INTERVAL '27 days' AND {order_alias}.ngay_tao::date < CURRENT_DATE - INTERVAL '13 days'"
        prev_date_params = []
    elif range_str in ("30days", "30d", "month"):
        date_cond = f"{order_alias}.ngay_tao::date >= CURRENT_DATE - INTERVAL '29 days' AND {order_alias}.ngay_tao::date <= CURRENT_DATE"
        date_params = []
        prev_date_cond = f"{order_alias}.ngay_tao::date >= CURRENT_DATE - INTERVAL '59 days' AND {order_alias}.ngay_tao::date < CURRENT_DATE - INTERVAL '29 days'"
        prev_date_params = []
    elif range_str in ("90days", "90d", "quarter"):
        date_cond = f"{order_alias}.ngay_tao::date >= CURRENT_DATE - INTERVAL '89 days' AND {order_alias}.ngay_tao::date <= CURRENT_DATE"
        date_params = []
        prev_date_cond = f"{order_alias}.ngay_tao::date >= CURRENT_DATE - INTERVAL '179 days' AND {order_alias}.ngay_tao::date < CURRENT_DATE - INTERVAL '89 days'"
        prev_date_params = []
    elif range_str in ("all", "ytd", "year"):
        date_cond = f"{order_alias}.ngay_tao::date >= '2026-01-01' AND {order_alias}.ngay_tao::date <= CURRENT_DATE"
        date_params = []
        prev_date_cond = f"{order_alias}.ngay_tao::date >= '2025-01-01' AND {order_alias}.ngay_tao::date <= '2025-12-31'"
        prev_date_params = []
    else:  # all-time fallback
        date_cond = "1=1"
        date_params = []
        prev_date_cond = "1=1"
        prev_date_params = []

    # Branch condition
    branch_lower = (branch or "all").lower().strip()
    if branch_lower in ("all", "", "tat_ca"):
        branch_cond = "1=1"
        branch_params = []
    elif branch_lower == "hn":
        branch_cond = "cn.thanh_pho ILIKE %s"
        branch_params = ["%Hà Nội%"]
    elif branch_lower == "hcm":
        branch_cond = "cn.thanh_pho ILIKE %s"
        branch_params = ["%Hồ Chí Minh%"]
    elif branch_lower == "dn":
        branch_cond = "cn.thanh_pho ILIKE %s"
        branch_params = ["%Đà Nẵng%"]
    elif branch_lower == "ct":
        branch_cond = "cn.thanh_pho ILIKE %s"
        branch_params = ["%Cần Thơ%"]
    elif branch_lower == "hp":
        branch_cond = "cn.thanh_pho ILIKE %s"
        branch_params = ["%Hải Phòng%"]
    else:
        branch_cond = f"({order_alias}.co_so_ma = %s OR cn.thanh_pho ILIKE %s)"
        branch_params = [branch, f"%{branch}%"]

    return date_cond, date_params, prev_date_cond, prev_date_params, branch_cond, branch_params, ref_date
