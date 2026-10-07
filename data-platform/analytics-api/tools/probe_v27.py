import sys,json,os
sys.path.insert(0,'/app')
from tests.test_context_capacity_v26 import *
from services.analyst_decision import decision_tool
p=AnalysisPipeline(metadata_loader=physical_metadata,provider=ScriptedProvider([call('submit_analyst_decision',ContextCapacityTests().decision())]),executor=Mock(),value_lookup=Mock(return_value=[]))
req=AiTextToReportRequest(question=QUESTION,analysis_context=CONTEXT,analysis_expectation=EXPECTATION,time={'mode':'previous_month'},reference_date=date(2026,10,7))
r=p.propose(req);d=r['diagnostics'];print({k:v for k,v in d.items() if 'chars' in k or 'pack_ids' in k});payload=json.loads(p.provider.requests[0]['messages'][0]['content']);
for k,v in payload.items():print(k,len(json.dumps(v,ensure_ascii=False)))
for k,v in payload['domains'].items():print('domains.'+k,len(json.dumps(v,ensure_ascii=False)))
for k,v in decision_tool(natural=True,refinement=False)['parameters']['properties'].items():print('schema.'+k,len(json.dumps(v,ensure_ascii=False)))
