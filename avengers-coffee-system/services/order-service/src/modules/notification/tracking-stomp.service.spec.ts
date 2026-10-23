import { createServer } from 'http';
import { WebSocket } from 'ws';
import { TrackingStompService } from './tracking-stomp.service';

describe('Order-scoped STOMP GPS bridge', () => {
  it('authenticates capabilities, isolates orders, rejects a foreign topic and survives fragmented frames', async () => {
    const http=createServer();
    await new Promise<void>(resolve=>http.listen(0,'127.0.0.1',resolve));
    const bridge=new TrackingStompService({httpAdapter:{getHttpServer:()=>http}} as any);
    bridge.onApplicationBootstrap();
    const sockets:WebSocket[]=[];
    const connect=async()=>{
      const ws=new WebSocket(`ws://127.0.0.1:${(http.address() as any).port}/tracking-stomp`);sockets.push(ws);
      await new Promise<void>((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});return ws;
    };
    const next=(ws:WebSocket)=>new Promise<string>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('No STOMP frame')),2000);
      ws.once('message',data=>{clearTimeout(timer);resolve(data.toString())});
    });
    try {
      const capability=bridge.issue('order-a','shipper-a');
      expect(bridge.verify(capability.capability)?.orderId).toBe('order-a');
      expect(bridge.verify(capability.capability+'tampered')).toBeNull();
      const realNow=Date.now;Date.now=()=>realNow()+900000;
      try { expect(bridge.verify(capability.capability)).toBeNull(); } finally {Date.now=realNow;}
      const good=await connect();let response=next(good);
      good.send(`CONNECT\naccept-version:1.2\ntracking-capability:${capability.capability}\n\n\0`);
      expect(await response).toContain('CONNECTED');
      response=next(good);good.send('SUBSCRIBE\nid:gps\ndestination:/topic/shippers/');
      good.send('shipper-a\nreceipt:subscribed\n\n\0');expect(await response).toContain('RECEIPT');
      const messages:string[]=[];good.on('message',d=>messages.push(d.toString()));
      bridge.publish('order-b',{shipper_id:'shipper-a',latitude:10,longitude:106});
      bridge.publish('order-a',{shipper_id:'shipper-b',latitude:10,longitude:106});
      bridge.publish('order-a',{shipper_id:'shipper-a',latitude:999,longitude:106});
      response=next(good);bridge.publish('order-a',{shipper_id:'shipper-a',latitude:10,longitude:106,updated_at:'2026-10-23T00:00:00Z'});
      expect(await response).toContain('"ma_don_hang":"order-a"');expect(messages).toHaveLength(1);
      response=next(good);good.send('SUBSCRIBE\nid:other\ndestination:/topic/shippers/shipper-b\n\n\0');
      expect(await response).toContain('ERROR');
      const bad=await connect();response=next(bad);bad.send('CONNECT\ntracking-capability:fake\n\n\0');expect(await response).toContain('ERROR');
    } finally {for(const ws of sockets)ws.terminate();bridge.onModuleDestroy();await new Promise<void>(resolve=>http.close(()=>resolve()));}
  });
});
