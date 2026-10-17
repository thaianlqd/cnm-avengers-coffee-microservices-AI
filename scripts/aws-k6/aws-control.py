#!/usr/bin/env python3
"""Loopback relay. Accepts certificates and encrypted/signed jobs/results only."""
import hmac,json,re,sys
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
FOLDER=Path(sys.argv[1]);TOKEN=(FOLDER/'token').read_text().strip()
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def handle_request(self):
        if not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+TOKEN):self.send_error(404);return
        match=re.fullmatch(r'/(target[1-4]|generator[1-6])/(cert|job|result/([A-Za-z0-9]+))',self.path)
        if not match:self.send_error(404);return
        role,action,job=match.groups();folder=FOLDER/role;folder.mkdir(exist_ok=True,mode=0o700)
        if self.command=='GET' and action=='job':
            data=(folder/'job.json').read_bytes() if (folder/'job.json').exists() else b'{}'
        elif self.command=='POST' and action!='job':
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=32*1024*1024:self.send_error(413);return
            data=self.rfile.read(size)
            target=folder/('cert.pem' if action=='cert' else job+'.cms')
            if action=='cert' and target.exists() and target.read_bytes()!=data:self.send_error(409);return
            target.write_bytes(data);data=b'OK'
        else:self.send_error(404);return
        self.send_response(200);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    do_GET=handle_request
    do_POST=handle_request
ThreadingHTTPServer(('127.0.0.1',18084),Handler).serve_forever()
