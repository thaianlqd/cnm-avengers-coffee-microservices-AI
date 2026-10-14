#!/usr/bin/env python3
"""Read-only LAN/NAT discovery. Private addresses never enter the public evidence."""
import ipaddress, json, re, socket, struct, subprocess, time
from pathlib import Path
import urllib.request, urllib.parse, xml.etree.ElementTree as ET

def command(args):
    return subprocess.run(args,capture_output=True,text=True,timeout=20).stdout.strip()

def discover(folder):
    route=command(['route','-n','get','default'])
    gateway=re.search(r'gateway:\s+(\S+)',route).group(1)
    iface=re.search(r'interface:\s+(\S+)',route).group(1)
    lan=command(['ipconfig','getifaddr',iface])
    public=command(['curl','-q','-4','--noproxy','*','-fsS','--max-time','15','https://checkip.amazonaws.com'])
    ipaddress.IPv4Address(public)
    private={'gateway':gateway,'interface':iface,'lan':lan,'mac_public_ipv4':public}
    result={'observed_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'default_interface':iface,
            'lan_private':ipaddress.ip_address(lan).is_private,'public_address_is_global':ipaddress.ip_address(public).is_global,
            'nat_or_firewall_changed':False,'nat_pmp':{},'upnp':{}}
    s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);s.settimeout(2)
    try:
        s.sendto(bytes([0,0]),(gateway,5351));data,peer=s.recvfrom(32)
        if peer[0]!=gateway or len(data)!=12:raise ValueError('unexpected packet')
        version,opcode,code,epoch,wan=struct.unpack('!BBHII',data)
        if (version,opcode)!=(0,128):raise ValueError('unexpected packet')
        external=str(ipaddress.IPv4Address(wan));private['nat_pmp_external']=external
        result['nat_pmp']={'responded':True,'result_code':code,'external_is_global':ipaddress.ip_address(external).is_global,'external_matches_https_public':external==public}
    except (OSError,ValueError):result['nat_pmp']={'responded':False}
    finally:s.close()
    s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);s.settimeout(.5)
    request='M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\n\r\n'
    locations=set();until=time.monotonic()+4
    try:
        s.sendto(request.encode(),('239.255.255.250',1900))
        while time.monotonic()<until:
            try:data,peer=s.recvfrom(8192)
            except socket.timeout:continue
            if not ipaddress.ip_address(peer[0]).is_private:continue
            m=re.search(r'^location:\s*(\S+)',data.decode(errors='replace'),re.I|re.M)
            if m:locations.add(m.group(1))
    finally:s.close()
    result['upnp']={'igd_responses':len(locations),'wan_service_found':False}
    for location in locations:
        url=urllib.parse.urlparse(location)
        try:
            if url.scheme!='http' or not ipaddress.ip_address(url.hostname).is_private:continue
            opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(location,timeout=5) as out:root=ET.fromstring(out.read(256*1024))
            for service in root.iter():
                if not service.tag.endswith('}service'):continue
                values={x.tag.rsplit('}',1)[-1]:x.text for x in service}
                kind=values.get('serviceType','')
                if ':WANIPConnection:' not in kind and ':WANPPPConnection:' not in kind:continue
                result['upnp']['wan_service_found']=True
                control=urllib.parse.urljoin(location,values['controlURL'])
                parsed=urllib.parse.urlparse(control)
                if parsed.hostname!=url.hostname:continue
                body=('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:GetExternalIPAddress xmlns:u="'+kind+'"/></s:Body></s:Envelope>').encode()
                req=urllib.request.Request(control,data=body,headers={'SOAPAction':'"'+kind+'#GetExternalIPAddress"','Content-Type':'text/xml'})
                with opener.open(req,timeout=5) as out:response=ET.fromstring(out.read(65536))
                external=next(x.text for x in response.iter() if x.tag.endswith('NewExternalIPAddress'))
                private.update(upnp_control=control,upnp_service=kind,upnp_external=external)
                result['upnp'].update(external_is_global=ipaddress.ip_address(external).is_global,external_matches_https_public=external==public)
        except Exception:result['upnp']['read_error']=True
    observations=[r['external_is_global'] for r in [result['nat_pmp'],result['upnp']] if 'external_is_global' in r]
    result['cgnat_assessment']='non-global router WAN observed' if False in observations else 'not established: router WAN unavailable' if not observations else 'router WAN global; inbound reachability unverified'
    result['direct_mapping_protocol_available']=result['nat_pmp'].get('result_code')==0 or result['upnp']['wan_service_found']
    folder.mkdir(parents=True,exist_ok=True,mode=0o700)
    p=folder/'network-private.json';p.write_text(json.dumps(private));p.chmod(0o600)
    (folder/'network-discovery.json').write_text(json.dumps(result,indent=2)+'\n')
    return result

if __name__=='__main__':print(json.dumps(discover(Path('/tmp/avengers-aws-k6-3k')),indent=2))
