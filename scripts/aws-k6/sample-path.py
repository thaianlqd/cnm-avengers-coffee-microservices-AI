#!/usr/bin/env python3
"""Sample numeric tunnel counters; never persist identifiers, headers or bodies."""
import json, re, sys, time, urllib.request
from pathlib import Path
from datetime import datetime, timezone
folder=Path(sys.argv[1])
while not (folder/'cleanup.json').exists():
    try:
        with urllib.request.urlopen('http://127.0.0.1:18081/metrics',timeout=2) as r: text=r.read().decode()
        values={}
        for line in text.splitlines():
            match=re.match(r'^(cloudflared_tunnel_[a-z_]+)(?:\{(.*?)\})?\s+([\d.eE+-]+)$',line)
            if not match:continue
            name,labels,value=match.groups()
            # Keep aggregate gauges/counters and HTTP status only, drop connection/hostname/IP labels.
            status=re.search(r'(?:response_code|status_code)="(\d+)"',labels or '')
            key=name+(' / HTTP '+status.group(1) if status else '')
            values[key]=values.get(key,0)+float(value)
        if values:
            with (folder/'tunnel-metrics.jsonl').open('a') as out:
                out.write(json.dumps({'observed_at':datetime.now(timezone.utc).isoformat(),'metrics':values})+'\n')
    except (OSError,ValueError):pass
    time.sleep(10)
