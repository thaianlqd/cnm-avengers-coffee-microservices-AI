"""Description relevance from approved RAG; identity/price/scope from live Menu."""
import logging
from src.rag.documents import normalize_document

logger = logging.getLogger(__name__)


def recommend_from_descriptions(query, category='all', top_k=5, search_text=None):
    empty = {'products': [], 'recommendation_evidence': [], 'recommendation_basis': 'product_description'}
    if not isinstance(query, str) or not query.strip():
        return {**empty, 'status': 'error', 'message': 'Cần nhu cầu hoặc sở thích để tra mô tả sản phẩm.'}
    try:
        from src.rag.rag_service import get_rag_service
        from src.function_calling.tools.knowledge_tools import safe_knowledge_results
        from src.function_calling.tools.product_tools import execute_filter_catalog
        found = get_rag_service().lookup(query, top_k=10, domain='product_description',
            entity_type='product', authority='knowledge', source='menu.san_pham.mo_ta')
        if found.get('status') not in {'ok', 'not_found'}:
            return {**empty, 'status': 'unavailable', 'message': 'Mình chưa tra được mô tả sản phẩm lúc này. Bạn thử lại nhé.'}
        docs = [normalized for doc in found.get('results') or []
                if (normalized := normalize_document(doc, 'retrieval'))
                and normalized['domain'] == 'product_description'
                and normalized['source'] == 'menu.san_pham.mo_ta']
        docs = safe_knowledge_results(docs)
        evidence = {}
        for doc in docs:
            evidence.setdefault(doc['entity_id'], doc)
        if evidence:
            menu = execute_filter_catalog(category=category, search_text=search_text, limit=10,
                                          product_ids=list(evidence))
            if menu.get('status') not in {'ok', 'not_found'}:
                return {**empty, 'status': 'unavailable', 'message': 'Mình chưa xác minh được Menu hiện tại. Bạn thử lại nhé.'}
            active = {str(row['product_id']): row for row in menu.get('products') or []}
            ids = [key for key in evidence if key in active][:max(1, min(10, int(top_k or 5)))]
            if ids:
                return {'status': 'ok', 'recommendation_basis': 'product_description',
                        'products': [active[key] for key in ids],
                        'recommendation_evidence': [evidence[key] for key in ids]}
        return {**empty, 'status': 'not_found', 'message':
            'Mình chưa tìm được món đang bán có mô tả đủ phù hợp với nhu cầu này. Bạn chia sẻ thêm hương vị hoặc loại món bạn thích nhé.'}
    except Exception as exc:
        logger.warning('[DescriptionRecommendation] error_type=%s', type(exc).__name__)
        return {**empty, 'status': 'unavailable', 'message': 'Mình chưa tra được gợi ý theo mô tả lúc này. Bạn thử lại nhé.'}
