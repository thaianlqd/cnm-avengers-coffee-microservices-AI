"""Reproducible offline input-gate receipts; no provider or warehouse access.

Run with AI_OFFLINE=1. JSON goes to stdout for the existing evaluation folder.
These scores measure input constraints, not LLM or numerical accuracy.
"""
import hashlib
import json
import os
from pathlib import Path
from datetime import date,datetime,timezone
from unittest.mock import patch

from services.analysis_catalog import AnalysisCatalog,CATALOG_PATH
from services.preflight_service import overlay_physical,run
from services.input_integrity_service import validate,policy,policy_fingerprint


def main():
    if os.getenv('AI_OFFLINE')!='1':raise SystemExit('AI_OFFLINE=1 required')
    root=Path(__file__).resolve().parents[1]
    fixtures=root/'tests/fixtures/input_integrity'
    overlay=json.loads(CATALOG_PATH.read_text())
    catalog=AnalysisCatalog(overlay_physical(overlay),overlay)
    sections={}
    with patch('requests.sessions.Session.request',side_effect=AssertionError('HTTP forbidden')) as http, \
         patch('psycopg2.connect',side_effect=AssertionError('Warehouse forbidden')) as database:
        for filename in ['baseline_cases.json','corpus.json','holdout.json']:
            source=json.loads((fixtures/filename).read_text())
            cases=source if isinstance(source,list) else source['cases']
            rows=[]
            for c in cases:
                if filename=='baseline_cases.json':
                    result=run(c['question'],catalog=catalog,coverage={},reference=date(2026,10,21))
                    validation=result.get('input_validation') or {}
                    codes=[f['code'] for f in result['findings']]
                else:
                    result=validation=validate(c['question'],catalog,context=c.get('context'))
                    codes=[f['code'] for f in result['findings']]
                rows.append(dict(id=c['id'],expected=c['can_submit'],actual=result['can_submit'],
                    passed=result['can_submit']==c['can_submit'] and (not c.get('reason') or c['reason'] in codes),
                    reason_codes=codes,slots=[{k:s.get(k) for k in ('kind','state','reason','dimension','clause_id')} for s in validation.get('slots',[])],
                    provider_calls=validation.get('provider_calls',0),analytical_queries=validation.get('analytical_queries',0),
                    lookup_queries=validation.get('lookup_queries',0)))
            sections[filename]={'total':len(rows),'passed':sum(r['passed'] for r in rows),
                'positive_controls':sum(c['can_submit'] for c in cases),
                'sha256':hashlib.sha256((fixtures/filename).read_bytes()).hexdigest(),'cases':rows}
        business=json.loads((root/'evals/business_coverage_cases.json').read_text())['cases']
        groups={}
        for c in business:
            r=validate(c['question'],catalog)
            groups.setdefault(c['group'],[]).append(dict(id=c['id'],input_gate_ready=r['can_submit'],
                reasons=[f['code'] for f in r['findings']]))
        inventory=[dict(id=id,mode=(d.get('value_grounding') or {}).get('mode'),scope_governed=d.get('scope_governed',False),
            status='typed_entity' if (d.get('value_grounding') or {}).get('mode') in {'enum','lookup'} and id not in policy()['non_entity_dimensions'] else 'existing_typed_contract')
            for id,d in catalog.registry['dimensions'].items()]
        physical={'provider_http_calls':http.call_count,'warehouse_connections':database.call_count}
    sources=['services/input_integrity_service.py','metadata/input_integrity_policy.json','services/preflight_service.py',
        'services/agent_pipeline.py','services/analysis_job_service.py','routers/ai.py','services/analysis_pipeline.py',
        'services/semantic_preflight_contract.py','services/metadata_service.py','common.py','route_policy.py',
        'services/analytical_resolver.py','services/one_shot_context.py','services/hybrid_analyst_planner.py',
        'services/analysis_contract.py','services/analytical_query_service.py','services/request_anchors.py']
    receipt=dict(checked_at=datetime.now(timezone.utc).isoformat(),scope='Offline input integrity only. READY does not certify capability, source health, generated intent or numerical correctness.',
        policy=policy()['version'],policy_fingerprint=policy_fingerprint(),catalog_fingerprint=catalog.fingerprint,
        source_sha256={name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in sources},
        physical_boundary=physical,sections=sections,business_groups=groups,dimension_inventory=inventory,
        complete=all(s['passed']==s['total'] for s in sections.values()))
    print(json.dumps(receipt,ensure_ascii=False,indent=2))


if __name__=='__main__':main()
