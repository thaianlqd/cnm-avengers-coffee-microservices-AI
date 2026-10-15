import { installDetailedBasemap } from './mapBasemap';
import { useEffect, useRef, useState } from 'react';
import './locationMap.css';
import './features_thaian/DeliveryJourney.css';
import { mapPinHtml } from './deliveryMapPresentation';
const EMPTY = [];
function point(branch) {
  const latitude = branch?.latitude ?? branch?.vi_do, longitude = branch?.longitude ?? branch?.kinh_do;
  if (latitude == null || longitude == null || latitude === '' || longitude === '' || !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude)) || Math.abs(Number(latitude)) > 90 || Math.abs(Number(longitude)) > 180) return null;
  return [Number(latitude),Number(longitude)];
}
export default function LocationMap({ branches = EMPTY, selected, onSelect, tileKey, height = '100%' }) {
  const container = useRef(null), map = useRef(null), layer = useRef(null), L = useRef(null);
  const [ready, setReady] = useState(false), [error, setError] = useState(false);
  const anchor = point(selected) || branches.map(point).find(Boolean);
  const anchorKey = anchor?.join(',');
  useEffect(() => {
    if (!anchor) return;
    let alive = true, observer, disposeBasemap;
    import('leaflet').then(module => {
      if (!alive || !container.current) return;
      L.current = module.default || module;
      const instance = L.current.map(container.current,{ zoomControl:false,scrollWheelZoom:false }).setView(anchor,16);
      map.current = instance;
      L.current.control.zoom({ position:'bottomright' }).addTo(instance);
      disposeBasemap = installDetailedBasemap(L.current,instance,{tileKey,onLoaded:()=>{if(alive)setError(false);},onError:()=>{if(alive)setError(true);}});
      layer.current = L.current.layerGroup().addTo(instance);
      observer = new ResizeObserver(() => instance.invalidateSize()); observer.observe(container.current); setReady(true);
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; disposeBasemap?.(); observer?.disconnect(); map.current?.remove(); map.current = null; layer.current = null; setReady(false); };
  }, [Boolean(anchor),tileKey]);
  useEffect(() => {
    if (!ready || !map.current || !anchor) return;
    layer.current.clearLayers();
    const nearby = branches.filter(b => point(b)).sort((a,b) => {
      const distance = branch => { const p = point(branch); return (p[0]-anchor[0])**2 + (p[1]-anchor[1])**2; };
      return distance(a)-distance(b);
    }).slice(0,60);
    const list = selected && point(selected) ? [selected,...nearby.filter(b => (b.id || b.ma_chi_nhanh) !== (selected.id || selected.ma_chi_nhanh))] : nearby;
    list.forEach(branch => {
      const active = (branch.id || branch.ma_chi_nhanh) === (selected?.id || selected?.ma_chi_nhanh);
      const icon = active ? L.current.divIcon({ className:'journey-pin',html:mapPinHtml('store'),iconSize:[44,54],iconAnchor:[22,52] }) : L.current.divIcon({ className:'',html:'<span style="display:block;width:16px;height:16px;background:#a52a32;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px #24344b55"></span>',iconSize:[16,16],iconAnchor:[8,8] });
      const marker = L.current.marker(point(branch),{ icon }).addTo(layer.current);
      const label = document.createElement('span'); label.textContent = branch.name || branch.ten_chi_nhanh || 'Cửa hàng';
      marker.bindTooltip(label,{ permanent:active,direction:'top',offset:[0,active ? -44 : -6],className:'journey-marker-label' });
      marker.on('click',() => onSelect?.(branch));
    });
    map.current.flyTo(anchor,16,{duration:.4});
  }, [ready,anchorKey,branches,selected,onSelect]);
  return <div className="journey-map-frame location-map" style={{height,minHeight:300}}>
    {anchor ? <div ref={container} style={{height:'100%',minHeight:300,width:'100%'}} aria-label="Bản đồ cửa hàng" /> : <div className="location-map-empty">Chưa có tọa độ cửa hàng để hiển thị.</div>}
    <div className="location-map-caption"><b>{selected?.name || selected?.ten_chi_nhanh || 'Cửa hàng gần bạn'}</b><span>{error ? 'Chưa tải được nền bản đồ. Kiểm tra kết nối nhé.' : selected && !point(selected) ? 'Cửa hàng này chưa có tọa độ. Xem địa chỉ bên dưới.' : selected?.address || selected?.dia_chi || 'Chọn ghim để xem cửa hàng'}</span></div>
    <div className="journey-map-tools"><button type="button" aria-label="Định tâm cửa hàng" onClick={() => { if (anchor) map.current?.setView(anchor,16); }}>◎</button></div>
    {selected && <a className="location-map-directions" href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(selected.address || selected.dia_chi || '')} target="_blank" rel="noopener noreferrer">Chỉ đường ↗</a>}
  </div>;
}
