"""Versioned engineering index of verified evidence, not calibrated confidence.

Each check group has a fixed budget: repeating claims/adding charts cannot
outweigh missing scope or change the denominator of another group. N/A checks
redistribute the internal 90-point budget. Independent reference work reserves
10 points, left unearned when unknown. No invented probability or arbitrary cap.
Weights are a disclosed product policy, not coefficients fitted to model accuracy.
"""
from services.analysis_quality_contract import AccuracyAssessment, VerificationCheck, ScoreMethod, ScorePart

WEIGHTS = {'request_coverage':20, 'semantic_consistency':15, 'result_integrity':15,
    'observed_values':10, 'derived_features':10, 'evidence_grounding':10,
    'visualization_appropriateness':5, 'limitation_disclosure':5}


def verification_score(checks, *, independent_accuracy=None):
    parsed=[VerificationCheck.model_validate(c) for c in checks]
    by_id={c.id:c for c in parsed}
    if len(by_id)!=len(parsed) or set(by_id)!=set(WEIGHTS):
        raise ValueError('Exactly one observation per configured check group is required')
    if any(c.passed>c.total or (c.total==0)!=(c.status=='not_applicable') for c in parsed):
        raise ValueError('Invalid observation counts')
    active=sum(w for id,w in WEIGHTS.items() if by_id[id].total)
    if not active:
        return dict(score=None,score_method=None,score_breakdown=[])
    parts=[];earned=0
    for id,weight in WEIGHTS.items():
        c=by_id[id]
        possible=90*weight/active if c.total else 0
        points=possible*c.passed/c.total if c.total else 0
        earned+=points
        parts.append(ScorePart(id=id,label=c.label,earned_points=round(points,4),possible_points=round(possible,4),status=c.status))
    # Only an authoritative server-side/reference-evaluation caller may supply
    # this. assess_report deliberately ignores client/saved accuracy claims.
    accuracy=AccuracyAssessment.model_validate(independent_accuracy or {})
    measured=accuracy.status=='measured' and accuracy.reference_count>0 and bool(accuracy.reference_source) and accuracy.matched_count is not None
    if measured and accuracy.matched_count>accuracy.reference_count:
        raise ValueError('Invalid independent reference counts')
    external=10*accuracy.matched_count/accuracy.reference_count if measured else 0
    parts.append(ScorePart(id='independent_reference',label='Đối chứng độc lập',earned_points=round(external,4),possible_points=10,status='passed' if measured and external==10 else 'partial' if measured else 'not_measured'))
    method=ScoreMethod(unmeasured_points=0 if measured else 10)
    return dict(score=round(earned+external,1),score_method=method.model_dump(mode='json'),
        score_breakdown=[p.model_dump(mode='json') for p in parts])
