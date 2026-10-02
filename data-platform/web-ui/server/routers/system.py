from fastapi import APIRouter, HTTPException
from db import get_db_conn

router = APIRouter(prefix="/api/system", tags=["System Administration"])


@router.get("/users")
def get_system_users():
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                # 1. Data Platform access accounts = PostgreSQL database roles
                cur.execute("""
                    SELECT 
                        ROW_NUMBER() OVER (ORDER BY r.rolname) as id,
                        r.rolname as username,
                        r.rolname as full_name,
                        CASE
                            WHEN r.rolsuper THEN 'Quản trị viên'
                            WHEN r.rolcreatedb THEN 'Chuyên viên dữ liệu'
                            WHEN r.rolcanlogin THEN 'Người xem'
                            ELSE 'Vai trò hệ thống'
                        END as role,
                        CASE WHEN r.rolcanlogin THEN 'Hoạt động' ELSE 'Tạm dừng' END as status,
                        r.rolname || '@data-platform.local' as email,
                        'Truy cập kho dữ liệu' as last_login
                    FROM pg_roles r
                    WHERE r.rolcanlogin = true
                      AND r.rolname NOT LIKE 'pg_%'
                    ORDER BY r.rolname;
                """)
                users = [dict(r) for r in cur.fetchall()]

                # 2. Data Platform roles breakdown
                roles = [
                    {
                        "role": "Quản trị viên",
                        "users_count": sum(1 for u in users if u["role"] == "Quản trị viên"),
                        "description": "Toàn quyền quản trị nền tảng dữ liệu, cấu hình kết nối và truy vấn SQL"
                    },
                    {
                        "role": "Chuyên viên dữ liệu",
                        "users_count": sum(1 for u in users if u["role"] == "Chuyên viên dữ liệu"),
                        "description": "Truy vấn Data Warehouse, xem báo cáo phân tích và xuất dữ liệu"
                    },
                    {
                        "role": "Người xem",
                        "users_count": sum(1 for u in users if u["role"] == "Người xem"),
                        "description": "Xem các báo cáo tổng quan và bảng điều khiển doanh thu"
                    }
                ]

                # 3. Database health stats for system overview
                cur.execute("""
                    SELECT 
                        pg_database_size(current_database()) as db_size_bytes,
                        (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema IN ('gold', 'orders', 'identity', 'menu', 'inventory')) as total_tables,
                        (SELECT COALESCE(SUM(n_live_tup), 0) FROM pg_stat_user_tables WHERE schemaname IN ('gold', 'orders', 'identity', 'menu', 'inventory')) as total_rows;
                """)
                db_stats = dict(cur.fetchone() or {})

                return {
                    "users": users,
                    "roles": roles,
                    "db_stats": {
                        "db_size_mb": round(int(db_stats.get("db_size_bytes") or 0) / (1024 * 1024), 1),
                        "total_tables": int(db_stats.get("total_tables") or 0),
                        "total_rows": int(db_stats.get("total_rows") or 0)
                    }
                }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/logs")
def get_system_logs():
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
