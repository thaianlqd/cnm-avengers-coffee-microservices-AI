import json
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import text
from sqlalchemy.engine import Engine


def safe_schema_name(value: Optional[str], default: str) -> str:
    name = (value or default).strip()
    if not name:
        return default
    if all(ch.isalnum() or ch == "_" for ch in name):
        return name
    return default


def _safe_json(value: Optional[Dict[str, Any]]) -> Optional[str]:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False, default=str)


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except Exception:
        return None


def ensure_ai_storage(engine: Engine, schema: str) -> None:
    with engine.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
        conn.execute(
            text(
                f'''
                CREATE TABLE IF NOT EXISTS "{schema}".mo_hinh_ai (
                    ma_mo_hinh BIGSERIAL PRIMARY KEY,
                    ten_mo_hinh VARCHAR(64) NOT NULL,
                    phien_ban VARCHAR(32) NOT NULL,
                    da_huan_luyen BOOLEAN NOT NULL DEFAULT FALSE,
                    tong_ban_ghi INTEGER NOT NULL DEFAULT 0,
                    tong_thuc_the INTEGER NOT NULL DEFAULT 0,
                    thoi_diem_huan_luyen TIMESTAMPTZ NULL,
                    chi_so JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                    ngay_tao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    ngay_cap_nhat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (ten_mo_hinh, phien_ban)
                )
                '''
            )
        )
        conn.execute(
            text(
                f'''
                CREATE TABLE IF NOT EXISTS "{schema}".nhat_ky_suy_luan (
                    ma_nhat_ky BIGSERIAL PRIMARY KEY,
                    diem_cuoi VARCHAR(80) NOT NULL,
                    ma_nguoi_dung VARCHAR(128) NULL,
                    trang_thai VARCHAR(20) NOT NULL,
                    do_tre_ms INTEGER NULL,
                    du_lieu_yeu_cau JSONB NULL,
                    du_lieu_phan_hoi JSONB NULL,
                    thong_tin_loi TEXT NULL,
                    ngay_tao TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                '''
            )
        )


def upsert_model_registry(
    engine: Engine,
    schema: str,
    model_name: str,
    model_version: str,
    is_trained: bool,
    total_records: int,
    total_entities: int,
    metrics: Optional[Dict[str, Any]] = None,
    trained_at: Optional[str] = None,
) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                f'''
                INSERT INTO "{schema}".mo_hinh_ai (
                    ten_mo_hinh,
                    phien_ban,
                    da_huan_luyen,
                    tong_ban_ghi,
                    tong_thuc_the,
                    thoi_diem_huan_luyen,
                    chi_so
                ) VALUES (
                    :ten_mo_hinh,
                    :phien_ban,
                    :da_huan_luyen,
                    :tong_ban_ghi,
                    :tong_thuc_the,
                    :thoi_diem_huan_luyen,
                    CAST(:chi_so AS jsonb)
                )
                ON CONFLICT (ten_mo_hinh, phien_ban)
                DO UPDATE SET
                    da_huan_luyen = EXCLUDED.da_huan_luyen,
                    tong_ban_ghi = EXCLUDED.tong_ban_ghi,
                    tong_thuc_the = EXCLUDED.tong_thuc_the,
                    thoi_diem_huan_luyen = EXCLUDED.thoi_diem_huan_luyen,
                    chi_so = EXCLUDED.chi_so,
                    ngay_cap_nhat = NOW()
                '''
            ),
            {
                "ten_mo_hinh": model_name,
                "phien_ban": model_version,
                "da_huan_luyen": bool(is_trained),
                "tong_ban_ghi": int(total_records or 0),
                "tong_thuc_the": int(total_entities or 0),
                "thoi_diem_huan_luyen": _parse_dt(trained_at),
                "chi_so": _safe_json(metrics or {}),
            },
        )


def log_inference(
    engine: Engine,
    schema: str,
    endpoint: str,
    user_id: Optional[str],
    status: str,
    latency_ms: Optional[int],
    request_payload: Optional[Dict[str, Any]] = None,
    response_payload: Optional[Dict[str, Any]] = None,
    error_message: Optional[str] = None,
) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                f'''
                INSERT INTO "{schema}".nhat_ky_suy_luan (
                    diem_cuoi,
                    ma_nguoi_dung,
                    trang_thai,
                    do_tre_ms,
                    du_lieu_yeu_cau,
                    du_lieu_phan_hoi,
                    thong_tin_loi
                ) VALUES (
                    :diem_cuoi,
                    :ma_nguoi_dung,
                    :trang_thai,
                    :do_tre_ms,
                    CAST(:du_lieu_yeu_cau AS jsonb),
                    CAST(:du_lieu_phan_hoi AS jsonb),
                    :thong_tin_loi
                )
                '''
            ),
            {
                "diem_cuoi": endpoint,
                "ma_nguoi_dung": user_id,
                "trang_thai": status,
                "do_tre_ms": latency_ms,
                "du_lieu_yeu_cau": _safe_json(request_payload),
                "du_lieu_phan_hoi": _safe_json(response_payload),
                "thong_tin_loi": error_message,
            },
        )
