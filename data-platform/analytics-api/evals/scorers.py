"""Deterministic structured metrics. Never ask a model to judge itself."""
import json
import math
from statistics import mean
from services.analysis_quality_service import restore_artifacts, chart_checks, verify_saved_report
from services.domain_intelligence_service import DomainIntelligence
from services.analysis_query import validate_sql
from evals.fixture_warehouse import oracle, result_equal

FIELDS=('domain','lens','metric','grouping','filter','time','operation','ranking','component')


def prf(actual,expected):
    a,e=set(actual),set(expected);tp=len(a&e)
    precision=tp/len(a) if a else 1 if not e else 0
    recall=tp/len(e) if e else 1 if not a else 0
    return dict(precision=precision,recall=recall,f1=2*precision*recall/(precision+recall) if precision+recall else 0,tp=tp,predicted=len(a),expected=len(e))


def wilson(passed,total,z=1.959963984540054):
    if total<=0:return None
    p=passed/total;den=1+z*z/total;center=(p+z*z/(2*total))/den
    width=z*math.sqrt(p*(1-p)/total+z*z/(4*total*total))/den
    return [max(0,center-width),min(1,center+width)]


def filters(values):
    normalized=[]
    for f in values:
        value=f['value'];op=f.get('operator','eq')
        if op in ('eq','in'):
            value=sorted(value if isinstance(value,list) else [value],key=str);op='in'
        normalized.append((f['dimension'],op,json.dumps(value,ensure_ascii=False,sort_keys=True)))
    return sorted(normalized)


def tokens(operations):
    values={f:set() for f in FIELDS}
    for o in operations:
        anchor=(o['domain_id'],o.get('lens_id'))
        values['domain'].add(o['domain_id']);values['lens'].add(anchor)
        values['component'].add(anchor)
        for f in o['metrics']:values['metric'].add((*anchor,f))
        for f in o['group_by']:values['grouping'].add((*anchor,f))
        values['filter'].add((*anchor,json.dumps(filters(o.get('filters',[])),ensure_ascii=False)))
        period=o.get('period') or {};values['time'].add((*anchor,period.get('start'),period.get('end'),o.get('granularity') if o['operation']=='trend' else None))
        values['operation'].add((*anchor,o['operation']))
        rank=o.get('ranking')
        values['ranking'].add((*anchor,json.dumps(rank,sort_keys=True) if rank else None))
    return values


def assess_case(case, report, catalog):
    outcome=report.get('outcome') or ('SUCCESS' if report.get('status')=='success' else 'SYSTEM_ERROR')
    expected_success=case['expected_outcome'] in ('SUCCESS','PARTIAL_AVAILABLE')
    failures=[];outcome_pass=outcome==case['expected_outcome']
    if not outcome_pass:failures.append('unexpected_clarification' if outcome=='NEEDS_INPUT' else 'wrong_outcome')
    artifacts={};actual_ops=[];result_pass=None;chart_pass=None;grounded_pass=None;safety_pass=True
    if report.get('status')=='success':
        try:
            artifacts=restore_artifacts(report,catalog)
            intel=DomainIntelligence(catalog)
            for id,a in artifacts.items():
                validate_sql(a.sql,a.plan,a.grounded,catalog)
                if report.get('sql_by_query',{}).get(id,a.sql)!=a.sql:raise ValueError('Stored SQL differs from canonical')
                if a.query.role!='requested':continue
                actual_ops.append(dict(id=id,domain_id=intel.domain_for(a.query.subject)['domain_id'],lens_id=a.query.lens_id,
                    operation=a.query.operation,metrics=a.query.metrics,group_by=a.query.group_by,filters=[f.model_dump() for f in a.query.filters],
                    period=a.grounded.period,granularity=a.query.granularity,ranking=a.query.ranking.model_dump() if a.query.ranking else None))
            if not all(a.contract['valid'] for a in artifacts.values()):raise ValueError('Invalid result contract')
            expected_by_lens={(o['domain_id'],o['lens_id']):o for o in case['expected_operations']}
            comparisons=[]
            for o in actual_ops:
                e=expected_by_lens.get((o['domain_id'],o['lens_id']))
                comparisons.append(bool(e) and result_equal(report['result_sets'][o['id']]['rows'],oracle(e)))
            result_pass=bool(comparisons) and len(comparisons)==len(expected_by_lens) and all(comparisons)
            checks=chart_checks(report.get('charts',[]),artifacts)
            q=verify_saved_report(report,catalog);components={c['id']:c for c in q['components']}
            chart_pass=all(c['valid'] for c in checks) and components.get('visualization_appropriateness',{}).get('score')==10
            grounded_pass=components.get('evidence_grounding',{}).get('score')==15
            # Unsafe SQL, ungrounded facts, false whole-population visuals cannot average away.
            safety_pass=grounded_pass and all(c['valid'] for c in checks)
            if not result_pass:failures.append('result_mismatch')
            if not chart_pass:failures.append('chart_mismatch')
            if not grounded_pass:failures.append('unsupported_claim')
        except (ValueError,TypeError,KeyError,IndexError):
            safety_pass=False;failures.append('contract_invalid')
    expected_tokens=tokens(case['expected_operations']);actual_tokens=tokens(actual_ops)
    semantics={f:prf(actual_tokens[f],expected_tokens[f]) for f in FIELDS}
    semantic_pass=all(v['f1']==1 for v in semantics.values()) if expected_success else outcome_pass
    reasons={'domain':'wrong_domain','lens':'missing_lens','metric':'wrong_metric','grouping':'wrong_grouping','filter':'wrong_filter','time':'wrong_time','operation':'wrong_operation','ranking':'wrong_ranking','component':'missing_requested_component'}
    if expected_success:
        failures += [reasons[f] for f,v in semantics.items() if v['f1']<1]
    d=report.get('diagnostics',{});proposal=d.get('proposal_diagnostics',{})
    calls=proposal.get('provider_call_count',d.get('provider_call_count',0));repairs=proposal.get('contract_repair_count',d.get('repair_round_count',0))
    return dict(id=case['id'],split=case['split'],difficulty=case['difficulty'],domains=sorted({o['domain_id'] for o in case['expected_operations']}),
        expected_outcome=case['expected_outcome'],outcome=outcome,outcome_pass=outcome_pass,semantic=semantics,semantic_pass=semantic_pass,
        plan_valid=bool(artifacts) if expected_success else outcome_pass,first_attempt_valid=bool(artifacts) and not repairs if expected_success else outcome_pass,
        result_exact=result_pass,chart_valid=chart_pass,grounded=grounded_pass,safety_pass=safety_pass,
        passed=outcome_pass and semantic_pass and safety_pass and (not expected_success or bool(result_pass and chart_pass and grounded_pass)),
        failures=sorted(set(failures)),provider_calls=calls,repair_rounds=repairs,
        input_tokens=proposal.get('input_tokens',d.get('input_tokens')),output_tokens=proposal.get('output_tokens',d.get('output_tokens')),
        latency_ms=d.get('timings_ms',{}).get('total'),context_chars=proposal.get('total_context_chars',d.get('total_context_chars')),quality_compute_ms=d.get('quality_score_compute_ms'))


def rate(rows,field):
    values=[r[field] for r in rows if r.get(field) is not None]
    return dict(passed=sum(values),total=len(values),rate=sum(values)/len(values) if values else None,wilson_95=wilson(sum(values),len(values)))


def percentile(values,p):
    values=sorted(v for v in values if v is not None)
    return values[min(len(values)-1,math.ceil(p*len(values))-1)] if values else None


def aggregate(rows):
    positive=[r for r in rows if r['expected_outcome'] in ('SUCCESS','PARTIAL_AVAILABLE')]
    semantic={}
    for f in FIELDS:
        entries=[r['semantic'][f] for r in positive];tp=sum(e['tp'] for e in entries);a=sum(e['predicted'] for e in entries);e=sum(e['expected'] for e in entries)
        precision=tp/a if a else 1 if not e else 0;recall=tp/e if e else 1 if not a else 0
        semantic[f]=dict(precision=precision,recall=recall,f1=2*precision*recall/(precision+recall) if precision+recall else 0)
    eligible=[r for r in rows if r['repair_rounds']]
    return dict(cases=len(rows),pass_rate=rate(rows,'passed'),semantic=semantic,semantic_pass=rate(rows,'semantic_pass'),plan_valid=rate(rows,'plan_valid'),
        first_attempt_valid=rate(rows,'first_attempt_valid'),bounded_repair_rate=len(eligible)/len(rows) if rows else None,repair_success=rate(eligible,'passed'),
        result_exact=rate(rows,'result_exact'),dashboard_correct=rate(rows,'chart_valid'),grounded=rate(rows,'grounded'),
        clarification_correct=rate([r for r in rows if r['expected_outcome']=='NEEDS_INPUT'],'outcome_pass'),
        refusal_correct=rate([r for r in rows if r['expected_outcome'] in ('UNSUPPORTED','INSUFFICIENT_DATA')],'outcome_pass'),
        safety_violations=sum(not r['safety_pass'] for r in rows),
        cost=dict(average_provider_calls=mean(r['provider_calls'] for r in rows) if rows else None,
            observed_input_tokens=sum(r['input_tokens'] for r in rows if r['input_tokens'] is not None) if any(r['input_tokens'] is not None for r in rows) else None,
            observed_output_tokens=sum(r['output_tokens'] for r in rows if r['output_tokens'] is not None) if any(r['output_tokens'] is not None for r in rows) else None,
            p95_latency_ms=percentile([r['latency_ms'] for r in rows],.95),p95_context_chars=percentile([r['context_chars'] for r in rows],.95),p95_quality_compute_ms=percentile([r['quality_compute_ms'] for r in rows],.95)))


def stability(records,required_runs=3):
    """Only independently recorded run IDs count; duplicate IDs are rejected."""
    by_case={}
    for r in records:
        if not r.get('run_id'):raise ValueError('Stability needs run IDs')
        runs=by_case.setdefault(r['id'],{})
        if r['run_id'] in runs:raise ValueError('Duplicate stability run')
        runs[r['run_id']]=r
    complete={id:runs for id,runs in by_case.items() if len(runs)>=required_runs}
    return dict(required_runs=required_runs,complete_cases=len(complete),incomplete_cases=sorted(set(by_case)-set(complete)),
        all_runs_pass_rate=mean(all(r['passed'] for r in runs.values()) for runs in complete.values()) if complete else None,
        stable_outcome_rate=mean(len({r['outcome'] for r in runs.values()})==1 for runs in complete.values()) if complete else None)
