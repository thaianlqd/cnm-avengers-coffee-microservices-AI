import importlib.util,pathlib,argparse,io,tarfile,base64,textwrap,json
spec=importlib.util.spec_from_file_location('driver','/tmp/avengers-run-point.py');d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
a=argparse.Namespace(name='default-long-g3-500',vus=500,generators=3,hold=300,diagnostic=False,kernel=True);point=pathlib.Path(d.meta['evidence'])/a.name;roles=['generator1','generator2','generator3']
for role in roles:
 if (point/role/'metric-points.jsonl.gz').exists():continue
 script='set -euo pipefail\n'
 script+=f'python3 /opt/avengers-workload/archive-aws-points.py /opt/avengers-runs/{a.name} /opt/avengers-raw-archive >/dev/null\n'
 script+="python3 - <<'END'\nimport base64,io,pathlib,tarfile\nf=pathlib.Path('/opt/avengers-runs/"+a.name+"');out=io.BytesIO()\nwith tarfile.open(fileobj=out,mode='w:gz') as t:\n for name in ('metadata.json','k6.json','k6.log','generator.jsonl','metric-points.jsonl.gz','metric-points-manifest.json','stage-vus.jsonl.gz','http-windows.jsonl.gz','post-smoke.json','exit.txt'):t.add(f/name,arcname=name)\nprint(base64.b64encode(out.getvalue()).decode())\nEND\n"
 output=d.submit(role,script,timeout=180);d.extract(output.splitlines()[-1],point/role,{'metadata.json','k6.json','k6.log','generator.jsonl','metric-points.jsonl.gz','metric-points-manifest.json','stage-vus.jsonl.gz','http-windows.jsonl.gz','post-smoke.json','exit.txt'});print(role+' original artifacts recovered',flush=True)
(point/'orchestration-recovery.json').write_text(json.dumps({'load_rerun':False,'reason':'post-smoke exit 1 under shell errexit interrupted artifact archiving on generator1/2; original failed smoke retained, not retried','method':'archive original raw observations; finish original kernel/target observers; natural baseline recovery; exact original merge'},indent=2)+'\n')
ns={**d.__dict__,**globals()};source=pathlib.Path('/tmp/avengers-run-point.py').read_text();tail=source[source.index('    if a.kernel:\n        def finish_kernel'):];exec(textwrap.dedent(tail),ns)
