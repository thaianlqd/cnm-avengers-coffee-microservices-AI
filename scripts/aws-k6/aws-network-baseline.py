#!/usr/bin/env python3
"""Private AWS curl baseline: full decoded JSON, gzip wire size, no bodies saved."""
import argparse,hashlib,ipaddress,json,statistics,subprocess,tempfile
from pathlib import Path
from urllib.parse import urlsplit
ROUTES=['/menu/danh-muc','/menu/san-pham','/users/branches/public','/news?limit=100']
def private_target(url):
    u=urlsplit(url)
    try:ip=ipaddress.IPv4Address(u.hostname)
    except Exception:return False
    return u.scheme=='http' and u.port==30300 and not u.username and not u.password and u.path in ('','/') and not u.query and any(ip in ipaddress.ip_network(n) for n in ('10.0.0.0/8','172.16.0.0/12','192.168.0.0/16'))
def contract(path,j):
    a=j if isinstance(j,list) else j.get('items') if isinstance(j,dict) else None
    if not isinstance(a,list) or not a:return False
    if path==ROUTES[0]:return all(v.get('ma_danh_muc') is not None and isinstance(v.get('ten_danh_muc'),str) for v in a)
    if path==ROUTES[1]:return all(v.get('ma_san_pham') is not None and isinstance(v.get('ten_san_pham'),str) and v.get('gia_ban') is not None for v in a)
    if path==ROUTES[2]:return j.get('total')==len(a) and all(isinstance(v.get('ma_chi_nhanh'),str) and isinstance(v.get('ten_chi_nhanh'),str) for v in a)
    return j.get('page')==1 and j.get('limit')==100 and j.get('total',-1)>=len(a) and all(all(isinstance(v.get(k),str) for k in ('id','title','content')) for v in a)
def baseline(target,count):
    if not private_target(target):raise ValueError('private AWS NodePort required')
    rows=[]
    with tempfile.TemporaryDirectory() as d:
        d=Path(d)
        for route in ROUTES:
            for i in range(count):
                p=subprocess.run(['curl','-sS','--compressed','--max-time','10','-H','Accept: application/json','-D',str(d/'headers'),'-o',str(d/'body'),'-w','%{json}',target+route],capture_output=True,text=True)
                row={'route':route,'sample':i,'curl_exit':p.returncode}
                try:
                    t=json.loads(p.stdout);b=(d/'body').read_bytes();j=json.loads(b)
                    row.update(status=t['http_code'],connect_ms=t['time_connect']*1000,ttfb_ms=t['time_starttransfer']*1000,total_ms=t['time_total']*1000,gzip_bytes=t['size_download'],decoded_bytes=len(b),json_valid=contract(route,j),gzip_negotiated='content-encoding: gzip' in (d/'headers').read_text().lower(),body_sha256=hashlib.sha256(b).hexdigest(),items=len(j if isinstance(j,list) else j.get('items',[])))
                except Exception:row['json_valid']=False
                rows.append(row)
    passed=all(r.get('status')==200 and r['curl_exit']==0 and r.get('json_valid') and r.get('gzip_negotiated') for r in rows)
    return {'private_target':target,'samples_per_route':count,'passed':passed,'rows':rows}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('target');p.add_argument('--count',type=int,default=20);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    result=baseline(a.target,a.count);a.output.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'passed':result['passed'],'samples':len(result['rows'])}));raise SystemExit(0 if result['passed'] else 1)
