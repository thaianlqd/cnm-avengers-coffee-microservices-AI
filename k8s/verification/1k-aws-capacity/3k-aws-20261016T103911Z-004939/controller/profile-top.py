from client import *
import argparse
p=argparse.ArgumentParser();p.add_argument('point');a=p.parse_args();point=a.point;assert point.replace('-','').isalnum()
assert (pathlib.Path(meta['evidence'])/point/'generator1/profile-status.json').exists()
status=json.loads((pathlib.Path(meta['evidence'])/point/'generator1/profile-status.json').read_text());assert status['passed']
script='''set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get install -y -qq golang-go > /run/avengers-capacity/golang-install.log 2>&1
go version > /opt/avengers-runs/POINT/profile-tool-version.txt
go tool pprof -top -nodecount=60 /opt/avengers-runs/POINT/k6-cpu.pprof > /opt/avengers-runs/POINT/profile-top.txt
go tool pprof -top -cum -nodecount=60 /opt/avengers-runs/POINT/k6-cpu.pprof > /opt/avengers-runs/POINT/profile-top-cum.txt
python3 - <<'PY'
import base64,io,pathlib,tarfile
p=pathlib.Path('/opt/avengers-runs/POINT');b=io.BytesIO()
with tarfile.open(fileobj=b,mode='w:gz') as t:
 for n in ('profile-top.txt','profile-top-cum.txt','profile-tool-version.txt'):t.add(p/n,arcname=n)
print(base64.b64encode(b.getvalue()).decode())
PY
'''.replace('POINT',point)
raw=submit('generator1',script,timeout=300);extract(raw,pathlib.Path(meta['evidence'])/point/'generator1',{'profile-top.txt','profile-top-cum.txt','profile-tool-version.txt'});print('bounded diagnostic CPU profile analyzed on AWS after load',flush=True)
