"""Offline deterministic evaluation; fixture products never enter production KB.

Run: python -m src.rag.evaluation
"""
import json
from pathlib import Path
from unittest.mock import patch
from src.rag import data_ingestion, rag_service
from src.rag.authority import knowledge_route
from src.function_calling.tools.knowledge_tools import execute_search_knowledge_base

FIXTURES = Path(__file__).resolve().parents[2] / 'tests' / 'fixtures'


def evaluate(threshold=rag_service.DEFAULT_MIN_SCORE, split=None):
    cases = json.loads((FIXTURES/'rag_v2_evaluation.json').read_text())
    products = json.loads((FIXTURES/'rag_v2_products.json').read_text())
    with patch.object(data_ingestion, 'get_db_engine', side_effect=RuntimeError('offline evaluation')):
        docs = data_ingestion.load_all_rag_data() + products
    service = rag_service.RAGService(min_score=threshold)
    with patch.object(rag_service, 'load_all_rag_data', return_value=docs):
        service.load()
    catalog = [{'product_id': d['entity_id'], 'product_name': d['tags'][0]} for d in products]
    counts = dict(total=0, route_correct=0, retrieval_cases=0, top1=0, top3=0,
                  negative_cases=0, false_positives=0, not_found_correct=0)
    details = []
    with patch.object(rag_service, 'get_rag_service', return_value=service), patch(
            'src.agents.order_flow_graph._load_active_product_targets', return_value=catalog):
        for case in cases:
            if split and case['split'] != split:
                continue
            route = knowledge_route(case['query'])
            result = execute_search_knowledge_base(case['query'])
            ids = [d.get('parent_id', d['id']) for d in result.get('results', [])]
            counts['total'] += 1
            counts['route_correct'] += route['owner'] == case['expected_owner']
            if case['expected_not_found']:
                counts['negative_cases'] += 1
                counts['false_positives'] += bool(ids)
                counts['not_found_correct'] += not ids and result['status'] in {'not_found','authority_required'}
            else:
                counts['retrieval_cases'] += 1
                counts['top1'] += bool(ids and ids[0] in case['allowed_top_k'])
                counts['top3'] += bool(set(ids[:3]) & set(case['allowed_top_k']))
            details.append(dict(id=case['id'], owner=route['owner'], status=result['status'], ids=ids))
    metrics = {**counts, 'threshold': threshold,
        'routing_accuracy': counts['route_correct']/counts['total'],
        'top1_hit': counts['top1']/counts['retrieval_cases'],
        'top3_hit': counts['top3']/counts['retrieval_cases'],
        'false_positive_rate': counts['false_positives']/counts['negative_cases'],
        'not_found_accuracy': counts['not_found_correct']/counts['negative_cases']}
    return {'metrics':metrics, 'details':details, 'index':service.index_info}


if __name__ == '__main__':
    for threshold in (.05, .12, .18, .24, .30, .36, .42, .50, .60):
        print(json.dumps({'split':'calibration', **evaluate(threshold, 'calibration')['metrics']}))
    print(json.dumps({'split':'evaluation', **evaluate(split='evaluation')['metrics']}))
    print(json.dumps(evaluate(), ensure_ascii=False))
