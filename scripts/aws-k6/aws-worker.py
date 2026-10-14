#!/usr/bin/env python3
"""Ephemeral outbound control: pinned signature verification + CMS encryption.
Private recipient key stays on EC2. No plaintext commands/secrets at relay.
"""
import base64, hashlib, json, os, subprocess, time, urllib.request
from pathlib import Path
HOME=Path('/run/avengers-capacity'); HOME.mkdir(mode=0o700,exist_ok=True)
CFG=json.loads((HOME/'config.json').read_text())
def run(args,**kw):return subprocess.run(args,capture_output=True,**kw)
def request(path,data=None):
    req=urllib.request.Request(CFG['control']+'/'+CFG['role']+'/'+path,data=data,headers={'Authorization':'Bearer '+CFG['token'],'Content-Type':'application/json'})
    return urllib.request.urlopen(req,timeout=30).read()
run(['openssl','req','-x509','-newkey','rsa:3072','-nodes','-keyout',str(HOME/'key.pem'),'-out',str(HOME/'cert.pem'),'-days','1','-subj','/CN=avengers-capacity'])
os.chmod(HOME/'key.pem',0o600)
cert=(HOME/'cert.pem').read_bytes()
with open('/dev/console','w') as console:console.write('AVENGERS_CERT_SHA256='+hashlib.sha256(cert).hexdigest()+'\n')
run(['openssl','x509','-pubkey','-noout','-in',str(HOME/'controller.pem')]).stdout
(HOME/'controller.pub').write_bytes(run(['openssl','x509','-pubkey','-noout','-in',str(HOME/'controller.pem')]).stdout)
seen=set();deadline=time.monotonic()+10500
while time.monotonic()<deadline:
    try:
        request('cert',cert)
        job=json.loads(request('job'))
        if not job or job['id'] in seen:time.sleep(3);continue
        if not job['id'].isalnum():raise ValueError('job id')
        (HOME/'payload.cms').write_bytes(base64.b64decode(job['payload'],validate=True))
        (HOME/'payload.sig').write_bytes(base64.b64decode(job['signature'],validate=True))
        verify=run(['openssl','dgst','-sha256','-verify',str(HOME/'controller.pub'),'-signature',str(HOME/'payload.sig'),str(HOME/'payload.cms')])
        if verify.returncode:raise ValueError('signature verification failed')
        decoded=run(['openssl','cms','-decrypt','-binary','-inform','DER','-in',str(HOME/'payload.cms'),'-recip',str(HOME/'cert.pem'),'-inkey',str(HOME/'key.pem')])
        if decoded.returncode:raise ValueError('decrypt failed')
        payload=json.loads(decoded.stdout)
        seen.add(job['id'])
        started=time.time()
        try:
            proc=run(['bash','-c',payload['script']],input=base64.b64decode(payload.get('stdin','')),timeout=min(int(payload.get('timeout',600)),3600))
            result={'exit':proc.returncode,'stdout':base64.b64encode(proc.stdout).decode(),'stderr':base64.b64encode(proc.stderr).decode(),'started_at':started,'finished_at':time.time()}
        except subprocess.TimeoutExpired:
            result={'exit':124,'stdout':'','stderr':'','started_at':started,'finished_at':time.time()}
        raw=json.dumps(result).encode()
        encrypted=run(['openssl','cms','-encrypt','-binary','-outform','DER','-aes-256-cbc',str(HOME/'controller.pem')],input=raw)
        if encrypted.returncode:raise ValueError('result encryption failed')
        for attempt in range(12):
            try:request('result/'+job['id'],encrypted.stdout);break
            except Exception:time.sleep(5)
        (HOME/'payload.cms').unlink(missing_ok=True);(HOME/'payload.sig').unlink(missing_ok=True)
    except Exception:
        time.sleep(5)
