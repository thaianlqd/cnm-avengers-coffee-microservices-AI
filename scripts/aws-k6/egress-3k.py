#!/usr/bin/env python3
"""Low-volume STUN diagnostics only. Never a k6 transport or TURN allocation."""
import ipaddress, json, secrets, socket, ssl, struct
from pathlib import Path

def mapped_ipv4(data,transaction):
    if len(data)<20 or data[8:20]!=transaction:raise ValueError('STUN transaction mismatch')
    kind,length,cookie=struct.unpack('!HHI',data[:8])
    if kind!=0x101 or cookie!=0x2112a442 or len(data)<20+length:raise ValueError('Incomplete STUN success response')
    offset=20
    while offset+4<=20+length:
        typ,n=struct.unpack('!HH',data[offset:offset+4]);value=data[offset+4:offset+4+n];offset+=4+((n+3)//4)*4
        if offset>20+length:raise ValueError('Malformed STUN attribute length')
        if typ==0x20 and len(value)>=8 and value[1]==1:
            return str(ipaddress.IPv4Address(struct.unpack('!I',value[4:8])[0]^cookie))
    raise ValueError('No mapped IPv4 in STUN response')

def main():
    root=Path('/tmp/avengers-aws-k6-3k');p=root/'network-private.json';state=json.loads(p.read_text());rows=[];addresses=[]
    for repeat in range(3):
        row={'repeat':repeat,'tcp_connected':False,'port':443}
        try:
            with socket.create_connection(('turn.cloudflare.com',443),timeout=5) as raw:
                with ssl.create_default_context().wrap_socket(raw,server_hostname='turn.cloudflare.com') as stream:
                    stream.settimeout(5);row['tcp_connected']=True;transaction=secrets.token_bytes(12)
                    stream.sendall(struct.pack('!HHI',1,0,0x2112a442)+transaction)
                    data=b''
                    while len(data)<20:data+=stream.recv(20-len(data)) or (_ for _ in ()).throw(ValueError('EOF'))
                    length=struct.unpack('!H',data[2:4])[0]
                    if length>4096:raise ValueError('STUN response oversized')
                    while len(data)<20+length:data+=stream.recv(20+length-len(data)) or (_ for _ in ()).throw(ValueError('EOF'))
                    ip=mapped_ipv4(data,transaction);addresses.append(ip);state['tcp443_stun_'+str(repeat)]=ip
                    row.update(global_address=ipaddress.ip_address(ip).is_global,matches_https_ip=ip==state['mac_public_ipv4'])
        except (OSError,ValueError) as e:row['error_type']=type(e).__name__
        rows.append(row)
    p.write_text(json.dumps(state));p.chmod(0o600)
    result={'samples':rows,'distinct_tcp443_egress_addresses':len(set(addresses)),'ip_values_kept_only_in_private_tmp':True,'benchmark_data_over_cloudflare':False}
    (root/'egress-recheck.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))

if __name__=='__main__':main()
