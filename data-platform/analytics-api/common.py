from typing import Optional, List, Dict, Any, Literal
from datetime import date, datetime, timedelta
from pydantic import BaseModel, ConfigDict, Field, model_validator, AliasChoices
from services.analysis_contract import Filter


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
    mode: Literal["auto", "today", "7d", "30d", "current_month", "previous_month", "current_quarter", "previous_quarter", "current_year", "previous_year", "all_time", "custom"] = "auto"
    start: Optional[date] = None
    end: Optional[date] = None

    @model_validator(mode="after")
    def bounds(self):
        if self.mode == "custom" and (not self.start or not self.end or self.start > self.end):
            raise ValueError("Custom time requires ordered dates")
        if self.mode != "custom" and (self.start or self.end):
            raise ValueError("Dates are only valid for custom time")
        return self


class AiAnalysisScope(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["auto", "all", "selected"] = "auto"
    filters: List[Filter] = Field(default_factory=list, max_length=12)

    @model_validator(mode="after")
    def selection(self):
        if (self.mode == "selected") != bool(self.filters):
            raise ValueError("Only selected scope carries filters")
        return self


class AiGuidedContract(BaseModel):
    """V3.2 guided mission slots: canonical IDs chosen in the mission builder.

    Never trusted: the server re-validates every field against the registry and
    the mission input contract before building a deterministic intent.
    """
    model_config = ConfigDict(extra="forbid")
    metric: Optional[str] = Field(default=None, max_length=64, pattern=r"^[a-z][a-z0-9_]{0,63}$")
    metric_b: Optional[str] = Field(default=None, max_length=64, pattern=r"^[a-z][a-z0-9_]{0,63}$")
    dimension: Optional[str] = Field(default=None, max_length=64, pattern=r"^[a-z][a-z0-9_]{0,63}$")
    group_a: Optional[str] = Field(default=None, min_length=1, max_length=120)
    group_b: Optional[str] = Field(default=None, min_length=1, max_length=120)
    n: Optional[int] = Field(default=None, ge=1, le=100)
    direction: Optional[Literal["top", "bottom"]] = None
    granularity: Optional[Literal["day", "week", "month", "quarter", "year"]] = None
    horizon: Optional[int] = Field(default=None, ge=1, le=366)
    cadence: Optional[Literal["day", "week", "month"]] = None
    signals: Optional[List[str]] = Field(default=None, max_length=12)


class AiSourceAnalysis(BaseModel):
    model_config = ConfigDict(extra='forbid')
    session_id: str = Field(min_length=1,max_length=128)
    revision: int = Field(ge=1)
    query_id: str = Field(min_length=1,max_length=64)
    artifact_id: str = Field(min_length=1,max_length=128)
    filters: Dict[str,Any] = Field(min_length=1,max_length=8)

    @model_validator(mode='after')
    def typed_key(self):
        import math
        if any(not isinstance(k,str) or len(k)>64 or type(v) not in {str,int,float}
                or isinstance(v,str) and len(v)>512 or isinstance(v,float) and not math.isfinite(v)
                for k,v in self.filters.items()):raise ValueError('Invalid source group key')
        return self


class AiTextToReportRequest(BaseModel):
    refresh: bool = False
    proposal_revision: Optional[int] = None
    intent_fingerprint: Optional[str] = None
    plan_fingerprint: Optional[str] = None
    catalog_fingerprint: Optional[str] = None
    prompt: str = Field(default="", validation_alias=AliasChoices("question", "prompt"), max_length=8000)
    dashboard_id: Optional[str] = Field(default=None, pattern=r"^D[0-9]{2}$")
    dashboard_version: Optional[str] = Field(default=None, pattern=r"^\d+\.\d+\.\d+$")
    analysis_context: str = Field(default="", max_length=2000)
    analysis_expectation: str = Field(default="", max_length=1500)
    analysis_module_id: Optional[str] = Field(default=None, pattern=r"^am_[a-f0-9]{24}$")
    analysis_module_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    natural_input: bool = Field(default=False, exclude=True)
    accept_partial_scope: bool = False
    analysis_depth: Literal["deep", "focused", "comprehensive"] = "deep"
    analysis_scope: Optional[AiAnalysisScope] = None
    source_analysis: Optional[AiSourceAnalysis] = None
    reference_date: Optional[date] = None
    context: Optional[str] = ""
    time_range: Optional[AiTimeRange] = Field(default=None, validation_alias=AliasChoices("time", "time_range"))
    domain: Optional[str] = Field(default="auto", pattern=r"^[a-z][a-z0-9_]{0,63}$")
    # V3.1 optional UX hint (dashboard organization); never semantic authority.
    analysis_mission: Optional[str] = Field(default=None, pattern=r"^[a-z][a-z_]{0,31}$")
    # V3.2: guided mission contract (0 provider calls) or free text. A guided
    # request needs a mission; free text may be upgraded server-side only when
    # the deterministic preflight resolves every required field.
    input_mode: Literal["free_text", "guided"] = "free_text"
    guided_contract: Optional[AiGuidedContract] = None
    allow_deterministic_upgrade: bool = False
    # Session ID for tracking conversation across report generation and refinement turns.
    session_id: Optional[str] = None
    # Legacy filters remain accepted for older clients.
    date_range: Optional[str] = None
    branch: Optional[str] = "all"

    @model_validator(mode="before")
    @classmethod
    def natural_boundary(cls, raw):
        if not isinstance(raw, dict):
            return raw
        data = dict(raw)
        for new, old in (("question", "prompt"), ("time", "time_range")):
            if new in data and old in data and data[new] != data[old]:
                raise ValueError("Conflicting request aliases")
        if data.get('dashboard_id') is not None or data.get('dashboard_version') is not None:
            if not data.get('dashboard_id') or not data.get('dashboard_version'):
                raise ValueError('Dashboard identity and version are both required')
            if (data.get('question') or data.get('prompt') or data.get('guided_contract')
                    or data.get('input_mode','free_text') != 'free_text' or data.get('analysis_mission')
                    or data.get('analysis_module_id') or data.get('analysis_module_name') or data.get('source_analysis')
                    or data.get('analysis_context') or data.get('analysis_expectation') or data.get('context')
                    or data.get('branch','all') != 'all' or data.get('date_range') or data.get('allow_deterministic_upgrade')
                    or data.get('domain','auto') != 'auto'):
                raise ValueError('Dashboard cannot be combined with another input contract')
            if 'time' not in data and 'time_range' not in data:
                raise ValueError('Dashboard needs an explicit time contract')
            data['natural_input'] = False
            return data
        data["natural_input"] = any(k in data for k in ("question", "analysis_context", "analysis_expectation", "analysis_module_id", "analysis_module_name"))
        if data["natural_input"] and "time" not in data and "time_range" not in data:
            data["time_range"] = {"mode": "auto"}
        if not str(data.get("question", data.get("prompt", ""))).strip():
            raise ValueError("Question is required")
        return data


class AiPreflightTime(BaseModel):
    """Lenient on purpose: an invalid custom range is a preflight finding, not a 422."""
    model_config = ConfigDict(extra="forbid")
    mode: Literal["auto", "today", "7d", "30d", "current_month", "previous_month", "current_quarter", "previous_quarter", "current_year", "previous_year", "all_time", "custom"] = "auto"
    start: Optional[date] = None
    end: Optional[date] = None


class AiPreflightScope(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["auto", "all", "selected"] = "auto"
    filters: List[Filter] = Field(default_factory=list, max_length=12)


class AiPreflightRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # Bounded above the analysis limit so an over-long draft is reported, not rejected.
    question: str = Field(default="", max_length=20000)
    time: Optional[AiPreflightTime] = None
    analysis_scope: Optional[AiPreflightScope] = None
    analysis_mission: Optional[str] = Field(default=None, pattern=r"^[a-z][a-z_]{0,31}$")
    reference_date: Optional[date] = None
    input_mode: Optional[Literal["free_text", "guided"]] = None
    guided_contract: Optional[AiGuidedContract] = None


class AiRiskWatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(default="", max_length=8000)
    time: Optional[AiTimeRange] = None
    analysis_scope: Optional[AiAnalysisScope] = None
    breakdown: Optional[Literal["store", "city", "store_type"]] = "store"
    reference_date: Optional[date] = None
    signals: Optional[List[str]] = Field(default=None, max_length=12, description="Selected governed signal IDs; omitted = all.")


class AiSummarizeRequest(BaseModel):
    report_title: str
    data: Optional[List[Dict[str, Any]]] = []
    columns: Optional[List[str]] = []


class AiVisualChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    chart_id: str = Field(min_length=1, max_length=64)
    chart_type: Literal["bar", "horizontal_bar", "line", "area", "multi_line", "donut", "heatmap", "grouped_bar", "stacked_bar", "stacked_100", "scatter", "table"]


class AiReportRefineRequest(BaseModel):
    current_report: Dict[str, Any]
    feedback: str = ""
    visual_changes: List[AiVisualChange] = Field(default_factory=list, max_length=8)
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
