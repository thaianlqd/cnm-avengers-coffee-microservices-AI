from fastapi import APIRouter, HTTPException
from db import get_db_conn

router = APIRouter(prefix="/api/system", tags=["System Administration"])


@router.get('/source-operations')
def source_operations_status():
    from services.access_policy import current_principal, require_permission
    from services.source_operations_service import sync_status
    principal=current_principal(required=True)
    require_permission(principal,'analytics.read')
    return sync_status(principal)


@router.post('/sources/check')
def check_source_health():
    from services.access_policy import current_principal, require_permission
    from services.source_operations_service import health_refresh
    principal=current_principal(required=True)
    require_permission(principal,'analytics.read')
    return {'data_coverage':health_refresh(principal)}


@router.post('/sources/sync',status_code=202)
def sync_sources():
    from services.access_policy import current_principal, require_permission
    from services.source_operations_service import request_sync
    from services.telemetry import audit
    require_permission(current_principal(required=True),'pipeline.trigger')
    audit('pipeline.trigger','pipeline',details={'reason':'replica_full_reconcile'})
    result=request_sync()
    return result


@router.get("/users")
def get_system_users():
    from services.access_policy import current_principal, require_permission, load_policy
    principal = current_principal(required=True)
    require_permission(principal, 'system.read')
    policy = load_policy()
    roles = [{'role': role, 'users_count': None,
              'permissions': sorted(grants.get('permissions', [])),
              'description': 'Vai trò được khai báo trong chính sách Data Platform; chưa kết nối danh bạ tài khoản.'}
             for role, grants in sorted(policy.get('roles', {}).items())]
    return {'users': [{'id': principal.owner_key, 'username': principal.subject,
                      'full_name': 'Tài khoản đang đăng nhập', 'role': principal.role,
                      'status': 'Đang đăng nhập', 'email': None, 'last_login': None}],
            'roles': roles, 'db_stats': None, 'total_users': None,
            'directory_status': 'not_configured', 'policy_version': principal.policy_version,
            'directory_note': 'Chỉ hiển thị phiên đã xác thực và vai trò trong policy. Chưa kết nối danh bạ Identity; đây không phải danh sách toàn bộ tài khoản.'}


@router.get("/logs")
def get_system_logs():
    from services.access_policy import current_principal, require_permission
    require_permission(current_principal(required=True), 'system.read')
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT bool_and(has_column_privilege(current_user, 'public.sync_history', c, 'SELECT')) AS permitted "
                            "FROM unnest(ARRAY['started_at','finished_at','total_tables','total_rows','status']) AS c")
                if not cur.fetchone()['permitted']:
                    cur.execute("""
                        SELECT TO_CHAR(last_success_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') AS time,
                               'data_sync_worker' AS user,
                               'Checkpoint ' || dataset_id AS action,
                               CASE WHEN error_code IS NOT NULL THEN 'Thất bại'
                                    WHEN last_success_at IS NOT NULL THEN 'Thành công' ELSE 'Chưa đo' END AS status,
                               NULL::int AS duration_seconds
                        FROM analytics.ingestion_checkpoints
                        ORDER BY last_success_at DESC NULLS LAST LIMIT 30
                    """)
                    return {'logs': [dict(row) for row in cur.fetchall()],
                            'source': 'checkpoint_observations',
                            'note': 'Trạng thái checkpoint gần nhất; chưa có quyền đọc lịch sử đầy đủ.'}
                cur.execute("""
                    SELECT
                        TO_CHAR(started_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') as time,
                        'data_sync_worker' as user,
                        CASE
                            WHEN status = 'running' THEN 'Đang chạy đồng bộ dữ liệu...'
                            ELSE 'Đồng bộ ' || COALESCE(total_tables, 0) || ' bảng, ' || COALESCE(total_rows, 0) || ' dòng dữ liệu'
                        END as action,
                        CASE
                            WHEN status = 'success' THEN 'Thành công'
                            WHEN status = 'running' THEN 'Đang xử lý'
                            ELSE 'Thất bại'
                        END as status,
                        COALESCE(
                            EXTRACT(EPOCH FROM (finished_at - started_at))::int,
                            0
                        ) as duration_seconds
                    FROM public.sync_history
                    ORDER BY started_at DESC
                    LIMIT 30;
                """)
                logs = [dict(r) for r in cur.fetchall()]
                return {"logs": logs}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail='Nhật ký đồng bộ tạm thời chưa sẵn sàng.') from None
