import uuid
from copy import deepcopy
import unicodedata
import urllib.parse
from datetime import datetime
from typing import Optional, Literal
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel, ConfigDict, Field
from psycopg2.extras import Json
from db import get_report_writer_conn as get_db_conn
from common import SavedReportCreate, ReportExportLogCreate
from services.sql_service import SqlSafetyError, QueryExecutionError, execute_read_only
from services.docx_service import generate_report_docx

router = APIRouter(prefix="/api/reports", tags=["Reports Management"])


def _principal(permission=None):
    from services.access_policy import active_principal,current_principal,require_permission
    if active_principal.get() is None: return None
    principal=current_principal(required=True)
    if permission: require_permission(principal,permission)
    return principal


def _owned_where(*,allow_legacy=False):
    principal=_principal()
    if principal is None: return '1=1',[]  # Internal compatibility; HTTP middleware authenticates.
    predicate='(owner_key=%s AND owner_type=\'account\' AND access_policy_fingerprint=%s)'
    if allow_legacy and principal.permits('reports.legacy'):
        predicate='('+predicate+" OR (owner_key IS NULL AND owner_type='legacy'))"
    return predicate,[principal.owner_key,principal.access_fingerprint]


def _audit(action,report_id=None):
    if _principal() is not None:
        from services.telemetry import audit
        audit(action,'report',resource_key=report_id)


def _authoritative_report(data,permission='reports.export'):
    principal=_principal(permission)
    if principal is None: return data
    from services.session_service import get_session
    session=get_session(data.get('session_id',''))
    if not session or session.owner_id!=principal.bound_owner or not session.report_response:
        raise HTTPException(404,'Không tìm thấy báo cáo thuộc phiên phân tích được cấp quyền.')
    # Always export server-owned results. Client numbers and verification claims
    # cannot become a new trusted report through this endpoint.
    # Redis sessions deliberately omit rows/chart data to bound refinement state.
    # Saving that summary would persist blank charts despite a valid conclusion.
    from services.analysis_pipeline import AnalysisPipeline
    from services.analysis_response_service import restore_report_presentation
    response=deepcopy(session.report_response)
    try:
        response=restore_report_presentation(response,session.agent_artifacts,AnalysisPipeline().catalog())
    except HTTPException:raise
    except Exception:
        raise HTTPException(409,'Dữ liệu báo cáo không còn đủ để lưu hoặc xuất; hãy chạy lại phân tích.') from None
    from services.access_policy import current_principal
    current_principal(required=True)  # Revocation while reading artifacts cannot publish/export.
    return response


def _insert_saved(payload,report_id):
    principal=_principal('reports.save')
    _audit('report.save',report_id)
    columns=['id','title','description','category','query_type','sql_query','visualization_type',
             'x_key','y_key','ai_summary','created_by','module_config']
    values=[report_id,payload.title.strip(),payload.description.strip() if payload.description else '',
        payload.category or 'sales',payload.query_type or 'sql',payload.sql_query.strip(),payload.visualization_type or 'table',
        payload.x_key,payload.y_key,payload.ai_summary,principal.owner_key if principal else payload.created_by or 'Chuyên viên phân tích',
        Json(payload.module_config) if payload.module_config is not None else None]
    if principal:
        columns+=['owner_key','owner_type','access_policy_fingerprint','semantic_contract_version']
        values+=[principal.owner_key,'account',principal.access_fingerprint,'3.4.0']
    with get_db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute('INSERT INTO analytics.saved_reports ('+','.join(columns)+') VALUES ('+
                ','.join(['%s']*len(values))+') RETURNING id,title,created_at',values)
            result=cur.fetchone()
        conn.commit()
    return dict(result)


def _make_content_disposition(title: str, timestamp: bool = False) -> str:
    nfkd = unicodedata.normalize('NFKD', title)
    ascii_clean = nfkd.encode('ASCII', 'ignore').decode('ASCII')
    safe_ascii = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in ascii_clean).strip("_")
    safe_ascii = safe_ascii[:40] if safe_ascii else "Bao_Cao_AI"
    
    time_str = f"_{datetime.now().strftime('%Y%m%d_%H%M%S')}" if timestamp else ""
    ascii_filename = f"{safe_ascii}{time_str}.docx"
    utf8_raw = f"{title[:40]}{time_str}.docx"
    utf8_encoded = urllib.parse.quote(utf8_raw)
    
    return f'attachment; filename="{ascii_filename}"; filename*=UTF-8\'\'{utf8_encoded}'


class BIExportRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    kind: Literal['revenue','stores','products','customers']
    date_range: Literal['today','7days','14days','30days','90days','all'] = '30days'
    branch: str = Field(default='all',min_length=1,max_length=120)


@router.post('/export-data')
def export_business_data(payload: BIExportRequest):
    """Generate authorized BI CSV from server data; no client rows or SQL."""
    import csv
    import io
    from services.access_policy import authorize_route,current_principal
    from services.analytical_capacity_planner import AnalyticalCapacityContract
    principal=_principal('reports.export')
    prefix={'revenue':'marts','stores':'stores','products':'products','customers':'customers'}[payload.kind]
    if principal:authorize_route(principal,'/api/'+prefix+'/overview' if prefix!='marts' else '/api/marts/all','GET')
    _audit('report.export','bi_'+payload.kind)
    if payload.kind=='revenue':
        from routers.marts import get_all_marts
        rows=get_all_marts(payload.date_range,payload.branch,'all')['revenue_daily']
        columns=[('date','Ngày'),('total_orders','Đơn hoàn thành/đang giao'),('revenue','Doanh thu (VND)')]
    elif payload.kind=='stores':
        from routers.stores import get_stores_overview
        rows=get_stores_overview(date_range=payload.date_range,branch=payload.branch)['stores']
        columns=[('store_code','Mã điểm bán'),('store_name','Điểm bán'),('city','Tỉnh/thành'),
            ('total_orders','Số đơn mọi trạng thái'),('total_revenue','Doanh thu (VND)'),('aov','AOV đơn hợp lệ (VND)')]
    elif payload.kind=='products':
        from routers.products import get_products_overview
        rows=get_products_overview(payload.date_range,payload.branch)['all_products']
        columns=[('product_id','Mã món'),('product_name','Tên món'),('category_name','Nhóm món'),
            ('total_sold','Số sản phẩm'),('total_revenue','Giá trị dòng món (VND)')]
    else:
        from routers.customers import get_customers_overview
        rows=get_customers_overview(payload.date_range,payload.branch)['top_customers']
        columns=[('customer_name','Mã khách ẩn danh (Top15)'),('order_count','Đơn hợp lệ trong kỳ'),('total_spent','Tổng tiền đơn (VND)')]
    capacity=AnalyticalCapacityContract.from_env().response_bytes
    if len(rows)>5000:raise HTTPException(413,'Dữ liệu xuất vượt giới hạn; hãy thu hẹp phạm vi.')
    output=io.StringIO(newline='');writer=csv.writer(output)
    writer.writerow([label for field,label in columns]+['Kỳ dữ liệu','Phạm vi yêu cầu','Thời điểm xuất (UTC)'])
    from datetime import timezone
    observed=datetime.now(timezone.utc).isoformat()
    def safe(value):
        # Prevent spreadsheet formulas in text labels. Numbers retain their
        # signed numeric value; no source contact fields are exported.
        if isinstance(value,str) and len(value.encode('utf-8'))>4096:raise HTTPException(413,'Nhãn dữ liệu xuất vượt giới hạn.')
        return "'"+value if isinstance(value,str) and value.lstrip().startswith(('=','+','-','@')) else value
    for row in rows:
        writer.writerow([safe(row.get(field)) for field,label in columns]+[payload.date_range,safe(payload.branch),observed])
        if output.tell()>capacity:raise HTTPException(413,'Tệp vượt giới hạn; hãy thu hẹp phạm vi.')
    body=('\ufeff'+output.getvalue()).encode('utf-8')
    if len(body)>capacity:
        raise HTTPException(413,'Tệp vượt giới hạn; hãy thu hẹp phạm vi.')
    if principal:
        current_principal(required=True)
        from services.telemetry import audit
        audit('report.export','report',resource_key='bi_'+payload.kind,decision='completed',details={'rows':len(rows)})
    return Response(body,media_type='text/csv; charset=utf-8',headers={
        'Content-Disposition':'attachment; filename="du_lieu_'+payload.kind+'.csv"',
        'Cache-Control':'no-store','X-Export-Row-Count':str(len(rows))})


@router.get("/saved")
def list_saved_reports(
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None)
):
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                owner_clause, params = _owned_where(allow_legacy=True)
                where_clauses = [owner_clause]

                if category and category != "all":
                    where_clauses.append("category = %s")
                    params.append(category)

                if search and search.strip():
                    where_clauses.append("(title ILIKE %s OR description ILIKE %s)")
                    params.extend([f"%{search.strip()}%", f"%{search.strip()}%"])

                sql = f"""
                    SELECT 
                        id, title, description, category, query_type,
                        sql_query, visualization_type, x_key, y_key,
                        ai_summary, created_by, module_config,
                        TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') AS created_at,
                        TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI') AS updated_at
                    FROM analytics.saved_reports
                    WHERE {" AND ".join(where_clauses)}
                    ORDER BY created_at DESC;
                """
                cur.execute(sql, params)
                reports = [dict(r) for r in cur.fetchall()]
                return {"reports": reports, "total": len(reports)}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Thao tác báo cáo chưa hoàn tất; vui lòng kiểm tra quyền hoặc trạng thái lưu trữ.")


@router.post("/saved")
def create_saved_report(payload: SavedReportCreate):
    principal=_principal('reports.save')
    if principal:
        if payload.module_config:
            data=_authoritative_report(payload.module_config,'reports.save')
            payload=payload.model_copy(update={'module_config':data,'sql_query':data.get('sql_query') or ''})
        else:
            _principal('sql.explore')
    from services.report_sql_policy import validate_saved_payload
    try:
        validate_saved_payload(payload)
    except Exception:
        raise HTTPException(400, "SQL báo cáo chưa vượt qua chính sách phân tích và trường nhạy cảm.") from None
    try:
        report_id = f"rpt_{uuid.uuid4().hex[:12]}"
        created=_insert_saved(payload,report_id)
        return {'status':'success','report':created,'id':report_id}
    except HTTPException: raise
    except Exception:
        raise HTTPException(503,'Kho lưu trữ báo cáo chưa sẵn sàng.') from None


@router.get("/saved/{report_id}")
def get_saved_report(report_id: str):
    owner_clause,owner_params=_owned_where(allow_legacy=True)
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(f"""
                    SELECT 
                        id, title, description, category, query_type,
                        sql_query, visualization_type, x_key, y_key,
                        ai_summary, created_by, module_config,
                        TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') AS created_at,
                        TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI') AS updated_at
                    FROM analytics.saved_reports
                    WHERE id = %s AND {owner_clause};
                """, (report_id,*owner_params))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Không tìm thấy báo cáo yêu cầu")
                stored=dict(row)
                config=stored.get('module_config')
                if isinstance(config,dict) and any('data' not in c for c in config.get('charts',[])):
                    # Repair presentation of summaries saved before this fix only
                    # while their owned immutable source artifacts still exist.
                    try:stored['module_config']=_authoritative_report(config,'analytics.read')
                    except HTTPException as error:
                        if error.status_code not in {404,409}:raise
                        stored['presentation_status']='source_artifacts_unavailable'
                return stored
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Thao tác báo cáo chưa hoàn tất; vui lòng kiểm tra quyền hoặc trạng thái lưu trữ.")


@router.delete("/saved/{report_id}")
def delete_saved_report(report_id: str):
    owner_clause,owner_params=_owned_where(allow_legacy=False)
    _principal('reports.save')
    _audit('report.delete',report_id)
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM analytics.saved_reports WHERE id = %s AND "+owner_clause+" RETURNING id;", (report_id,*owner_params))
                deleted = cur.fetchone()
                if not deleted:
                    raise HTTPException(status_code=404, detail="Không tìm thấy báo cáo để xóa")
                conn.commit()
                return {"status": "success", "message": "Đã xóa báo cáo thành công", "id": report_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Thao tác báo cáo chưa hoàn tất; vui lòng kiểm tra quyền hoặc trạng thái lưu trữ.")


@router.get("/saved/{report_id}/execute")
@router.post("/saved/{report_id}/execute")
@router.get("/saved/{report_id}/run")
@router.post("/saved/{report_id}/run")
def run_saved_report(report_id: str, request: Request = None):
    owner_clause,owner_params=_owned_where(allow_legacy=False)
    from services.report_sql_policy import require_sql_admin, validate_report_sql
    require_sql_admin(request)
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(f"""
                    SELECT id, title, sql_query, visualization_type, x_key, y_key, ai_summary
                    FROM analytics.saved_reports
                    WHERE id = %s AND {owner_clause};
                """, (report_id,*owner_params))
                report = cur.fetchone()
                if not report:
                    raise HTTPException(status_code=404, detail="Không tìm thấy báo cáo yêu cầu")

                sql = report["sql_query"]
        validate_report_sql(sql)
        result = execute_read_only(sql, row_limit=500)
        return {
            "report_id": report["id"],
            "title": report["title"],
            "visualization_type": report["visualization_type"],
            "x_key": report["x_key"],
            "y_key": report["y_key"],
            "ai_summary": report["ai_summary"],
            "rows": result["rows"],
            "columns": result["columns"],
            "total_rows": result["count"],
            "truncated": result["truncated"],
            "execution_time_ms": result["duration_ms"]
        }
    except HTTPException:
        raise
    except (SqlSafetyError, QueryExecutionError) as e:
        raise HTTPException(status_code=400, detail="Thao tác báo cáo chưa hoàn tất; vui lòng kiểm tra quyền hoặc trạng thái lưu trữ.")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Thao tác báo cáo chưa hoàn tất; vui lòng kiểm tra quyền hoặc trạng thái lưu trữ.")


@router.post("/preview")
def preview_report_query(payload: dict, request: Request = None):
    from services.report_sql_policy import require_sql_admin, validate_report_sql
    require_sql_admin(request)
    sql = payload.get("sql_query", "").strip()
    if not sql:
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp câu lệnh truy vấn dữ liệu")
    try:
        validate_report_sql(sql)
        result = execute_read_only(sql, row_limit=500)
        return {
            "rows": result["rows"],
            "columns": result["columns"],
            "total_rows": result["count"],
            "truncated": result["truncated"],
            "execution_time_ms": result["duration_ms"]
        }
    except (SqlSafetyError, QueryExecutionError) as e:
        raise HTTPException(status_code=400, detail="Thao tác báo cáo chưa hoàn tất; vui lòng kiểm tra quyền hoặc trạng thái lưu trữ.")



@router.get("/logs")
def get_export_logs():
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(f"""
                    SELECT 
                        id, report_title, format, row_count, file_size, status, user_name,
                        TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
                    FROM analytics.report_export_logs
                    ORDER BY created_at DESC
                    LIMIT 50;
                """)
                logs = [dict(r) for r in cur.fetchall()]
                return {"logs": logs}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Thao tác báo cáo chưa hoàn tất; vui lòng kiểm tra quyền hoặc trạng thái lưu trữ.")


@router.post("/export-log")
def log_report_export(payload: ReportExportLogCreate):
    try:
        log_id = f"log_{uuid.uuid4().hex[:8]}"
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO analytics.report_export_logs (
                        id, report_title, format, row_count, file_size, status, user_name
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id;
                """, (
                    log_id,
                    payload.report_title,
                    payload.format,
                    payload.row_count,
                    payload.file_size or "0 KB",
                    payload.status or "Thành công",
                    payload.user_name or "Chuyên viên phân tích"
                ))
                conn.commit()
                return {"status": "success", "id": log_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Thao tác báo cáo chưa hoàn tất; vui lòng kiểm tra quyền hoặc trạng thái lưu trữ.")


@router.post("/export-docx")
def export_report_docx(payload: dict):
    report_data = payload.get("report_data") or payload
    if not report_data:
        raise HTTPException(status_code=400, detail="Không có dữ liệu báo cáo để xuất file DOCX")
    
    report_data = _authoritative_report(report_data)
    _audit('report.export')
    report_data = _verified_export(report_data)
    if payload.get("save_to_db", True):
        from services.report_sql_policy import validate_saved_payload
        try:
            validate_saved_payload(SavedReportCreate(title=report_data.get("title") or "Báo cáo",sql_query=report_data.get("sql_query") or "",module_config=report_data))
        except Exception:
            raise HTTPException(400, "SQL của báo cáo chưa vượt qua chính sách lưu trữ.") from None
    title = report_data.get("title") or "Bao_Cao_Phan_Tich_AI"
    content_disposition = _make_content_disposition(title, timestamp=True)

    save_to_db = payload.get("save_to_db", True)
    if save_to_db:
        _insert_saved(SavedReportCreate(title=title[:250],description=report_data.get('description','')[:500],
            category='ai_report',query_type='sql',sql_query=report_data.get('sql_query') or 'SELECT 1;',
            visualization_type='table',ai_summary=report_data.get('executive_summary') or '',module_config=report_data),
            'rpt_'+uuid.uuid4().hex[:12])

    buffer = generate_report_docx(report_data)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": content_disposition}
    )


@router.get("/saved/{report_id}/download-docx")
def download_saved_report_docx(report_id: str):
    owner_clause,owner_params=_owned_where(allow_legacy=False)
    _principal('reports.export')
    _audit('report.export',report_id)
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(f"""
                    SELECT id, title, description, ai_summary, module_config
                    FROM analytics.saved_reports
                    WHERE id = %s AND {owner_clause};
                """, (report_id,*owner_params))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Không tìm thấy báo cáo yêu cầu")
                
                report = dict(row)
                report_data = report.get("module_config") or {
                    "title": report["title"],
                    "description": report["description"],
                    "executive_summary": report["ai_summary"]
                }
                
                title = report["title"] or "Bao_Cao_Phan_Tich_AI"
                content_disposition = _make_content_disposition(title, timestamp=False)

                if any('data' not in chart for chart in report_data.get('charts',[])):
                    report_data=_authoritative_report(report_data,'reports.export')
                report_data = _verified_export(report_data)
                buffer = generate_report_docx(report_data)
                return StreamingResponse(
                    buffer,
                    media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    headers={"Content-Disposition": content_disposition}
                )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Thao tác báo cáo chưa hoàn tất; vui lòng kiểm tra quyền hoặc trạng thái lưu trữ.")


def _verified_export(report_data):
    from services.analysis_quality_service import verify_saved_report, not_scored
    from services.analysis_catalog import AnalysisCatalog
    from services.metadata_service import get_local_metadata
    data = dict(report_data)
    try:
        data['quality_assessment'] = verify_saved_report(data, AnalysisCatalog(get_local_metadata()))
    except Exception:
        data['quality_assessment'] = not_scored('Danh mục chưa sẵn sàng để kiểm chứng lại báo cáo.')
    return data
