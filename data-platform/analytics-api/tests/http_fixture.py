"""Tiny in-process ASGI HTTP boundary fixture, no external network/dependencies."""
import asyncio
import json as json_module
from types import SimpleNamespace
from urllib.parse import urlsplit


class Cookies(dict):
    def set(self,key,value): self[key]=value


class ASGIClient:
    def __init__(self,app):self.app,self.cookies=app,Cookies()

    def request(self,method,path,*,headers=None,json=None):
        async def invoke():
            parsed=urlsplit(path)
            body=json_module.dumps(json).encode() if json is not None else b''
            request_headers={'host':'testserver',**{k.lower():v for k,v in (headers or {}).items()}}
            if json is not None:request_headers['content-type']='application/json'
            if self.cookies:request_headers['cookie']='; '.join(k+'='+v for k,v in self.cookies.items())
            scope={'type':'http','asgi':{'version':'3.0'},'http_version':'1.1','method':method,'scheme':'http',
                'path':parsed.path,'raw_path':parsed.path.encode(),'query_string':parsed.query.encode(),
                'root_path':'','headers':[(k.encode(),v.encode()) for k,v in request_headers.items()],
                'server':('testserver',80),'client':('127.0.0.1',5000)}
            messages=[]
            sent=False
            async def receive():
                nonlocal sent
                if not sent:
                    sent=True
                    return {'type':'http.request','body':body,'more_body':False}
                await asyncio.Event().wait()
            async def send(message):messages.append(message)
            await self.app(scope,receive,send)
            start=next(m for m in messages if m['type']=='http.response.start')
            content=b''.join(m.get('body',b'') for m in messages if m['type']=='http.response.body')
            return SimpleNamespace(status_code=start['status'],text=content.decode(),
                json=lambda:json_module.loads(content),headers=dict(start['headers']))
        return asyncio.run(asyncio.wait_for(invoke(),5))

    def get(self,path,**kwargs):return self.request('GET',path,**kwargs)
    def post(self,path,**kwargs):return self.request('POST',path,**kwargs)
