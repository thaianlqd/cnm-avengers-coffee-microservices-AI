import { Client } from '@stomp/stompjs';

// REST grants an expiring, order-scoped capability. Never subscribe by ID alone.
export function subscribeShipper({ realtime, baseUrl, orderId, onLocation, onState = () => {} }) {
  if (!realtime?.capability || !/^\/topic\/shippers\/[^/]+$/.test(realtime.topic || '')) return () => {};
  const url = new URL('/tracking-stomp',baseUrl);
  url.protocol = url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:';
  let stopped=false,lastTimestamp=0;
  const client = new Client({ brokerURL:url.href,
    connectHeaders:{ 'tracking-capability':realtime.capability },
    reconnectDelay:5000, connectionTimeout:7000, heartbeatIncoming:0, heartbeatOutgoing:0,
    debug:() => {},
    onConnect:() => {
      if (stopped) return;
      client.subscribe(realtime.topic,message => {
        if (stopped) return;
        try {
          const p=JSON.parse(message.body),timestamp=Date.parse(p.updated_at);
          if (String(p.ma_don_hang)!==String(orderId) || realtime.topic!==`/topic/shippers/${p.shipper_id}` ||
            !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude) || Math.abs(p.latitude)>90 || Math.abs(p.longitude)>180 ||
            !Number.isFinite(timestamp) || timestamp<=lastTimestamp) return;
          lastTimestamp=timestamp;onLocation(p);onState(true);
        } catch { /* Reject malformed GPS without dropping REST status updates. */ }
      });
    },
    onWebSocketClose:() => onState(false), onStompError:() => onState(false), onWebSocketError:() => onState(false),
  });
  client.activate();
  return () => { stopped=true;client.deactivate(); };
}
