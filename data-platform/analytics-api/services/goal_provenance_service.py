"""Server-authored input-to-goal receipts, replayable without provider or SQL.

Literal evidence and interpretation are deliberately distinct. An accepted
interpretation of a broad clause is not described as an explicit metric mention.
The meaning, scope, and compatibility guards still authorize the executable plan.
"""
import re
from services.analytical_resolver import digest
from services.request_anchors import request_anchors, metric_equivalents

VERSION = '1.0.0'


def goal_provenance(report, catalog):
    provenance=report.get('provenance') or {}
    ui=(report.get('quality_context') or {}).get('ui_constraints') or {}
    coverage={c['requirement_id']:c for c in report.get('resolved_requirement_coverage',[])}
    queries={q['id']:q for q in report.get('analytical_queries',[])}
    requirements=(report.get('semantic_intent') or {}).get('requirements',[])
    texts=[('input',provenance.get('user_request',''))]
    texts += [(f'history.{i}.feedback',h['feedback']) for i,h in enumerate(provenance.get('semantic_history',[])) if h.get('feedback')]
    clauses=[]
    for source,text in texts:
        for n,m in enumerate(re.finditer(r'[^;\n]+',text)):
            anchors=request_anchors(m.group(),catalog,{})
            clauses.append(dict(id=f'{source}.c{n+1}',source=source,start=m.start(),end=m.end(),
                text_digest=digest(m.group()),metrics=anchors['metrics'],dimensions=anchors['dimensions']))
    equivalents=metric_equivalents(catalog)
    selected=(ui.get('guided_intent') or {}).get('requirements',[])
    result=[]
    for req in requirements:
        fields={k:req.get(k) for k in ('metric_ids','dimension_ids','filters','time','comparison_time',
            'analysis_kind','ranking','granularity','forecast','derived_features','feature_metrics')}
        origins=[]
        if selected:
            # These are server-built selections, never fields from an LLM tool.
            # Retain initial selection refs after an explicit accepted refinement.
            for i,s in enumerate(selected):
                if s.get('id')==req['id'] or set(s.get('metric_ids',[])) & set(req.get('metric_ids',[])):
                    origins.append(dict(kind='structured_selection',path=f'guided_intent.requirements.{i}',
                        selection_digest=digest(s)))
        for clause in clauses:
            matched_metrics=sorted({m for m in req.get('metric_ids',[]) for a in clause['metrics']
                if set(a['candidate_ids']) & equivalents.get(m,{m})})
            matched_axes=sorted(set(req.get('dimension_ids',[])) & {d for a in clause['dimensions'] for d in a['candidate_ids']})
            if matched_metrics or matched_axes:
                origins.append(dict(kind='input_clause',clause_id=clause['id'],source=clause['source'],
                    start=clause['start'],end=clause['end'],text_digest=clause['text_digest'],
                    explicit_metrics=matched_metrics,explicit_axes=matched_axes))
        parent=req.get('supporting_for')
        operations=coverage.get(req['id'],{}).get('operation_ids',[])
        dependencies=sorted({queries[q]['cohort_scope_query_id'] for q in operations if q in queries
            and queries[q].get('cohort_scope_query_id')})
        if parent:
            origins.append(dict(kind='governed_supporting_view',parent_requirement_id=parent,
                policy_version=provenance.get('resolver_version')))
        if not origins:
            # Broad prompts and elliptical follow-ups need semantic interpretation.
            # Preserve the actual source span instead of pretending every term was
            # explicitly present. Independent anchor replay validates its meaning.
            origins=[dict(kind='interpreted_clause',clause_id=c['id'],source=c['source'],start=c['start'],end=c['end'],
                text_digest=c['text_digest']) for c in clauses]
        result.append(dict(requirement_id=req['id'],availability=req.get('availability','requested'),
            semantics=fields,semantics_digest=digest(fields),input_refs=origins,
            operation_ids=operations,cohort_query_refs=dependencies,parent_requirement_id=parent,
            resolution_state=coverage.get(req['id'],{}).get('state')))
    return dict(version=VERSION,goals=result)
