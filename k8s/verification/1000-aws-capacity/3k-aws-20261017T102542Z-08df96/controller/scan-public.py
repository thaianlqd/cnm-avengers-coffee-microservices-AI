"""Bounded-memory public-artifact scan; compare approved DB values only in memory."""
import datetime,gzip,json,pathlib,re,subprocess
root=pathlib.Path(__file__).resolve().parents[5];e=pathlib.Path(__file__).resolve().parent.parent;original=root.with_name('cnm-avengers-coffee-microservices-AI')
p=subprocess.run(['docker','compose','--env-file',str(original/'.env'),'-f',str(original/'docker-compose.yml'),'config','--format','json'],cwd=original,capture_output=True,text=True)
if p.returncode:raise RuntimeError('read-only Compose configuration failed; details suppressed')
services=json.loads(p.stdout)['services'];p=None
values={str(v).encode() for name in ('identity-service','menu-service','news-service') for k,v in services[name]['environment'].items() if k in ('DB_HOST','DB_USER','DB_PASSWORD') and v is not None and len(str(v))>=8};services=None
names=set()
for command in (['git','diff','--name-only','HEAD','-z'],['git','ls-files','--others','--exclude-standard','-z']):names.update(n for n in subprocess.check_output(command,cwd=root).decode().split('\0') if n)
names.update(str(p.relative_to(root)) for p in (root/'k8s/verification/1000-aws-capacity').rglob('*') if p.is_file() and '__pycache__' not in p.parts)
patterns=[('private-key/access-key',re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:AKIA|ASIA)[A-Z0-9]{16}')),('github-token',re.compile(rb'gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}')),('cluster-join-token',re.compile(rb'K10[0-9a-f]{64}::server:[0-9a-f]+'))]
findings=[];count=0;gz=0
for name in sorted(names):
 path=root/name
 if not path.is_file():continue
 count+=1;hits=set()
 with path.open('rb') as f:compressed=f.read(2)==b'\x1f\x8b'
 if compressed:gz+=1
 try:
  with (gzip.open(path,'rb') if compressed else path.open('rb')) as f:
   tail=b''
   while block:=f.read(1048576):
    data=tail+block
    if any(v in data for v in values):hits.add('actual DB configuration; values suppressed')
    for kind,pattern in patterns:
     if pattern.search(data):hits.add(kind+' pattern; values suppressed')
    for url in re.findall(rb'https://[-a-z0-9]+\.trycloudflare\.com',data):
     if b'synthetic' not in url and b'example' not in url:hits.add('live control URL; value suppressed')
    tail=data[-1024:]
 except (OSError,EOFError):hits.add('unreadable/corrupt artifact')
 findings.extend({'file':name,'kind':kind} for kind in sorted(hits))
record={'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'HEAD diff + untracked public files + all public1000 artifacts including ignored logs; excludes private session and bytecode','files_checked':count,'gzip_streams_decoded':gz,'actual_db_values_compared_only_in_memory':True,'credential_values_retained':False,'findings':findings,'pass':not findings}
(e/'validation/secret-scan.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record))
if findings:raise SystemExit(1)
