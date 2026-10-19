"""Temporary loopback relay to a network-none, credential-free fixture only.

Four persistent stdio clients avoid a Docker process startup per browser fetch.
No production route, credentials, external network or configurable destination.
"""
import base64
import json
import os
import queue
import subprocess
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer

PROGRAM='''import sys,json,base64,urllib.request,urllib.error
print(json.dumps({'ready':True}),flush=True)
for line in sys.stdin:
 try:
  v=json.loads(line)
  r=urllib.request.Request('http://127.0.0.1:18881'+v['path'],method=v['method'],headers=v['headers'],data=base64.b64decode(v['body']) if v['body'] else None)
  try:s=urllib.request.urlopen(r,timeout=20)
  except urllib.error.HTTPError as error:s=error
  body=s.read(2000001)
  if len(body)>2000000:raise RuntimeError('Fixture response exceeds bound')
  print(json.dumps({'status':s.status,'headers':list(s.headers.items()),'body':base64.b64encode(body).decode()}),flush=True)
 except Exception:
  print(json.dumps({'status':502,'headers':[],'body':base64.b64encode(b'Fixture relay failed').decode()}),flush=True)
'''


def run():
    if os.getenv('V35_BROWSER_FIXTURE_RELAY')!='1':raise RuntimeError('Explicit fixture relay required')
    clients=queue.Queue(maxsize=4)
    processes=[]
    try:
        for _ in range(4):
            process=subprocess.Popen(['docker','exec','-i','v35-fixture-api-a','python','-u','-c',PROGRAM],
                stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,bufsize=1)
            processes.append(process)
            if json.loads(process.stdout.readline())!={'ready':True}:raise RuntimeError('Fixture relay client failed')
            clients.put(process)
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def relay(self):
                if not self.path.startswith('/api/'):
                    self.send_error(404);return
                length=int(self.headers.get('Content-Length','0'))
                if not 0<=length<=2000000:self.send_error(413);return
                value={'path':self.path,'method':self.command,
                    'headers':{k:v for k,v in self.headers.items() if k.lower() not in {'host','content-length','connection','transfer-encoding'}},
                    'body':base64.b64encode(self.rfile.read(length)).decode()}
                process=clients.get(timeout=25)
                try:
                    process.stdin.write(json.dumps(value)+'\n');process.stdin.flush()
                    response=json.loads(process.stdout.readline())
                finally:clients.put(process)
                body=base64.b64decode(response['body'])
                self.send_response(response['status'])
                for key,value in response['headers']:
                    if key.lower() not in {'connection','content-length','transfer-encoding'}:self.send_header(key,value)
                self.send_header('Content-Length',str(len(body)));self.end_headers()
                try:self.wfile.write(body)
                except (BrokenPipeError,ConnectionResetError):pass
            do_GET=relay
            do_POST=relay
            do_DELETE=relay
            do_PATCH=relay
        ThreadingHTTPServer(('127.0.0.1',18766),Handler).serve_forever()
    finally:
        for process in processes:
            process.stdin.close()
            try:process.wait(timeout=2)
            except subprocess.TimeoutExpired:process.terminate()


if __name__=='__main__':run()
