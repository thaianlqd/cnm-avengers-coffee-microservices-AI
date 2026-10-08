"""Informational store reads remain available before checkout starts."""
import logging
import os
from sqlalchemy import text
from src.function_calling.helpers import _get_engine, _clean_dict
from src.rag.documents import normalize_text

logger = logging.getLogger(__name__)


def execute_get_store_info(branch_id=None, search_text=None, area=None, limit=5):
    identity = os.getenv('IDENTITY_SCHEMA', 'identity')
    franchise = os.getenv('FRANCHISE_SCHEMA', 'franchise')
    try:
        with _get_engine().connect() as conn:
            rows = conn.execute(text(f'''
                WITH stores AS (
                    SELECT ma_chi_nhanh AS branch_id, ten_chi_nhanh AS branch_name, dia_chi AS address,
                           gio_mo_cua AS opening_time, gio_dong_cua AS closing_time, 'branch' AS store_type
                    FROM {identity}.chi_nhanh WHERE trang_thai = 'ACTIVE'
                    UNION ALL
                    SELECT ma_kiosk AS branch_id, ten_kiosk AS branch_name, dia_chi AS address,
                           NULL AS opening_time, NULL AS closing_time, 'kiosk' AS store_type
                    FROM {franchise}.kiosk WHERE trang_thai = 'DANG_HOAT_DONG'
                ) SELECT * FROM stores
                WHERE (CAST(:branch_id AS text) IS NULL OR branch_id = :branch_id)
                ORDER BY branch_name, branch_id
            '''), {'branch_id': branch_id}).mappings().all()
        branches = [_clean_dict(dict(row)) for row in rows]
        if area:
            from src.agents.location_parser import locality_matches
            branches = [row for row in branches if locality_matches(row.get('address') or '', area)]
        if search_text:
            key = normalize_text(search_text)
            branches = [row for row in branches if key == normalize_text(row['branch_id']) or
                all(term in normalize_text(row['branch_name'] + ' ' + (row.get('address') or '')) for term in key.split())]
        if not branches:
            return {'status': 'not_found', 'branches': [], 'message': 'Chưa tìm thấy chi nhánh phù hợp. Bạn gửi tên hoặc khu vực cửa hàng nhé.'}
        return {'status': 'ok', 'branches': branches[:16 if search_text else max(1, min(5, int(limit)))],
                'area': area, 'requested_count': limit, 'exact_branch': bool(branch_id),
                'hours_authority': 'identity.chi_nhanh', 'message': ''}
    except Exception as exc:
        logger.warning('store information failed: %s', type(exc).__name__)
        return {'status': 'unavailable', 'message': 'Mình chưa đọc được thông tin cửa hàng lúc này. Bạn thử lại nhé.'}
