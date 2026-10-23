#!/usr/bin/env python3
"""One bounded local CPU profile, only inside a diagnostic (nonqualification) point."""
import argparse,datetime,json,re,time,urllib.request
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--at',type=float,required=True);p.add_argument('--point',required=True);a=p.parse_args()
if not re.fullmatch('[A-Za-z0-9-]+',a.point) or not time.time()-10<a.at<time.time()+1200:raise SystemExit('invalid diagnostic profile bound')
folder=Path('/opt/avengers-runs')/a.point;time.sleep(max(0,a.at-time.time()));result={'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'seconds':30,'loopback_only':True,'qualification_eligible':False}
try:
 with urllib.request.urlopen('http://127.0.0.1:6565/debug/pprof/profile?seconds=30',timeout=45) as r:data=r.read(8*1024*1024+1)
 if not 16<len(data)<=8*1024*1024 or not data.startswith(b'\x1f\x8b'):raise ValueError('invalid profile payload')
 (folder/'k6-cpu.pprof').write_bytes(data);result.update(passed=True,bytes=len(data))
except Exception:result.update(passed=False,reason='bounded local profiling request failed; no exception text retained')
result['finished_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();(folder/'profile-status.json').write_text(json.dumps(result,indent=2)+'\n')
