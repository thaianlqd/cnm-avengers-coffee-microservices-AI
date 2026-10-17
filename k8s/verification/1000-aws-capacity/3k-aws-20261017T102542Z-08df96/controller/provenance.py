from client import *
import hashlib
manifest=json.loads((pathlib.Path(meta['evidence'])/'source-manifest.json').read_text());script='''set -euo pipefail
python3 - <<'PY'
import base64,hashlib,io,json,pathlib,subprocess,tarfile
root=pathlib.Path('/opt/avengers-source'); manifest=json.loads(base64.b64decode('MANIFEST'))
actual={n:hashlib.sha256((root/n).read_bytes()).hexdigest() for n in manifest['files']}
assert actual==manifest['files']
assert hashlib.sha256((root/'source.tar.gz').read_bytes()).hexdigest()==manifest['source_archive_sha256']
k=lambda *a:json.loads(subprocess.check_output(['k3s','kubectl',*a,'-o','json'],text=True))
nodes=k('get','nodes')['items']; coredns=k('-n','kube-system','get','deployment','coredns')
result={'source_file_hashes_match':True,'source_archive_sha256':manifest['source_archive_sha256'],'application_tree_sha256':manifest['application_tree_sha256'],'gateway_node_version':subprocess.check_output(['k3s','kubectl','-n','avengers-coffee','exec','deployment/api-gateway','--','node','--version'],text=True).strip(),'nodes':[{'name':n['metadata']['name'],'nodeInfo':n['status']['nodeInfo'],'capacity':n['status']['capacity'],'allocatable':n['status']['allocatable']} for n in nodes],'coredns':{'replicas':coredns['spec']['replicas'],'available':coredns.get('status',{}).get('availableReplicas',0),'containers':[{'name':c['name'],'image':c['image'],'resources':c.get('resources',{})} for c in coredns['spec']['template']['spec']['containers']]}}
print(json.dumps(result,indent=2))
PY
'''.replace('MANIFEST',base64.b64encode(json.dumps(manifest).encode()).decode())
raw=submit('target1',script,timeout=90);result=json.loads(raw);assert result['source_file_hashes_match'];(pathlib.Path(meta['evidence'])/'aws-source-runtime-provenance.json').write_bytes(raw);print('AWS frozen file/archive hashes verified; actual Node/K3s/CoreDNS provenance recorded',flush=True)
