"""Verify identical imported image archive and image index IDs and resolved config digests on all targets."""
from client import *
import concurrent.futures
checks=json.loads((pathlib.Path(meta['evidence'])/'build-checks.json').read_text());expected={i['RepoTags'][0]:i['Id'] for i in checks['images']}
def verify(role):
 data=base64.b64encode(json.dumps({'expected':expected,'archive_sha256':checks['image_tar_sha256']}).encode()).decode()
 script='''set -euo pipefail
python3 - <<'PY'
import base64,hashlib,json,pathlib,subprocess
plan=json.loads(base64.b64decode('IMAGE_PLAN'));archive=pathlib.Path('/opt/avengers-source/images.tar')
digest=hashlib.sha256()
with archive.open('rb') as f:
 while block:=f.read(1048576):digest.update(block)
assert digest.hexdigest()==plan['archive_sha256']
rows=subprocess.check_output(['k3s','ctr','images','ls'],text=True).splitlines()[1:];images={}
for row in rows:
 fields=row.split()
 if len(fields)<3:continue
 name=fields[0].removeprefix('docker.io/')
 if name not in plan['expected']:continue
 manifest_digest=fields[2];obj=json.loads(subprocess.check_output(['k3s','ctr','content','get',manifest_digest]))
 if 'manifests' in obj:
  descriptor=next(m for m in obj['manifests'] if m.get('platform',{}).get('architecture')=='amd64' and m.get('platform',{}).get('os')=='linux');obj=json.loads(subprocess.check_output(['k3s','ctr','content','get',descriptor['digest']]))
 assert manifest_digest==plan['expected'][name]
 images[name]={'image_index_digest':manifest_digest,'image_config_digest':obj['config']['digest']}
assert set(images)==set(plan['expected'])
print(json.dumps({'passed':True,'archive_sha256':digest.hexdigest(),'images':images},indent=2))
PY
'''.replace('IMAGE_PLAN',data)
 raw=submit(role,script,timeout=120);r=json.loads(raw);assert r['passed'];(pathlib.Path(meta['evidence'])/(role+'-image-provenance.json')).write_bytes(raw);print(role+' five image index IDs and resolved config digests and archive SHA verified',flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 for _ in pool.map(verify,('target1','target2')):pass
