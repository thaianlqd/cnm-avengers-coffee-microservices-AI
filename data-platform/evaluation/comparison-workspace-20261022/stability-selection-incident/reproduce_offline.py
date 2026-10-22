"""Read-only metadata replay of guards, never a provider call or business SQL."""
import json
from datetime import date
from services.preflight_service import preflight_catalog
from services.request_anchors import request_anchors,verify_anchors
from services.semantic_preflight_contract import metric_locks
from services.analysis_intent import IntentRequirement
c=preflight_catalog();question='so sánh doanh thu bán hàng của 2 tỉnh có doanh thu ổn định nhất';a=request_anchors(question,c,{})
r=IntentRequirement(id='r1',metric_ids=['revenue'],dimension_ids=['city'],analysis_kind='aggregate',time={'kind':'relative','mode':'all_time'})
valid=verify_anchors(a,[r],date(2026,10,22),c);empty=verify_anchors(a,[],date(2026,10,22),c)
result=dict(question=question,request_id='req_d702b6b70aec42ab81309f7ca0148a8e',mode='OFFLINE_METADATA_ONLY',metrics=a['metrics'],metric_locks=metric_locks(a,c.registry),recognized_features=a.get('features'),recognized_dimensions=a.get('dimensions'),revenue_only_control_issues=valid,empty_requirement_control_issues=empty,
 declared_metric_ids_matching_stability=[k for k,v in c.registry['metrics'].items() if any(s in k.lower() for s in ['stabil','volatil','coefficient','stddev'])],declared_feature_ids=list(c.registry.get('derived_features',{})),business_queries=0,provider_calls=0,
 conclusion='Canonical revenue is sufficient; the broad missing-metric candidate list is not evidence six metrics are required. No declared stability ranking metric/operator was found. Actual provider draft was not captured here; no claim is made about its exact tokens.')
assert not valid and all(l['metric_id']=='revenue' for l in result['metric_locks'])
assert any(x['code']=='explicit_metrics_missing' and len(x['candidate_ids'])==6 for x in empty)
print(json.dumps(result,ensure_ascii=False,indent=2))
