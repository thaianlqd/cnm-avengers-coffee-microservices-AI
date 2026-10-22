import json,os,urllib.request,http.cookiejar,subprocess
from pathlib import Path
D=Path(__file__).resolve().parent;BASE='http://127.0.0.1:8501';SID='50ed1fe9-35a9-4cf0-964d-ee5b9578e363'
op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def call(path,data=None):
 req=urllib.request.Request(BASE+path,data=json.dumps(data).encode() if data is not None else None,headers={'Origin':BASE,'Content-Type':'application/json'})
 with op.open(req,timeout=60) as response:return json.load(response)
call('/api/auth/login',dict(tai_khoan=os.environ['DP_AUDIT_USER'],mat_khau=os.environ['DP_AUDIT_PASSWORD']))
# Public API enforces current account ownership and exact revision before export.
g=call('/api/ai/sessions/'+SID+'/geography?revision=1');assert g['revision']==1 and g['session_id']==SID
(D/'geography.json').write_text(json.dumps(g,ensure_ascii=False,indent=2))
code="import json;from services.session_service import get_session;s=get_session('"+SID+"');assert s.revision==1;print(json.dumps(s.report_response,ensure_ascii=False,default=str))"
r=json.loads(subprocess.check_output(['docker','exec','avengers_analytics_api','python','-c',code],text=True))
assert r['session_id']==SID and r['revision']==1 and len(r['charts'])==8
(D/'report-summary.json').write_text(json.dumps(r,ensure_ascii=False,indent=2))
full={};fetched=0
for qid,result in r['result_sets'].items():
 rows=[];offset=0
 while True:
  page=call('/api/ai/sessions/'+SID+'/results/'+qid+'?revision=1&limit=200&offset='+str(offset));fetched+=1
  assert page['artifact_id']==result['artifact_ref']['artifact_id'] and page['revision']==1
  rows.extend(page['rows'])
  if page.get('next_offset') is None:break
  offset=page['next_offset']
 assert len(rows)==result['total_rows'];full[qid]=rows
(D/'immutable-result-rows.json').write_text(json.dumps(full,ensure_ascii=False,indent=2))
print(json.dumps(dict(session_id=SID,revision=1,charts=[dict(id=c['id'],title=c['title'],query_id=c['query_id']) for c in r['charts']],queries=r['analytical_queries'],epoch=r['provenance']['data_epoch'],geography_summary=g['summary'],pages=fetched),ensure_ascii=False))
