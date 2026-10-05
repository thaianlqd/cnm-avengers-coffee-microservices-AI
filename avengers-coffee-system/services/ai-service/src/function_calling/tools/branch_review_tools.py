"""Read approved rating aggregates and recent comments for exact canonical IDs."""
import logging
import os
from sqlalchemy import text
from src.function_calling.helpers import _get_engine, _clean_dict

logger = logging.getLogger(__name__)


def execute_compare_branch_reviews(branch_ids):
    ids = list(dict.fromkeys(branch_ids))
    if not ids or len(ids) > 5 or any(not isinstance(x, str) or not x.strip() for x in ids):
        return {'status': 'invalid_branch_reference', 'message': 'Bạn chọn từ 1 đến 5 chi nhánh trong danh sách vừa xem nhé.'}
    identity = os.getenv('IDENTITY_SCHEMA', 'identity')
    orders = os.getenv('ORDER_SCHEMA', 'orders')
    franchise = os.getenv('FRANCHISE_SCHEMA', 'franchise')
    try:
        with _get_engine().connect() as conn:
            rows = conn.execute(text(f'''
                WITH branches AS (
                    SELECT ma_chi_nhanh AS branch_id, ten_chi_nhanh AS branch_name
                    FROM {identity}.chi_nhanh WHERE trang_thai = 'ACTIVE'
                    UNION ALL
                    SELECT ma_kiosk AS branch_id, ten_kiosk AS branch_name
                    FROM {franchise}.kiosk WHERE trang_thai = 'DANG_HOAT_DONG'
                ), ratings AS (
                    SELECT ma_chi_nhanh, AVG(diem_tong_quan)::float AS avg_rating,
                           COUNT(*)::int AS total_reviews
                    FROM {orders}.danh_gia_chi_nhanh
                    WHERE ma_chi_nhanh = ANY(:ids) AND trang_thai = 'APPROVED'
                    GROUP BY ma_chi_nhanh
                )
                SELECT b.branch_id, b.branch_name, r.avg_rating, COALESCE(r.total_reviews, 0) AS total_reviews
                FROM branches b LEFT JOIN ratings r ON r.ma_chi_nhanh = b.branch_id
                WHERE b.branch_id = ANY(:ids)
            '''), {'ids': ids}).mappings().all()
            indexed = {str(row['branch_id']): _clean_dict(dict(row)) for row in rows}
            if len(indexed) != len(rows) or set(indexed) != set(ids):
                return {'status': 'not_found', 'message': 'Một chi nhánh trong danh sách không còn khớp với hệ thống. Bạn xem lại danh sách chi nhánh rồi chọn lại nhé.'}
            # Count all approved ratings, including ratings with no text. Limit
            # comments PER branch, never globally to five comments for five stores.
            comments = conn.execute(text(f'''
                WITH ranked AS (
                    SELECT ma_chi_nhanh, diem_tong_quan AS rating, LEFT(nhan_xet, 3000) AS comment,
                           ROW_NUMBER() OVER (PARTITION BY ma_chi_nhanh ORDER BY ngay_tao DESC, id DESC) AS position
                    FROM {orders}.danh_gia_chi_nhanh
                    WHERE ma_chi_nhanh = ANY(:ids) AND trang_thai = 'APPROVED'
                          AND nhan_xet IS NOT NULL AND BTRIM(nhan_xet) != ''
                ) SELECT ma_chi_nhanh, rating, comment FROM ranked WHERE position <= 3 ORDER BY ma_chi_nhanh, position
            '''), {'ids': ids}).mappings().all()
            for branch in indexed.values():
                branch['reviews'] = []
            for comment in comments:
                indexed[str(comment['ma_chi_nhanh'])]['reviews'].append({
                    'rating': float(comment['rating']), 'comment': str(comment['comment'])})
        return {'status': 'ok', 'reviewed_branches': [indexed[x] for x in ids]}
    except Exception as exc:
        logger.warning('branch review comparison failed: %s', type(exc).__name__)
        return {'status': 'unavailable', 'message': 'Mình chưa đọc được đánh giá từ hệ thống lúc này. Bạn thử lại nhé; mình chưa có dữ liệu để xếp hạng các chi nhánh ạ.'}
