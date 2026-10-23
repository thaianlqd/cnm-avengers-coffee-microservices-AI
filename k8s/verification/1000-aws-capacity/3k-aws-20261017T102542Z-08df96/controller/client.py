"""Authenticated client for the bounded 1000-VU qualification fleet."""
import base64, fcntl, importlib.util, io, json, pathlib, tarfile
root=pathlib.Path(__file__).resolve().parents[5]
active=root/'.cache/aws-capacity-private/active-1000.json'
run_path=pathlib.Path(__file__).resolve().parent.parent
meta=json.loads(active.read_text()) if active.exists() and json.loads(active.read_text())['run']==run_path.name else {'root':str(root),'evidence':str(run_path),'run':run_path.name,'folder':str(root/'.cache/aws-capacity-private'/run_path.name)}
if meta['run']!=run_path.name:raise ValueError('active session RunId mismatch')
folder=pathlib.Path(meta['folder'])
spec=importlib.util.spec_from_file_location('private_session',root/'scripts/aws-k6/aws-private-session.py')
session=importlib.util.module_from_spec(spec);spec.loader.exec_module(session)
def submit(role,script,stdin=b'',timeout=900):
    if role not in state()['roles']:raise ValueError('unknown owned role')
    with (folder/role/'.submission.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        if not (folder/'READY').exists() or (folder/'FINISH').exists() or (folder/'CLOSED').exists() or not (folder/role/'verified').exists():raise RuntimeError('recipient/session not authenticated and active')
        job,code=session.submit(folder,role,script,stdin,timeout)
        if code:raise RuntimeError(role+' control job '+job+' failed exit '+str(code)+'; inspect private stderr locally')
        return (folder/role/(job+'.stdout')).read_bytes()
def state():return json.loads((folder/'state.json').read_text())
def install(name,path):
    assert '/' not in name
    return "printf '%s' '"+base64.b64encode(path.read_bytes()).decode()+"' | base64 -d > /opt/avengers-workload/"+name+'\n'
def extract(raw,dest,allowed):
    dest.mkdir(parents=True,exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(base64.b64decode(raw)),mode='r:gz') as archive:
        for member in archive.getmembers():
            if member.name not in allowed or not member.isfile():raise ValueError('unexpected artifact')
            (dest/member.name).write_bytes(archive.extractfile(member).read())
