"""Batch ratings/comments for frozen canonical product IDs, never name re-resolution."""
import logging
import os
from sqlalchemy import text
from src.function_calling.helpers import _get_engine, _clean_dict

logger = logging.getLogger(__name__)


def execute_get_products_reviews(product_ids):
    ids = [str(key) for key in product_ids]
    if not ids or len(ids) > 16 or len(set(ids)) != len(ids):
        return {'status': 'invalid_product_reference', 'message': 'Dạ, bạn chọn các món muốn xem đánh giá trong danh sách nhé.'}
    menu, orders = os.getenv('MENU_SCHEMA', 'menu'), os.getenv('ORDER_SCHEMA', 'orders')
    try:
        with _get_engine().connect() as conn:
            products = conn.execute(text(f'''
                SELECT ma_san_pham::text AS product_id, ten_san_pham AS product_name
                FROM {menu}.san_pham WHERE trang_thai = TRUE AND ma_san_pham::text = ANY(:ids)
            '''), {'ids': ids}).mappings().all()
            indexed = {str(r['product_id']): _clean_dict(dict(r)) for r in products}
            if set(indexed) != set(ids):
                return {'status': 'not_found', 'message': 'Dạ, một món trong danh sách đã thay đổi thông tin. Bạn xem lại danh sách món rồi chọn lại nhé.'}
            stats = conn.execute(text(f'''
                SELECT TRIM(ma_san_pham::text) AS product_id, AVG(so_sao)::float AS avg_rating,
                       COUNT(*)::integer AS total_reviews,
                       COUNT(*) FILTER (WHERE so_sao = 5) AS r5,
                       COUNT(*) FILTER (WHERE so_sao = 4) AS r4,
                       COUNT(*) FILTER (WHERE so_sao = 3) AS r3,
                       COUNT(*) FILTER (WHERE so_sao = 2) AS r2,
                       COUNT(*) FILTER (WHERE so_sao = 1) AS r1
                FROM {orders}.danh_gia_san_pham
                WHERE TRIM(ma_san_pham::text) = ANY(:ids) AND so_sao BETWEEN 1 AND 5
                GROUP BY TRIM(ma_san_pham::text)
            '''), {'ids': ids}).mappings().all()
            for row in indexed.values():
                row.update(total_reviews=0, avg_rating=None, reviews=[])
            for stat in stats:
                indexed[str(stat['product_id'])].update(avg_rating=float(stat['avg_rating']),
                    total_reviews=int(stat['total_reviews']),
                    rating_distribution={str(star): int(stat['r'+str(star)]) for star in range(1, 6)})
            comments = conn.execute(text(f'''
                WITH ranked AS (
                    SELECT TRIM(ma_san_pham::text) AS product_id, so_sao AS rating,
                           LEFT(binh_luan, 3000) AS comment, ngay_tao AS created_at,
                           ROW_NUMBER() OVER (PARTITION BY TRIM(ma_san_pham::text) ORDER BY ngay_tao DESC, id DESC) AS position
                    FROM {orders}.danh_gia_san_pham
                    WHERE TRIM(ma_san_pham::text) = ANY(:ids) AND so_sao BETWEEN 1 AND 5
                          AND binh_luan IS NOT NULL AND BTRIM(binh_luan) != ''
                ) SELECT product_id, rating, comment, created_at FROM ranked
                  WHERE position <= 5 ORDER BY product_id, position
            '''), {'ids': ids}).mappings().all()
            for comment in comments:
                row = _clean_dict(dict(comment))
                if hasattr(row.get('created_at'), 'isoformat'):
                    row['created_at'] = row['created_at'].isoformat()
                indexed[str(comment['product_id'])]['reviews'].append(row)
        return {'status': 'ok', 'reviewed_products': [indexed[key] for key in ids]}
    except Exception as exc:
        logger.warning('product review batch failed: %s', type(exc).__name__)
        return {'status': 'unavailable', 'message': 'Dạ, mình chưa đọc được đánh giá lúc này. Bạn vui lòng thử lại nhé.'}
