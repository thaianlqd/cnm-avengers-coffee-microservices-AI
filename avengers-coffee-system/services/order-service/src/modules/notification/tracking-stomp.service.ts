import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { Duplex } from 'stream';

type Access = { orderId: string; shipperId: string; expires: number };
// Read-only STOMP 1.2 endpoint. A shipper topic alone never grants GPS access.
@Injectable()
export class TrackingStompService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly secret = randomBytes(32);
  private server?: WebSocketServer;
  private httpServer: any;
  private sessions = new Map<WebSocket, { connected: boolean; access?: Access; subscriptions: Map<string,string> }>();
  constructor(private readonly adapter: HttpAdapterHost) {}

  issue(orderId: string, shipperId: string) {
    // Stable for five minutes: REST polling does not continuously reconnect GPS.
    const access: Access = { orderId, shipperId, expires:(Math.floor(Date.now()/300000)+2)*300000 };
    const body = Buffer.from(JSON.stringify(access)).toString('base64url');
    const signature = createHmac('sha256',this.secret).update(body).digest('base64url');
    return { endpoint:'/tracking-stomp', topic:`/topic/shippers/${shipperId}`, capability:`${body}.${signature}`, expires_at:new Date(access.expires).toISOString() };
  }
  verify(token: string): Access | null {
    try {
      const [body,signature,...extra] = token.split('.');
      if (extra.length || !body || !signature) return null;
      const expected = createHmac('sha256',this.secret).update(body).digest();
      const actual = Buffer.from(signature,'base64url');
      if (actual.length !== expected.length || !timingSafeEqual(actual,expected)) return null;
      const access = JSON.parse(Buffer.from(body,'base64url').toString());
      return typeof access.orderId === 'string' && typeof access.shipperId === 'string' && Number.isFinite(access.expires) && access.expires > Date.now() ? access : null;
    } catch { return null; }
  }
  private upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (request.url?.split('?')[0] !== '/tracking-stomp') return;
    this.server?.handleUpgrade(request,socket,head,ws => this.server?.emit('connection',ws,request));
  };
  onApplicationBootstrap() {
    this.httpServer = this.adapter.httpAdapter.getHttpServer();
    this.server = new WebSocketServer({ noServer:true, maxPayload:16384, perMessageDeflate:false });
    this.httpServer.on('upgrade',this.upgrade);
    this.server.on('connection',ws => {
      const session = { connected:false, access:undefined as Access|undefined, subscriptions:new Map<string,string>() };
      this.sessions.set(ws,session);
      let buffer = '';
      const timeout = setTimeout(() => { if (!session.connected) ws.close(1008,'CONNECT required'); },5000);
      const fail = () => { if (ws.readyState === WebSocket.OPEN) ws.send('ERROR\nmessage:Tracking subscription rejected\n\n\0'); ws.close(1008,'Unauthorized tracking'); };
      ws.on('error',() => ws.close());
      ws.on('close',() => { clearTimeout(timeout); this.sessions.delete(ws); });
      ws.on('message',data => {
        buffer += data.toString();
        if (Buffer.byteLength(buffer)>16384) { fail(); return; }
        let end: number;
        while ((end=buffer.indexOf('\0')) >= 0) {
          const frame=buffer.slice(0,end).replace(/^\s+/,''); buffer=buffer.slice(end+1);
          const [headText,body='']=frame.split('\n\n');
          const [command,...lines]=headText.replace(/\r/g,'').split('\n');
          const headers:Record<string,string>={};
          for (const line of lines) { const i=line.indexOf(':'); if(i>0) headers[line.slice(0,i)]=line.slice(i+1).replace(/\\n/g,'\n').replace(/\\c/g,':').replace(/\\\\/g,'\\'); }
          if (Object.values(headers).some(value => /[\r\n\0]/.test(value))) { fail(); return; }
          if (!command) continue;
          if (command==='CONNECT' || command==='STOMP') {
            const access=this.verify(headers['tracking-capability']||'');
            if (session.connected || !access) { fail(); return; }
            session.access=access; session.connected=true; clearTimeout(timeout);
            ws.send('CONNECTED\nversion:1.2\nheart-beat:0,0\n\n\0');
            const expiry=setTimeout(() => ws.close(1008,'Tracking capability expired'),access.expires-Date.now());
            ws.once('close',()=>clearTimeout(expiry));
          } else if (!session.connected || !session.access || session.access.expires<=Date.now()) { fail(); return; }
          else if (command==='SUBSCRIBE') {
            if (!headers.id || headers.destination!==`/topic/shippers/${session.access.shipperId}` || session.subscriptions.size>=4 || body) { fail(); return; }
            session.subscriptions.set(headers.id,headers.destination);
          } else if (command==='UNSUBSCRIBE') session.subscriptions.delete(headers.id);
          else if (command==='DISCONNECT') { if(headers.receipt) ws.send(`RECEIPT\nreceipt-id:${headers.receipt}\n\n\0`); ws.close(); return; }
          else { fail(); return; } // SEND/transactions are intentionally unavailable.
          if (headers.receipt) ws.send(`RECEIPT\nreceipt-id:${headers.receipt}\n\n\0`);
        }
        // STOMP heartbeats contain no frames and must not accumulate forever.
        if (!buffer.trim()) buffer='';
      });
    });
  }
  publish(orderId: string, payload: Record<string,any>) {
    const latitude=Number(payload.latitude),longitude=Number(payload.longitude);
    if (payload.latitude==null || payload.longitude==null || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude)>90 || Math.abs(longitude)>180) return;
    for (const [ws,session] of this.sessions) {
      const access=session.access;
      if (!access || access.expires<=Date.now() || access.orderId!==orderId || access.shipperId!==String(payload.shipper_id) || ws.readyState!==WebSocket.OPEN) continue;
      const body=JSON.stringify({ latitude,longitude,shipper_id:access.shipperId,ma_don_hang:orderId,updated_at:payload.updated_at,status:payload.status });
      for(const [id,destination] of session.subscriptions) ws.send(`MESSAGE\nsubscription:${id}\ndestination:${destination}\nmessage-id:${randomBytes(8).toString('hex')}\ncontent-type:application/json\ncontent-length:${Buffer.byteLength(body)}\n\n${body}\0`);
    }
  }
  onModuleDestroy() { this.httpServer?.off('upgrade',this.upgrade); for(const ws of this.sessions.keys()) ws.terminate(); this.server?.close(); }
}
