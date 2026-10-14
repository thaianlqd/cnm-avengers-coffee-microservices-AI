#!/usr/bin/env python3
"""Only numeric Linux metrics and executable names; never argv/env/socket peers."""
import json, time, pathlib, os
from datetime import datetime, timezone
P = pathlib.Path('/proc')
while True:
    row = {'observed_at': datetime.now(timezone.utc).isoformat()}
    row['cpu_ticks'] = list(map(int, (P/'stat').read_text().splitlines()[0].split()[1:]))
    row['memory_KiB'] = {v.split(':')[0]: int(v.split()[1]) for v in (P/'meminfo').read_text().splitlines()
                         if v.split(':')[0] in ['MemTotal','MemAvailable','SwapTotal','SwapFree']}
    row['network_bytes'] = {v.split(':')[0].strip(): {'rx': int(v.split(':')[1].split()[0]), 'tx': int(v.split(':')[1].split()[8])}
                             for v in (P/'net/dev').read_text().splitlines()[2:]}
    row['load'] = (P/'loadavg').read_text().split()[:3]
    row['processes'] = []
    for p in P.iterdir():
        if not p.name.isdigit(): continue
        try:
            name = (p/'comm').read_text().strip()
            if name not in ['k6', 'sshd']: continue
            fields = (p/'stat').read_text().split(') ',1)[1].split()
            row['processes'].append({'pid': int(p.name), 'name': name, 'user_ticks': int(fields[11]),
                'system_ticks': int(fields[12]), 'rss_bytes': int(fields[21])*os.sysconf('SC_PAGE_SIZE'),
                'fds': len(list((p/'fd').iterdir()))})
        except (OSError, ValueError): pass
    print(json.dumps(row), flush=True)
    time.sleep(5)
