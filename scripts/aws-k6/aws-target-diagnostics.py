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


def snmp_counters(text):
    allowed={'Udp':{'InDatagrams','NoPorts','InErrors','OutDatagrams','RcvbufErrors','SndbufErrors','InCsumErrors','MemErrors'},'Tcp':{'ActiveOpens','PassiveOpens','AttemptFails','EstabResets','CurrEstab','InSegs','OutSegs','RetransSegs','InErrs','OutRsts'},'Ip':{'InDiscards','OutDiscards'}}
    rows=text.splitlines();result={}
    for header,values in zip(rows[::2],rows[1::2]):
        names=header.split();numbers=values.split()
        if not names or not numbers or names[0]!=numbers[0]:continue
        protocol=names[0].rstrip(':')
        for key,value in zip(names[1:],numbers[1:]):
            if key in allowed.get(protocol,set()) and value.isdigit():result[protocol+'/'+key]=int(value)
    return result


def socket_states(text):
    states={'01':'ESTABLISHED','02':'SYN_SENT','03':'SYN_RECV','04':'FIN_WAIT1','05':'FIN_WAIT2','06':'TIME_WAIT','07':'CLOSE','08':'CLOSE_WAIT','09':'LAST_ACK','0A':'LISTEN','0B':'CLOSING','0C':'NEW_SYN_RECV'};counts={}
    for line in text.splitlines()[1:]:
        fields=line.split()
        if len(fields)>3 and fields[3] in states:
            name=states[fields[3]];counts[name]=counts.get(name,0)+1
    return counts # Never retain socket addresses, ports, inode ownership or payloads.


def conntrack_counters(text):
    lines=text.splitlines()
    if not lines:return {}
    names=lines[0].split();allowed={'insert_failed','drop','early_drop','error','invalid','search_restart','clash_resolve','chaintoolong'};out={}
    for line in lines[1:]:
        for name,value in zip(names,line.split()):
            if name in allowed and re.fullmatch(r'[0-9a-fA-F]+',value):out[name]=out.get(name,0)+int(value,16)
    return out


def conntrack_netlink_counters(text):
    allowed={'insert_failed','drop','early_drop','error','invalid','search_restart','clash_resolve','chaintoolong'};out={}
    for line in text.splitlines():
        if not re.search(r'(?:^|\s)cpu=\d+(?:\s|$)',line):continue
        for name,value in re.findall(r'([a-z_]+)=(\d+)(?=\s|$)',line):
            if name in allowed:out[name]=out.get(name,0)+int(value)
    return out or None


def conntrack_snapshot():
    text=optional_text(Path('/proc/net/stat/nf_conntrack'))
    if text is not None:return {'source':'proc','counters':conntrack_counters(text)}
    try:
        result=subprocess.run(['conntrack','-S'],capture_output=True,text=True,timeout=2)
        counters=conntrack_netlink_counters(result.stdout) if result.returncode==0 else None
    except (OSError,subprocess.TimeoutExpired):counters=None
    return {'source':'netlink' if counters is not None else 'unavailable','counters':counters}


def interface_counters(text):
    out={}
    for line in text.splitlines()[2:]:
        if ':' not in line:continue
        name,values=line.split(':',1);fields=values.split()
        if len(fields)!=16 or not all(value.isdigit() for value in fields):continue
        out[name.strip()]={key:int(fields[index]) for key,index in [('rx_bytes',0),('rx_packets',1),('rx_errors',2),('rx_drops',3),('tx_bytes',8),('tx_packets',9),('tx_errors',10),('tx_drops',11)]}
    return out


def optional_text(path):
    try:return path.read_text()
    except OSError:return None


def network_namespace(directory):
    result={};data=optional_text(directory/'snmp');ext=optional_text(directory/'netstat')
    result['snmp']=snmp_counters(data) if data is not None else None
    result['tcp_ext']=tcp_counters(ext) if ext is not None else None
    states={};available=0
    for name in ('tcp','tcp6'):
        text=optional_text(directory/name)
        if text is None:continue
        available+=1
        for state,count in socket_states(text).items():states[state]=states.get(state,0)+count
    result['tcp_states']=states if available else None
    return result


def conntrack_usage(directory=Path('/proc/sys/net/netfilter')):
    values={}
    for key in ('count','max'):
        text=optional_text(directory/('nf_conntrack_'+key));values[key]=int(text.strip()) if text is not None and text.strip().isdigit() else None
    return values

def sample():
    row={'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    row['cpu_ticks']=list(map(int,Path('/proc/stat').read_text().splitlines()[0].split()[1:9]))
    row['tcp_ext']=tcp_counters(Path('/proc/net/netstat').read_text())
    row['host_network_namespace']=network_namespace(Path('/proc/net'))
    row['conntrack_usage']=conntrack_usage()
    ct=conntrack_snapshot();row['conntrack_counters']=ct['counters'];row['conntrack_counter_source']=ct['source']
    devices=optional_text(Path('/proc/net/dev'));row['interfaces']=interface_counters(devices) if devices is not None else None
    row['node_processes']=[];namespaces={}
    for p in Path('/proc').iterdir():
        if not p.name.isdigit():continue
        try:
            if (p/'comm').read_text().strip()!='node':continue
            cgroup=next(line.split(':',2)[2] for line in (p/'cgroup').read_text().splitlines() if line.startswith('0::'))
            directory=Path('/sys/fs/cgroup')/cgroup.lstrip('/')
            stat={key:int(value) for key,value in (line.split() for line in (directory/'cpu.stat').read_text().splitlines())}
            cid=re.findall(r'[0-9a-f]{64}',cgroup)
            ns=(p/'ns/net').stat().st_ino
            if ns not in namespaces:namespaces[ns]=network_namespace(p/'net')
            row['node_processes'].append({'pid':int(p.name),'container_id':cid[-1] if cid else None,'cpu_stat':stat,'cpu_max':(directory/'cpu.max').read_text().split(),'network_namespace_inode':ns,'network':namespaces[ns]})
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
