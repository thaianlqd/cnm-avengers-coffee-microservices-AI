import importlib.util,pathlib,sys,json
s=importlib.util.spec_from_file_location('driver','/tmp/avengers-run-point.py');d=importlib.util.module_from_spec(s);s.loader.exec_module(d)
for name in sys.argv[1:]:
 point=pathlib.Path(d.meta['evidence'])/name;roles=sorted(p.name for p in point.glob('generator[1-3]'))
 script='set -euo pipefail\n'+d.install('analyze-aws-capacity.py',d.root/'scripts/aws-k6/analyze-aws-capacity.py')
 script+=f'cd /opt/avengers-analysis/{name}\npython3 /opt/avengers-workload/analyze-aws-capacity.py . > /dev/null\n'
 script+="python3 - <<'END'\nimport base64,io,tarfile\no=io.BytesIO()\nwith tarfile.open(fileobj=o,mode='w:gz') as t:\n for name in ('metadata.json','k6.json','analysis.json'):t.add(name,arcname=name)\n for role in "+repr(roles)+":t.add(role+'/analysis.json',arcname=role+'-analysis.json')\nprint(base64.b64encode(o.getvalue()).decode())\nEND\n"
 output=d.submit('generator1',script,timeout=120);d.extract(output.splitlines()[-1],point,{'metadata.json','k6.json','analysis.json',*(r+'-analysis.json' for r in roles)})
 for role in roles:
  (point/role/'analysis.json').write_bytes((point/(role+'-analysis.json')).read_bytes());(point/(role+'-analysis.json')).unlink()
 (point/'generator.jsonl').write_bytes((point/roles[0]/'generator.jsonl').read_bytes());(point/'post-smoke.json').write_bytes((point/roles[0]/'post-smoke.json').read_bytes());(point/'k6.log').write_text(''.join((point/r/'k6.log').read_text() for r in roles))
 a=json.loads((point/'analysis.json').read_text());print(name,json.dumps({k:a[k] for k in ('status','generator_adequate','target_reasons','p95_ms','hold_p95_ms','failure_rate','complete_metric_hold_coverage')}),flush=True)
