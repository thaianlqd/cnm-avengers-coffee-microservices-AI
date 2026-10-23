"""Eight full/gzip public reads over one HTTP/1.1 client; no raw headers or bodies kept."""
from client import *
import argparse
p=argparse.ArgumentParser();p.add_argument('name');a=p.parse_args();assert a.name.replace('-','').isalnum();ip=state()['roles']['target1']['private_ip']
script='''python3 - <<'PY'
import datetime,gzip,http.client,importlib.util,json,time
s=importlib.util.spec_from_file_location('b','/opt/avengers-workload/aws-network-baseline.py');b=importlib.util.module_from_spec(s);s.loader.exec_module(b)
c=http.client.HTTPConnection('TARGET_IP',30300,timeout=10);rows=[];previous=None
try:
 for route in b.ROUTES*2:
  start=time.monotonic();c.request('GET',route,headers={'Accept':'application/json','Accept-Encoding':'gzip'});r=c.getresponse();data=r.read();encoded=r.getheader('Content-Encoding');connection=r.getheader('Connection','').lower();j=json.loads(gzip.decompress(data) if encoded=='gzip' else data);current=c.sock
  rows.append({'route':route,'status':r.status,'gzip':encoded=='gzip','json_valid':b.contract(route,j),'connection':connection if connection in ('close','keep-alive') else 'other_or_absent','response_will_close':r.will_close,'socket_open_after_read':current is not None,'same_socket_as_previous':previous is not None and current is previous,'duration_ms':(time.monotonic()-start)*1000});previous=current
finally:c.close()
print(json.dumps({'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':all(r['status']==200 and r['gzip'] and r['json_valid'] for r in rows),'rows':rows},indent=2))
PY
'''.replace('TARGET_IP',ip)
raw=submit('generator1',script,timeout=120);d=json.loads(raw);assert d['passed'];(pathlib.Path(meta['evidence'])/(a.name+'-transport.json')).write_bytes(raw);print(a.name+' transport probe PASS; reused sockets '+str(sum(r['same_socket_as_previous'] for r in d['rows']))+'/7 possible',flush=True)
