"""Offline authored meanings -> production resolver/compiler, without provider or DB.

This adds downstream coverage to the original120 input contracts. It does not
measure whether an LLM produces these reference meanings from their questions.
"""
from datetime import date
import hashlib
import json
from pathlib import Path

REFERENCES=Path(__file__).with_name('semantic_reference_v34.json')
REFERENCE_SHA256='8b6f9164fde3a3dad0b43c27c6da75c2d8e137b561abefd975afbc55605aaefa'


def run(catalog):
    from services.analysis_intent import AnalysisIntentEnvelope
    from services.analytical_resolver import AnalyticalResolver
    from services.analytical_query_service import AnalyticalQueries
    from services.semantic_tools import SemanticTools
    from services.analysis_catalog import AnalysisError
    from services.preflight_service import run as preflight
    from common import AiTextToReportRequest
    from pydantic import ValidationError
    source=json.loads(Path(__file__).with_name('semantic_cases_v34.json').read_text())
    if hashlib.sha256(REFERENCES.read_bytes()).hexdigest()!=REFERENCE_SHA256:raise ValueError('Reference meanings changed after freeze')
    references=json.loads(REFERENCES.read_text())
    if [r['id'] for r in references['cases']] != [r['id'] for r in source['cases']]:
        raise ValueError('Every frozen case must retain its reference row')
    reference=date.fromisoformat(references['reference_date'])
    rows=[]
    def forbidden(*args,**kwargs):raise AssertionError('Reference evaluation forbids I/O')
    for case,entry in zip(source['cases'],references['cases']):
        failures=[];compiled=[]
        try:
            if entry['intent'] is None:
                if entry['terminal_reason']=='request_boundary':
                    try:AiTextToReportRequest.model_validate(case['request'])
                    except ValidationError:pass
                    else:failures.append('request_accepted')
                else:
                    before=preflight(case['q'],catalog=catalog,reference=reference)
                    if before['capability']['decision']!=entry['expected_decision']:failures.append('terminal_decision')
                    if before['provider_calls'] or before['warehouse_queries']:failures.append('terminal_io')
            else:
                meaning=AnalysisIntentEnvelope.model_validate(entry['intent'])
                resolved=AnalyticalResolver(catalog,reference).resolve(meaning)
                queries=AnalyticalQueries(catalog,SemanticTools(catalog,forbidden),reference,forbidden,{})
                by_id={}
                for operation in resolved['operations']:
                    artifact=queries.prepare(operation);by_id[operation['id']]=artifact
                    compiled.append({'query_id':operation['id'],'metrics':artifact.query.metrics,
                        'dimensions':artifact.query.group_by,'period':artifact.grounded.period,
                        'sql_sha256':hashlib.sha256(artifact.sql.encode()).hexdigest()})
                for expected in meaning.requirements:
                    coverage=next(c for c in resolved['coverage'] if c['requirement_id']==expected.id)
                    if coverage['state']!='RESOLVED':failures.append(expected.id+':not_resolved')
                    artifacts=[by_id[o] for o in coverage['operation_ids']]
                    if not set(expected.metric_ids)<=set(m for a in artifacts for m in a.query.metrics):
                        failures.append(expected.id+':missing_metric')
                    if expected.dimension_ids and not any(set(expected.dimension_ids)<=set(a.query.group_by) for a in artifacts):
                        failures.append(expected.id+':missing_grouping')
                    if expected.ranking and not any(a.query.ranking and a.query.ranking.top_n==expected.ranking.limit
                        and a.query.ranking.direction=={'top':'DESC','bottom':'ASC'}[expected.ranking.direction] and
                        set(a.query.ranking.per_group)==set(expected.ranking.per_group) for a in artifacts):
                        failures.append(expected.id+':ranking')
                    period=entry['expected_periods'][expected.id]
                    if any(any(a.grounded.period.get(key)!=value for key,value in period.items()) for a in artifacts):
                        failures.append(expected.id+':period')
                    for selected in expected.filters:
                        members=set(selected.value if isinstance(selected.value,list) else [selected.value])
                        if not all(any(f.dimension==selected.dimension and
                            set(f.value if isinstance(f.value,list) else [f.value])==members for f in a.query.filters) for a in artifacts):
                            failures.append(expected.id+':scope')
                if len(resolved['coverage'])!=len(meaning.requirements):failures.append('requirement_count')
        except (AnalysisError,ValidationError,ValueError,KeyError,AssertionError) as error:
            failures.append(getattr(error,'category',type(error).__name__))
            if hasattr(error,'issues'):failures.extend(i['code'] for i in error.issues)
        rows.append({'id':case['id'],'ok':not failures,'failures':failures,'compiled':compiled,
                     'stage':'resolver_compiler' if entry['intent'] else entry['terminal_reason']})
    return {'mode':'offline_authored_reference','case_count':len(rows),'compiled_intents':sum(r['stage']=='resolver_compiler' for r in rows),
        'passed':sum(r['ok'] for r in rows),'failed':sum(not r['ok'] for r in rows),
        'reference_sha256':hashlib.sha256(REFERENCES.read_bytes()).hexdigest(),'rows':rows,
        'claim':'Authored expected meanings compiled through production resolver/validators; not LLM understanding accuracy'}


if __name__=='__main__':
    import argparse
    from unittest.mock import patch
    from services.analysis_catalog import AnalysisCatalog
    from tests.analysis_fixtures import physical_metadata
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--out',required=True);args=parser.parse_args()
    with patch('psycopg2.connect',side_effect=AssertionError('Offline forbids DB')),patch('requests.sessions.Session.request',side_effect=AssertionError('Offline forbids HTTP')):
        result=run(AnalysisCatalog(physical_metadata()))
    Path(args.out).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k!='rows'},ensure_ascii=False))
    for row in result['rows']:
        if not row['ok']:print(json.dumps(row,ensure_ascii=False))
    raise SystemExit(bool(result['failed']))
