import React, { useEffect, useMemo, useRef } from 'react';
import { GOOGLE_STREET_TILES } from '../web-customer/src/components/map/mapBasemap';

// A sandboxed map document: only coordinates/labels cross the boundary, never auth.
export default function LeafletFrame({ points = [], route = [], selectedId, onSelect, title = 'Bản đồ', height = '100%', followDriver = false, fitToken = 0 }) {
  const frame = useRef(null), latest = useRef(null), select = useRef(onSelect);
  select.current = onSelect;
  latest.current = { channel:'avengers-map', type:'state', points, route, selectedId, followDriver, fitToken };
  const documentHtml = useMemo(() => {
    const origin = window.location.origin;
    return `<!doctype html><html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${origin}/map-libs/leaflet.css"><style>html,body,#map{height:100%;margin:0;font:12px Arial,sans-serif}#notice{position:absolute;z-index:1000;bottom:28px;left:12px;background:white;padding:8px;border-radius:8px;display:none}button{position:absolute;right:12px;top:12px;z-index:1000;background:white;border:1px solid #ddd;border-radius:12px;padding:12px;color:#9b2634;cursor:pointer}.leaflet-tooltip{max-width:180px;white-space:normal}</style></head><body><div id="map"></div><button id="fit" aria-label="Định tâm bản đồ">◎</button><div id="notice" role="status"></div><script src="${origin}/map-libs/leaflet.js"></script><script>
    const map=L.map('map',{scrollWheelZoom:false,zoomControl:false}).setView([16,106],5);L.control.zoom({position:'bottomright'}).addTo(map);map.attributionControl.setPosition('topleft');
    const tiles=L.tileLayer(${JSON.stringify(GOOGLE_STREET_TILES)},{attribution:'Map data © Google',maxZoom:20,keepBuffer:2,updateWhenIdle:true}).addTo(map);
    document.getElementById('map').dataset.basemap='google-streets';
    const notice=document.getElementById('notice');let failures=0;
    tiles.on('tileerror',()=>{if(++failures>=3){notice.textContent='Chưa tải được nền bản đồ. Kiểm tra kết nối mạng.';notice.style.display='block'}});tiles.on('tileload',()=>{failures=0;notice.style.display='none'});
    let pins=new Map(),line=null,first=true,lastSelected,lastFit,state,follow=true;
    const valid=p=>p && Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180;
    const fit=()=>{const ps=(state?.points||[]).filter(valid);if(ps.length)map.fitBounds(ps.map(p=>[p.latitude,p.longitude]),{padding:[45,60],maxZoom:16});follow=true};
    map.on('dragstart',()=>follow=false);document.getElementById('fit').onclick=fit;
    window.addEventListener('message',event=>{
      if(event.source!==parent||event.data?.channel!=='avengers-map'||event.data.type!=='state')return;
      state=event.data;const ps=state.points.filter(valid),ids=new Set();
      ps.forEach(p=>{const id=String(p.id),xy=[p.latitude,p.longitude];ids.add(id);let marker=pins.get(id);
        if(!marker){const colors={store:'#00a77d',driver:'#7945ff',destination:'#ed3f74'};marker=L.circleMarker(xy,{radius:p.kind==='driver'?10:8,color:'#fff',weight:3,fillColor:colors[p.kind]||'#b22830',fillOpacity:1}).addTo(map);pins.set(id,marker);marker.on('click',()=>parent.postMessage({channel:'avengers-map',type:'select',id},'*'))}else marker.setLatLng(xy);
        const label=document.createElement('span');label.textContent=p.label||'';marker.unbindTooltip();marker.bindTooltip(label,{direction:'top',permanent:ps.length<=3,offset:[0,-8]});
      });pins.forEach((marker,id)=>{if(!ids.has(id)){marker.remove();pins.delete(id)}});
      if(line){line.remove();line=null}const road=(state.route||[]).filter(valid);if(road.length>1)line=L.polyline(road.map(p=>[p.latitude,p.longitude]),{color:'#507fe5',weight:5}).addTo(map);
      if(first||lastFit!==state.fitToken){fit();first=false;lastFit=state.fitToken}
      if(state.selectedId!==lastSelected){const p=ps.find(p=>String(p.id)===String(state.selectedId));if(p)map.setView([p.latitude,p.longitude],15);lastSelected=state.selectedId}
      const driver=ps.find(p=>p.kind==='driver');if(driver&&state.followDriver&&follow)map.panTo([driver.latitude,driver.longitude]);
    });new ResizeObserver(()=>map.invalidateSize()).observe(document.body);
    parent.postMessage({channel:'avengers-map',type:'ready'},'*');
    </script></body></html>`;
  }, []);
  useEffect(() => {
    const receive = event => {
      if (event.source !== frame.current?.contentWindow || event.data?.channel !== 'avengers-map') return;
      if (event.data.type === 'ready') frame.current.contentWindow.postMessage(latest.current,'*');
      if (event.data.type === 'select') select.current?.(event.data.id);
    };
    window.addEventListener('message',receive);
    return () => window.removeEventListener('message',receive);
  }, []);
  useEffect(() => { frame.current?.contentWindow?.postMessage(latest.current,'*'); }, [points,route,selectedId,followDriver,fitToken]);
  return <iframe ref={frame} title={title} srcDoc={documentHtml} sandbox="allow-scripts" referrerPolicy="no-referrer" style={{ width:'100%',height,border:0,display:'block' }} />;
}
