"""Read-only HTTP/build proof; inspect only non-secret Docker state fields."""
import json,re,hashlib,subprocess,urllib.request
from pathlib import Path
E=Path(__file__).resolve().parent
BASE='http://127.0.0.1:8501'
def read(url):
    with urllib.request.urlopen(url,timeout=30) as response:return response.read()
html=read(BASE).decode();assets=[]
for asset in sorted(set(re.findall(r'(?:src|href)="(/assets/[^\"]+\.(?:js|css))"',html))):
    content=read(BASE+asset)
    image_content=subprocess.run(['docker','exec','avengers_analytics_web','cat','/usr/share/nginx/html'+asset],capture_output=True,check=True).stdout
    assets.append(dict(url=asset,sha256=hashlib.sha256(content).hexdigest(),bytes=len(content),
        matches_web_container=content==image_content,markers={marker:marker.encode() in content for marker in
        ['valid_orders','Nhận định từ biểu đồ','Toàn phạm vi','Thời gian chưa theo thứ tự hoặc không hợp lệ; hiển thị bảng dữ liệu quan sát.']}))
containers={}
for name in ['avengers_analytics_api','avengers_analytics_web','avengers_reliability_policy33_final_codex']:
    result=subprocess.run(['docker','inspect',name,'--format',
        '{"image":"{{.Image}}","started_at":"{{.State.StartedAt}}","status":"{{.State.Status}}","oom_killed":{{.State.OOMKilled}},"health":"{{if .State.Health}}{{.State.Health.Status}}{{end}}"}'],capture_output=True,text=True,check=True)
    containers[name]=json.loads(result.stdout)
versions=json.loads(subprocess.run(['docker','exec','avengers_analytics_api','python','-c',
    "import json;from services.analytical_resolver import PLAN_POLICY_VERSION;from services.input_integrity_service import policy;from services.analysis_quality_contract import VERSION;print(json.dumps(dict(plan=PLAN_POLICY_VERSION,input=policy()['version'],verifier=VERSION)))"],capture_output=True,text=True,check=True).stdout)
result=dict(url=BASE,assets=assets,containers=containers,versions=versions,
    passed=bool(assets) and all(a['matches_web_container'] for a in assets) and
        all(not c['oom_killed'] and c['status']=='running' for c in containers.values()) and
        containers['avengers_analytics_api']['image']==containers['avengers_reliability_policy33_final_codex']['image'] and
        versions==dict(plan='2026-10-22.cohort-scope.33',input='1.2.5',verifier='2.8.8'))
(E/'codex-served-bundle-policy33-final.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps(result,ensure_ascii=False));raise SystemExit(not result['passed'])
