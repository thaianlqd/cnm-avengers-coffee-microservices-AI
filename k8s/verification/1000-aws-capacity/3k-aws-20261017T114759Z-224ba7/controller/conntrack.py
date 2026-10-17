"""Read-only netlink/proc counters and categorized kernel drop events."""
from client import *
import argparse,concurrent.futures
p=argparse.ArgumentParser();p.add_argument('name');p.add_argument('--install',action='store_true');a=p.parse_args();assert a.name.replace('-','').isalnum()
def run(role):
 script='set -euo pipefail\nmkdir -p /opt/avengers-workload\n'
 if a.install:script+='export DEBIAN_FRONTEND=noninteractive\napt-get install -y -qq conntrack > /run/avengers-capacity/conntrack-install.log 2>&1\n'
 script+=install('aws-target-diagnostics.py',root/'scripts/aws-k6/aws-target-diagnostics.py')
 if role=='target1':script+=install('point-observe.py',pathlib.Path(__file__).with_name('point-observe.py'))
 script+='''python3 - <<'PY'
import datetime,importlib.util,json,pathlib,subprocess
s=importlib.util.spec_from_file_location('d','/opt/avengers-workload/aws-target-diagnostics.py');d=importlib.util.module_from_spec(s);s.loader.exec_module(d)
result={'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'stats':d.conntrack_snapshot(),'usage':d.conntrack_usage(),'sysctls':{}}
for key in ('nf_conntrack_tcp_timeout_time_wait','nf_conntrack_tcp_timeout_close_wait','nf_conntrack_tcp_timeout_fin_wait','nf_conntrack_tcp_timeout_established','nf_conntrack_udp_timeout','nf_conntrack_udp_timeout_stream','nf_conntrack_buckets'):
 text=d.optional_text(pathlib.Path('/proc/sys/net/netfilter')/key);result['sysctls'][key]=int(text.strip()) if text is not None and text.strip().isdigit() else None
p=subprocess.run(['conntrack','-V'],capture_output=True,text=True);result['tool_version']=p.stdout.strip().splitlines()[0] if p.returncode==0 else None
p=subprocess.run(['journalctl','-k','--no-pager','-o','json','-n','20000'],capture_output=True,text=True,timeout=30)
result['kernel_log_available']=p.returncode==0;result['table_full_event_timestamps']=[] if p.returncode==0 else None
if p.returncode==0:
 for line in p.stdout.splitlines():
  try:r=json.loads(line)
  except ValueError:continue
  text=str(r.get('MESSAGE','')).lower()
  if 'nf_conntrack' in text and 'table full' in text and str(r.get('__REALTIME_TIMESTAMP','')).isdigit():result['table_full_event_timestamps'].append(datetime.datetime.fromtimestamp(int(r['__REALTIME_TIMESTAMP'])/1e6,datetime.timezone.utc).isoformat())
print(json.dumps(result,indent=2))
PY
'''
 raw=submit(role,script,timeout=150);r=json.loads(raw);(pathlib.Path(meta['evidence'])/(a.name+'-conntrack-'+role+'.json')).write_bytes(raw)
 if a.install:assert r['stats']['source']!='unavailable'
 print(role+' conntrack snapshot '+r['stats']['source'],flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 for _ in pool.map(run,('target1','target2')):pass
