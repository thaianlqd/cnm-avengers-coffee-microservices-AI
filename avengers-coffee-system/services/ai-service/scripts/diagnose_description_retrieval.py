"""Offline corpus diagnostics; no model, business writes or credential output."""
import argparse
import json
from pathlib import Path
from src.rag.documents import normalize_document
from src.rag.retrievers import SparseRetriever


def diagnose(raw, query, concepts, threshold=.30):
    docs = [d for row in raw if (d := normalize_document(row, 'diagnostic'))
        and d['source'] == 'menu.san_pham.mo_ta' and d['domain'] == 'product_description']
    if not docs:
        return {'approved_count': 0, 'rejected_count': len(raw), 'candidates': []}
    backend = SparseRetriever(docs)
    old = backend.scores(query)
    scores, coverage = backend.concept_scores(concepts) if concepts else (old, None)
    ranked = sorted(range(len(docs)), key=lambda i: -scores[i])[:10]
    return {'query': query, 'concepts': concepts, 'threshold': threshold,
        'backend': backend.name, 'approved_count': len(docs), 'rejected_count': len(raw)-len(docs),
        'candidates': [{'product_id': docs[i]['entity_id'], 'description': docs[i]['content'],
            'old_score': round(float(old[i]), 4), 'score': round(float(scores[i]), 4),
            'concept_coverage': [round(float(v), 4) for v in coverage[:, i]] if coverage is not None else [],
            'accepted': bool(scores[i] >= threshold),
            'reason': 'approved_evidence_candidate_requires_current_menu_validation' if scores[i] >= threshold
                else 'below_threshold_or_missing_concept'} for i in ranked]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--corpus', required=True)
    parser.add_argument('--query', required=True)
    parser.add_argument('--concept', action='append', default=[])
    parser.add_argument('--output')
    args = parser.parse_args()
    result = diagnose(json.loads(Path(args.corpus).read_text()), args.query, args.concept)
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(text + '\n')
    else:
        print(text)
