import uuid
import unicodedata
import urllib.parse
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from psycopg2.extras import Json
from db import get_db_conn
from common import SavedReportCreate, ReportExportLogCreate
from services.sql_service import SqlSafetyError, QueryExecutionError, execute_read_only
from services.docx_service import generate_report_docx

router = APIRouter(prefix="/api/reports", tags=["Reports Management"])


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


@router.get("/saved")
def list_saved_reports(
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None)
):
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                where_clauses = ["1=1"]
                params = []

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
        raise HTTPException(status_code=500, detail=f"Lỗi lấy danh sách báo cáo: {str(e)}")


@router.post("/saved")
def create_saved_report(payload: SavedReportCreate):
    try:
        report_id = f"rpt_{uuid.uuid4().hex[:12]}"
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO analytics.saved_reports (
                        id, title, description, category, query_type, sql_query,
                        visualization_type, x_key, y_key, ai_summary, created_by, module_config
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, title, created_at;
                """, (
                    report_id,
                    payload.title.strip(),
                    payload.description.strip() if payload.description else "",
                    payload.category or "sales",
                    payload.query_type or "sql",
                    payload.sql_query.strip(),
                    payload.visualization_type or "table",
                    payload.x_key,
                    payload.y_key,
                    payload.ai_summary,
                    payload.created_by or "Chuyên viên phân tích",
                    Json(payload.module_config) if payload.module_config is not None else None,
                ))
                created = cur.fetchone()
                conn.commit()
                return {"status": "success", "message": "Đã lưu báo cáo thành công", "report": dict(created)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi lưu báo cáo: {str(e)}")


@router.get("/saved/{report_id}")
def get_saved_report(report_id: str):
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        id, title, description, category, query_type,
                        sql_query, visualization_type, x_key, y_key,
                        ai_summary, created_by, module_config,
                        TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') AS created_at,
                        TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI') AS updated_at
                    FROM analytics.saved_reports
                    WHERE id = %s;
                """, (report_id,))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Không tìm thấy báo cáo yêu cầu")
                return dict(row)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi lấy thông tin báo cáo: {str(e)}")


@router.delete("/saved/{report_id}")
def delete_saved_report(report_id: str):
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM analytics.saved_reports WHERE id = %s RETURNING id;", (report_id,))
                deleted = cur.fetchone()
                if not deleted:
                    raise HTTPException(status_code=404, detail="Không tìm thấy báo cáo để xóa")
                conn.commit()
                return {"status": "success", "message": "Đã xóa báo cáo thành công", "id": report_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi xóa báo cáo: {str(e)}")


@router.get("/saved/{report_id}/execute")
@router.post("/saved/{report_id}/execute")
@router.get("/saved/{report_id}/run")
@router.post("/saved/{report_id}/run")
def run_saved_report(report_id: str):
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, title, sql_query, visualization_type, x_key, y_key, ai_summary
                    FROM analytics.saved_reports
                    WHERE id = %s;
                """, (report_id,))
                report = cur.fetchone()
                if not report:
                    raise HTTPException(status_code=404, detail="Không tìm thấy báo cáo yêu cầu")

                sql = report["sql_query"]
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
        raise HTTPException(status_code=400, detail=f"Lỗi thực thi báo cáo: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi thực thi báo cáo: {str(e)}")


@router.post("/preview")
def preview_report_query(payload: dict):
    sql = payload.get("sql_query", "").strip()
    if not sql:
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp câu lệnh truy vấn dữ liệu")
    try:
        result = execute_read_only(sql, row_limit=500)
        return {
            "rows": result["rows"],
            "columns": result["columns"],
            "total_rows": result["count"],
            "truncated": result["truncated"],
            "execution_time_ms": result["duration_ms"]
        }
    except (SqlSafetyError, QueryExecutionError) as e:
        raise HTTPException(status_code=400, detail=f"Lỗi truy vấn dữ liệu: {str(e)}")



@router.get("/logs")
def get_export_logs():
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
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
        raise HTTPException(status_code=500, detail=f"Lỗi tải nhật ký xuất: {str(e)}")


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
        raise HTTPException(status_code=500, detail=f"Lỗi ghi nhật ký: {str(e)}")


@router.post("/export-docx")
def export_report_docx(payload: dict):
    report_data = payload.get("report_data") or payload
    if not report_data:
        raise HTTPException(status_code=400, detail="Không có dữ liệu báo cáo để xuất file DOCX")
    
    title = report_data.get("title") or "Bao_Cao_Phan_Tich_AI"
    content_disposition = _make_content_disposition(title, timestamp=True)

    save_to_db = payload.get("save_to_db", True)
    if save_to_db:
        try:
            report_id = f"rpt_{uuid.uuid4().hex[:12]}"
            with get_db_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO analytics.saved_reports (
                            id, title, description, category, query_type, sql_query,
                            visualization_type, x_key, y_key, ai_summary, created_by, module_config
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (id) DO NOTHING;
                    """, (
                        report_id,
                        title[:250],
                        report_data.get("description", "")[:500],
                        "ai_report",
                        "sql",
                        report_data.get("sql_query") or "SELECT 1;",
                        report_data.get("visualizations", {}).get("trend", "area"),
                        "label",
                        "value",
                        report_data.get("executive_summary") or "",
                        "Trợ lý AI Data Platform",
                        Json(report_data)
                    ))
                    conn.commit()
        except Exception as e:
            pass

    report_data = _verified_export(report_data)
    buffer = generate_report_docx(report_data)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": content_disposition}
    )


@router.get("/saved/{report_id}/download-docx")
def download_saved_report_docx(report_id: str):
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, title, description, ai_summary, module_config
                    FROM analytics.saved_reports
                    WHERE id = %s;
                """, (report_id,))
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
        raise HTTPException(status_code=500, detail=f"Lỗi xuất báo cáo DOCX: {str(e)}")


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
