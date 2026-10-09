"""Accuracy against caller-owned independent references, never model self-rating.

Used by evaluation/audit tools only. Runtime report verification cannot accept a
client-provided reference or promote its own query results into ground truth.
Each named assertion is exact-match across its whole structure, with explicit
numeric tolerances. Row order, missing/extra fields and categorical values count.
This measures the audited assertions, not future answers or a probability.
"""
from decimal import Decimal
from math import isclose, isfinite
from services.analysis_quality_contract import AccuracyAssessment


def matches_reference(observed, expected, *, abs_tol=0.01, rel_tol=1e-9):
    if isinstance(observed,bool) or isinstance(expected,bool):
        return type(observed) is type(expected) and observed == expected
    if isinstance(observed,(int,float,Decimal)) and isinstance(expected,(int,float,Decimal)):
        return isfinite(observed) and isfinite(expected) and isclose(observed,expected,abs_tol=abs_tol,rel_tol=rel_tol)
    if isinstance(expected,dict):
        return isinstance(observed,dict) and observed.keys()==expected.keys() and all(
            matches_reference(observed[k],v,abs_tol=abs_tol,rel_tol=rel_tol) for k,v in expected.items())
    if isinstance(expected,list):
        return isinstance(observed,list) and len(observed)==len(expected) and all(
            matches_reference(a,b,abs_tol=abs_tol,rel_tol=rel_tol) for a,b in zip(observed,expected))
    return type(observed) is type(expected) and observed == expected


def measure_reference_accuracy(assertions, *, reference_source, abs_tol=0.01, rel_tol=1e-9):
    """matched assertions / reference assertions, with failures kept reviewable."""
    if not reference_source or abs_tol < 0 or rel_tol < 0 or not isfinite(abs_tol) or not isfinite(rel_tol):
        raise ValueError('Reference source and finite non-negative tolerances required')
    ids = [a['id'] for a in assertions]
    if len(ids)!=len(set(ids)):
        raise ValueError('Reference assertions must have unique IDs')
    verdicts = [dict(id=a['id'],matched=matches_reference(a['observed'],a['expected'],abs_tol=abs_tol,rel_tol=rel_tol)) for a in assertions]
    total = len(verdicts)
    matched = sum(v['matched'] for v in verdicts)
    assessment = AccuracyAssessment(status='measured',matched_count=matched,reference_count=total,
        accuracy_pct=round(100*matched/total,2),reference_source=reference_source,
        reason='Tỷ lệ assertion khớp đối chứng độc lập trong lần kiểm tra này; không phải xác suất AI trả lời đúng.') if total else AccuracyAssessment()
    return dict(assessment=assessment.model_dump(mode='json'),assertions=verdicts,
        numeric_tolerance=dict(absolute=abs_tol,relative=rel_tol))
