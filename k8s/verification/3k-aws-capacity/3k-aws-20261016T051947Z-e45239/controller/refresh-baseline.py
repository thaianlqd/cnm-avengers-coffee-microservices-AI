import importlib.util,pathlib,json,concurrent.futures,sys
s=importlib.util.spec_from_file_location('driver','/tmp/avengers-run-point.py');d=importlib.util.module_from_spec(s);s.loader.exec_module(d);name=sys.argv[1];assert name.replace('-','').isalnum()
def run(role):
 script='python3 /opt/avengers-workload/aws-network-baseline.py '+d.target+' --count 2 --output /tmp/'+name+'.json >/dev/null\ncat /tmp/'+name+'.json\n';raw=d.submit(role,script,timeout=90);result=json.loads(raw);pathlib.Path(d.meta['evidence'],name+'-'+role+'.json').write_text(json.dumps(result,indent=2)+'\n');assert result['passed'];print(role+' fresh private-target baseline PASS',flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 for _ in pool.map(run,['generator1','generator2','generator3']):pass
