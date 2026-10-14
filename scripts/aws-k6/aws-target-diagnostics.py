#!/usr/bin/env python3
"""Numeric host/cgroup/ENA/TCP observations; never read argv, env or app logs."""
import argparse
import datetime
import json
import re
import subprocess
import time
from pathlib import Path

FIELDS={'ListenOverflows','ListenDrops','TCPTimeouts','TCPSynRetrans','TCPReqQFullDoCookies','TCPReqQFullDrop','TCPSackRecoveryFail'}

def tcp_counters(text):
    rows=text.splitlines();out={}
    for header,values in zip(rows[::2],rows[1::2]):
        a=header.split();b=values.split()
        if not a or not b or a[0]!=b[0]:continue
        for key,value in zip(a[1:],b[1:]):
            if key in FIELDS and re.fullmatch(r'\d+',value):out[key]=int(value)
    return out


def sample():
    row={'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    row['cpu_ticks']=list(map(int,Path('/proc/stat').read_text().splitlines()[0].split()[1:9]))
    row['tcp_ext']=tcp_counters(Path('/proc/net/netstat').read_text())
    row['node_processes']=[]
    for p in Path('/proc').iterdir():
        if not p.name.isdigit():continue
        try:
            if (p/'comm').read_text().strip()!='node':continue
            cgroup=next(line.split(':',2)[2] for line in (p/'cgroup').read_text().splitlines() if line.startswith('0::'))
            directory=Path('/sys/fs/cgroup')/cgroup.lstrip('/')
            stat={key:int(value) for key,value in (line.split() for line in (directory/'cpu.stat').read_text().splitlines())}
            cid=re.findall(r'[0-9a-f]{64}',cgroup)
            row['node_processes'].append({'pid':int(p.name),'container_id':cid[-1] if cid else None,'cpu_stat':stat,'cpu_max':(directory/'cpu.max').read_text().split()})
        except (OSError,ValueError,StopIteration):continue
    row['ena']={}
    for iface in Path('/sys/class/net').iterdir():
        if iface.name=='lo':continue
        p=subprocess.run(['ethtool','-S',iface.name],capture_output=True,text=True,timeout=2)
        row['ena'][iface.name]={v[0].rstrip(':'):int(v[1]) for line in p.stdout.splitlines() if len(v:=line.split())==2 and v[0].rstrip(':') in ('bw_in_allowance_exceeded','bw_out_allowance_exceeded','pps_allowance_exceeded','conntrack_allowance_exceeded') and v[1].isdigit()}
    return row


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--seconds',type=int,default=480);args=p.parse_args()
    if not 30<=args.seconds<=900:raise SystemExit('invalid diagnostic interval')
    deadline=time.monotonic()+args.seconds
    while time.monotonic()<deadline:
        tick=time.monotonic()
        print(json.dumps(sample()),flush=True)
        time.sleep(max(0,5-(time.monotonic()-tick)))
