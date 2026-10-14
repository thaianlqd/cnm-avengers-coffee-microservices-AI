#!/usr/bin/env python3
"""Only numeric Linux metrics and executable names; never argv/env/socket peers."""
import json, time, pathlib, os, subprocess
from datetime import datetime, timezone
P = pathlib.Path('/proc')
while True:
    row = {'observed_at': datetime.now(timezone.utc).isoformat()}
    row['cpu_ticks'] = list(map(int, (P/'stat').read_text().splitlines()[0].split()[1:]))
    row['memory_KiB'] = {v.split(':')[0]: int(v.split()[1]) for v in (P/'meminfo').read_text().splitlines()
                         if v.split(':')[0] in ['MemTotal','MemAvailable','SwapTotal','SwapFree']}
    row['network_bytes'] = {v.split(':')[0].strip(): {'rx': int(v.split(':')[1].split()[0]), 'tx': int(v.split(':')[1].split()[8]), 'rx_errors': int(v.split(':')[1].split()[2]), 'rx_drops': int(v.split(':')[1].split()[3]), 'tx_errors': int(v.split(':')[1].split()[10]), 'tx_drops': int(v.split(':')[1].split()[11])}
                             for v in (P/'net/dev').read_text().splitlines()[2:]}
    row['ena']={}
    for iface in row['network_bytes']:
        if iface=='lo': continue
        try:
            stats=subprocess.run(['ethtool','-S',iface],capture_output=True,text=True,timeout=2)
            row['ena'][iface]={parts[0].rstrip(':'):int(parts[1]) for line in stats.stdout.splitlines() if len(parts:=line.split())==2 and parts[0].rstrip(':') in ('bw_in_allowance_exceeded','bw_out_allowance_exceeded','pps_allowance_exceeded','conntrack_allowance_exceeded')}
        except Exception: row['ena'][iface]={}
    row['ena_valid']=bool(row['ena']) and all(len(v)==4 for v in row['ena'].values())
    row['tcp']={} 
    tcp=(P/'net/snmp').read_text().splitlines()
    for a,b in zip(tcp,tcp[1:]):
        if a.startswith('Tcp:') and b.startswith('Tcp:'):
            row['tcp']={k:int(v) for k,v in zip(a.split()[1:],b.split()[1:]) if k in ['RetransSegs','InErrs','OutRsts','CurrEstab']}
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
