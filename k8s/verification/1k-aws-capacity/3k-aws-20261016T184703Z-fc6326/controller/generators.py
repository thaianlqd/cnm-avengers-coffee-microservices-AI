from client import *
import concurrent.futures, time
while not (folder/'generator3/verified').exists():
    if (folder/'FINISH').exists():raise RuntimeError('session ending')
    time.sleep(3)
def initialize(role):
    bootstrap=(root/'scripts/aws-k6/bootstrap.sh').read_text().replace('sudo shutdown -h +230 >/dev/null','')
    script='set -euo pipefail\nmkdir -p /opt/avengers-workload\nexport K6_INSTALL_DIR=/opt/avengers-k6\n'+bootstrap+'\nln -sf /opt/avengers-k6/k6 /usr/local/bin/k6\n'
    for name,path in {'customer-browse-3k.js':root/'load-tests/k6/customer-browse-3k.js','metrics-3k.py':root/'scripts/aws-k6/aws-generator-metrics.py',**{n:root/'scripts/aws-k6'/n for n in ('aws-run-generator.py','aws-network-baseline.py','archive-aws-points.py')}}.items():script+=install(name,path)
    script+='echo GENERATOR_READY\n'
    raw=submit(role,script,timeout=300)
    (pathlib.Path(meta['evidence'])/(role+'-bootstrap.txt')).write_bytes(raw)
    print(role+' native k6 ready',flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    for _ in pool.map(initialize,('generator1','generator2','generator3')):pass
