from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
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


class ReportExportLogCreate(BaseModel):
    report_title: str
    format: str
    row_count: int = 0
    file_size: Optional[str] = "0 KB"
    status: Optional[str] = "Thành công"
    user_name: Optional[str] = "Chuyên viên phân tích"


class AiTextToReportRequest(BaseModel):
    prompt: str
    date_range: Optional[str] = "30days"
    branch: Optional[str] = "all"


class AiSummarizeRequest(BaseModel):
    report_title: str
    data: Optional[List[Dict[str, Any]]] = []
    columns: Optional[List[str]] = []


def get_filter_clauses(cur, date_range: str, branch: str, order_alias: str = "d"):
    ref_date = datetime.now().date()

    if date_range == "today":
        date_cond = f"{order_alias}.ngay_tao::date = CURRENT_DATE"
        date_params = []
        prev_date_cond = f"{order_alias}.ngay_tao::date = CURRENT_DATE - INTERVAL '1 day'"
        prev_date_params = []
    elif date_range == "7days":
        date_cond = f"{order_alias}.ngay_tao::date >= CURRENT_DATE - INTERVAL '6 days' AND {order_alias}.ngay_tao::date <= CURRENT_DATE"
        date_params = []
        prev_date_cond = f"{order_alias}.ngay_tao::date >= CURRENT_DATE - INTERVAL '13 days' AND {order_alias}.ngay_tao::date < CURRENT_DATE - INTERVAL '6 days'"
        prev_date_params = []
    elif date_range == "30days":
        date_cond = f"{order_alias}.ngay_tao::date >= CURRENT_DATE - INTERVAL '29 days' AND {order_alias}.ngay_tao::date <= CURRENT_DATE"
        date_params = []
        prev_date_cond = f"{order_alias}.ngay_tao::date >= CURRENT_DATE - INTERVAL '59 days' AND {order_alias}.ngay_tao::date < CURRENT_DATE - INTERVAL '29 days'"
        prev_date_params = []
    else:  # all
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
