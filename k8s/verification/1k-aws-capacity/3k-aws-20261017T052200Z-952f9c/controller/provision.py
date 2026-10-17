from client import *
import concurrent.futures, hashlib
out=pathlib.Path(meta['evidence'])
base='''set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq > /run/avengers-capacity/apt.log 2>&1
apt-get install -y -qq docker.io docker-buildx curl ca-certificates > /run/avengers-capacity/install.log 2>&1
mkdir -p /opt/avengers-workload /opt/avengers-source
curl -fsSL --max-time 90 https://get.k3s.io -o /run/avengers-capacity/install-k3s.sh
'''
version=meta['k3s_version'];ip=state()['roles']['target1']['private_ip']
def server():
    script=base+f"INSTALL_K3S_VERSION='{version}' sh /run/avengers-capacity/install-k3s.sh server --node-name capacity-target1 --node-ip {ip} --advertise-address {ip} --disable traefik --disable servicelb > /run/avengers-capacity/k3s-install.log 2>&1\n"
    script+='for attempt in $(seq 1 60); do k3s kubectl get node capacity-target1 >/dev/null 2>&1 && break; sleep 3; done\nk3s kubectl wait --for=condition=Ready node/capacity-target1 --timeout=180s >/dev/null\ncat /var/lib/rancher/k3s/server/node-token\n'
    token=submit('target1',script,timeout=600).strip()
    assert len(token)>20 and b'\n' not in token
    print('target1 pinned K3s server Ready',flush=True)
    return token

def agent(role,token):
    nodeip=state()['roles'][role]['private_ip']
    script=base+'read -r K3S_TOKEN\nexport K3S_TOKEN\n'+f"INSTALL_K3S_VERSION='{version}' K3S_URL='https://{ip}:6443' sh /run/avengers-capacity/install-k3s.sh agent --node-name capacity-{role} --node-ip {nodeip} > /run/avengers-capacity/k3s-install.log 2>&1\nunset K3S_TOKEN\n"
    submit(role,script,token+b'\n',timeout=600)
    print(role+' K3s agent installed',flush=True)

def build():
    archive=pathlib.Path(meta['source_archive']).read_bytes()
    with tarfile.open(fileobj=io.BytesIO(archive),mode='r:gz') as t:
        for f in t:
            if f.issym() or f.islnk() or f.name.startswith('/') or '..' in pathlib.PurePosixPath(f.name).parts or (pathlib.PurePosixPath(f.name).name.startswith('.env') and pathlib.PurePosixPath(f.name).name not in ('.env.example','.env.sample')):raise ValueError('source archive safety')
    script='''set -euo pipefail
umask 077
base64 -d > /opt/avengers-source/source.tar.gz
tar -xzf /opt/avengers-source/source.tar.gz -C /opt/avengers-source
cd /opt/avengers-source
mkdir -p /opt/avengers-build-evidence
'''
    services={'api-gateway':'avengers-coffee-system/api-gateway/gateway-root',**{n:'avengers-coffee-system/services/'+n for n in ('identity-service','menu-service','news-service')}}
    tag=meta['image_tag']
    for name,path in services.items():
        script+=f'docker build --platform linux/amd64 --target builder -t avengers/{name}:test {path} > /opt/avengers-build-evidence/{name}-builder.log 2>&1\n'
        script+=f'docker run --rm avengers/{name}:test npm test -- --runInBand > /opt/avengers-build-evidence/{name}-tests.log 2>&1\n'
        script+=f'docker build --platform linux/amd64 --target runner -t avengers/{name}:{tag} {path} > /opt/avengers-build-evidence/{name}-runner.log 2>&1\n'
    script+=f'docker buildx build --load --platform linux/amd64 --build-context menu_media=avengers-coffee-system/apps/web-customer/public/images/products --build-context news_media=avengers-coffee-system/shared/uploads -t avengers/customer-media:{tag} k8s/media > /opt/avengers-build-evidence/media.log 2>&1\n'
    images=' '.join(f'avengers/{name}:{tag}' for name in (*services,'customer-media'))
    script+=f'docker image inspect {images} --format '+"'{{json .}}' > /opt/avengers-build-evidence/images.jsonl\n"
    script+=f'docker save {images} -o /opt/avengers-source/images.tar\nsha256sum /opt/avengers-source/images.tar > /opt/avengers-build-evidence/images.sha256\nk3s ctr images import /opt/avengers-source/images.tar > /opt/avengers-build-evidence/import.log 2>&1\n'
    script+='nohup python3 -m http.server 8050 --bind '+ip+' --directory /opt/avengers-source > /run/avengers-capacity/image-http.log 2>&1 < /dev/null &\necho $! > /run/avengers-capacity/image-http.pid\necho BUILD_COMPLETE\n'
    submit('target1',script,base64.b64encode(archive),timeout=1800)
    print('frozen images built, full backend tests passed, imported target1',flush=True)

token=server()
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    fs=[pool.submit(agent,r,token) for r in ('target2','target3')]+[pool.submit(build)]
    for f in fs:f.result()
submit('target1','''set -eu
for node in capacity-target2 capacity-target3; do
 for attempt in $(seq 1 60); do k3s kubectl get node "$node" >/dev/null 2>&1 && break; sleep 3; done
 k3s kubectl wait --for=condition=Ready node/"$node" --timeout=180s >/dev/null
done
''',timeout=450)
def import_image(role):
    submit(role,f'set -eu\ncurl -fsS --max-time 300 http://{ip}:8050/images.tar -o /opt/avengers-source/images.tar\nk3s ctr images import /opt/avengers-source/images.tar > /run/avengers-capacity/images-import.log 2>&1\nsystemctl stop docker.service docker.socket\n',timeout=450)
    print(role+' images imported',flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    for _ in pool.map(import_image,('target2','target3')):pass
script='''set -eu
kill "$(cat /run/avengers-capacity/image-http.pid)"
systemctl stop docker.service docker.socket
python3 - <<'PY'
import base64,io,pathlib,tarfile
buf=io.BytesIO()
with tarfile.open(fileobj=buf,mode='w:gz') as t:
 for p in pathlib.Path('/opt/avengers-build-evidence').iterdir():t.add(p,arcname=p.name)
print(base64.b64encode(buf.getvalue()).decode())
PY
'''
raw=submit('target1',script,timeout=90)
allowed={f'{n}-{s}.log' for n in ('api-gateway','identity-service','menu-service','news-service') for s in ('builder','tests','runner')}|{'media.log','images.jsonl','images.sha256','import.log'}
extract(raw,out/'build',allowed)
(out/'provision-state.json').write_text(json.dumps({'passed':True,'k3s_version':version,'source_tree_sha256':meta['source_tree_sha256'],'image_tag':meta['image_tag'],'build_tests_on_aws':True},indent=2)+'\n')
print('PROVISION_COMPLETE',flush=True)
