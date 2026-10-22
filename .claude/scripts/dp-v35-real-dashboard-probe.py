"""Read-only business data probe through the governed preset compiler. Zero HTTP."""
import server  # Apply the same public deployment settings as the served API.
from datetime import date, datetime, timezone
import json
import time
from unittest.mock import patch
from common import AiTextToReportRequest
from services.agent_pipeline import AnalysisPipeline
from services.access_policy import active_principal, principal_for, load_policy

principal=principal_for({'subject':'admin','role':'ADMIN','expires_at':time.time()+300},load_policy())
token=active_principal.set(principal)
results=[]
try:
    with patch('requests.sessions.Session.request',side_effect=AssertionError('Preset provider forbidden')) as outbound:
        p=AnalysisPipeline(owner_id=principal.bound_owner)
        catalog=p.catalog()
        for template in catalog.registry['workspace']['dashboard_templates']:
            started=time.monotonic()
            conflicts=0
            for attempt in range(5):
                p=AnalysisPipeline(owner_id=principal.bound_owner)
                try:
                    request=AiTextToReportRequest(dashboard_id=template['id'],dashboard_version=template['version'],time={'mode':template['default_time']},reference_date=date(2026,10,19),analysis_depth='focused',analysis_scope={'mode':'all','filters':[]})
                    proposal=p.propose(request)
                    approved=proposal['proposal']
                    request.session_id=proposal['session_id'];request.proposal_revision=approved['revision']
                    request.intent_fingerprint=approved['semantic_intent_fingerprint'];request.plan_fingerprint=approved['resolved_plan_fingerprint'];request.catalog_fingerprint=approved['catalog_fingerprint']
                    report=p.generate(request)
                    assert report['status']=='success',(template['id'],report['status'])
                    assert len(report.get('charts',[]))>=3,template['id']
                    outbound.assert_not_called()
                    break
                except __import__('psycopg2').errors.LockNotAvailable:
                    conflicts+=1
                    if attempt==4: raise
                    time.sleep(1)
            results.append({'dashboard_id':template['id'],'status':report['status'],'charts':len(report['charts']),
                'verification':report.get('quality_assessment',{}).get('status'),'provider_http':0,'elapsed_seconds':round(time.monotonic()-started,3),
                'data_epoch':report.get('provenance',{}).get('data_epoch') or report.get('quality_context',{}).get('data_epoch'),
                'requirement_ids_preserved':{item['id'] for item in report['semantic_intent']['requirements']}=={item['id'] for item in template['requirements']}})
            results[-1]['relation_lock_conflicts']=conflicts
        print(json.dumps({'version':'3.5.0','status':'passed','observed_at':datetime.now(timezone.utc).isoformat(),'provider_http':0,'results':results},default=str))
finally:
    active_principal.reset(token)
