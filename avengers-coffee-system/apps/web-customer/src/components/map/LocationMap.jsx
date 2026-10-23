import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer } from 'react-leaflet';
import { installDetailedBasemap } from './mapBasemap';
import 'leaflet/dist/leaflet.css';
import './storeMap.css';
import { RiFocus3Line, RiMapPin2Fill, RiArrowRightUpLine, RiCloseLine, RiRestartLine, RiNavigationLine } from 'react-icons/ri';
import { coordinates, DEFAULT_MAP_CENTER, decodeHtmlEntities } from '../../lib/locationModel';
import { useUiLanguage } from '../../lib/uiText';

export default function LocationMap({ branches = [], selected = null, onSelect, onViewDetail, height = '100%', searchCenter = null, searchRadiusKm = 5 }) {
  const isEn = useUiLanguage().startsWith('en');
  const copy = (vi, en) => isEn ? en : vi;
  const [instance, setInstance] = useState(null);
  const mapRef = useRef(null);
  const pointsRef = useRef(null);
  const selectedMarker = useRef(null);
  const userMarker = useRef(null);
  const onSelectRef = useRef(onSelect);
  const selectedPoint = coordinates(selected);
  const firstPoint = selectedPoint || branches.map(coordinates).find(Boolean);
  const [initialCenter] = useState(() => firstPoint ? [firstPoint.lat, firstPoint.lng] : DEFAULT_MAP_CENTER);
  const [theme, setTheme] = useState('streets');
  const [retry, setRetry] = useState(0);
  const [tileStatus, setTileStatus] = useState('loading');
  const [dismissedId, setDismissedId] = useState(null);
  const [locationStatus, setLocationStatus] = useState('idle');
  const selectedId = selected?.id || selected?.ma_chi_nhanh;
  const points = useMemo(() => branches.map(branch => ({ branch, point: coordinates(branch) })).filter(item => item.point), [branches]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if (!instance) return;
    const map = instance;
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.attributionControl.setPrefix(false);
    mapRef.current = map;
    pointsRef.current = L.layerGroup().addTo(map);
    const resize = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resize.observe(map.getContainer());
    return () => {
      resize.disconnect();
      map.stop();
      // Remove paths before their canvas renderer; otherwise their teardown may
      // schedule a redraw after the renderer's drawing context has been removed.
      pointsRef.current?.clearLayers();
      selectedMarker.current?.remove();

      mapRef.current = null;
      pointsRef.current = null;
      selectedMarker.current = null;
      userMarker.current = null;
    };
  }, [instance]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    return installDetailedBasemap(L, map, { onLoaded: () => setTileStatus('ready'), onError: () => setTileStatus('error') });
  }, [retry, instance]);

  useEffect(() => {
    const layer = pointsRef.current;
    if (!layer) return;
    // Commit paths after camera/size effects. A cancelled StrictMode mount must
    // never leave a canvas redraw queued for a map that has already been removed.
    const frame = window.requestAnimationFrame(() => {
      layer.clearLayers();
      points.forEach(({ branch, point }) => {
        L.circleMarker([point.lat, point.lng], { radius: 6, color: '#fff', weight: 2, fillColor: '#b22830', fillOpacity: .92, bubblingMouseEvents: false })
          .on('click', () => { onSelectRef.current?.(branch); setDismissedId(null); }).addTo(layer);
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [points, instance]);

  const lat = selectedPoint?.lat;
  const lng = selectedPoint?.lng;
  useEffect(() => {
    const map = mapRef.current;
    selectedMarker.current?.remove();
    if (!map || lat == null || lng == null) return;
    const icon = L.divIcon({ className: 'store-map-pin', html: '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 8h12v7a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V8Zm12 1h2a3 3 0 0 1 0 6h-2M8 3v2m4-2v2m4-2v2"/></svg></span>', iconSize: [40, 48], iconAnchor: [20, 48] });
    selectedMarker.current = L.marker([lat, lng], { icon, zIndexOffset: 1000, keyboard: false, interactive: false }).addTo(map);
    map.stop();
    if (!map.getCenter().equals([lat, lng]) || map.getZoom() !== 14) {
      map.setView([lat, lng], 14, { animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches, duration: .5 });
    }
  }, [lat, lng, instance]);

  useEffect(() => {
    if (!instance || !searchCenter) return;
    const center=[searchCenter.lat,searchCenter.lng];
    const radius=L.circle(center,{radius:searchRadiusKm*1000,color:'#497ac4',weight:1,fillOpacity:.05});
    const marker=L.circleMarker(center,{radius:8,color:'#fff',weight:3,fillColor:'#497ac4',fillOpacity:1});
    const label=document.createElement('span');label.textContent=searchCenter.label || copy('Vị trí tìm kiếm','Search location');
    marker.bindTooltip(label);
    const layer=L.layerGroup([radius,marker]).addTo(instance);
    instance.fitBounds(radius.getBounds(),{padding:[30,30],maxZoom:15,animate:false});
    return () => layer.remove();
  }, [instance, searchCenter, searchRadiusKm, isEn]);

  const centerSelected = () => {
    if (!selectedPoint) return;
    setDismissedId(null);
    mapRef.current?.setView([selectedPoint.lat, selectedPoint.lng], 14, { animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches });
  };
  const fitAll = () => { if (points.length) mapRef.current?.fitBounds(points.map(({ point }) => [point.lat, point.lng]), { padding: [40, 40], maxZoom: 14, animate: false }); };
  const locate = () => {
    if (!navigator.geolocation) { setLocationStatus('error'); return; }
    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition(position => {
      const map = mapRef.current;
      if (!map) return;
      const point = [position.coords.latitude, position.coords.longitude];
      userMarker.current?.remove();
      userMarker.current = L.marker(point, { icon: L.divIcon({ className: 'store-map-user', html: '<span></span>', iconSize: [20, 20] }), interactive: false }).addTo(map);
      map.setView(point, 14, { animate: false });
      setDismissedId(selectedId);
      setLocationStatus('idle');
    }, () => { if (mapRef.current) setLocationStatus('error'); }, { timeout: 8000, maximumAge: 60000, enableHighAccuracy: false });
  };

  return <div className={`store-map ${theme === 'light' ? 'store-map--minimal' : ''}`} style={{ height }} aria-label={copy('Bản đồ cửa hàng', 'Store map')}>
    <MapContainer className="store-map-canvas" ref={setInstance} center={initialCenter} zoom={14} preferCanvas zoomAnimation={false} fadeAnimation={false} markerZoomAnimation={false} zoomControl={false} scrollWheelZoom={false} />
    <div className="store-map-tools"><div className="store-map-style" aria-label={copy('Kiểu bản đồ', 'Map style')}><button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>{copy('Tối giản', 'Minimal')}</button><button type="button" aria-pressed={theme === 'streets'} onClick={() => setTheme('streets')}>{copy('Đường phố', 'Streets')}</button></div><button type="button" className="store-map-center" onClick={centerSelected} disabled={!selectedPoint} title={copy('Định tâm cửa hàng', 'Center on store')} aria-label={copy('Định tâm cửa hàng', 'Center on store')}><RiFocus3Line /></button><button type="button" className="store-map-center" onClick={locate} disabled={locationStatus === 'loading'} title={copy('Vị trí của tôi', 'My location')} aria-label={copy('Vị trí của tôi', 'My location')}><RiNavigationLine /></button></div>
    {locationStatus === 'error' && <div className="store-map-location-error" role="status">{copy('Chưa lấy được vị trí của bạn. Hãy kiểm tra quyền vị trí trong trình duyệt.', 'Your location is unavailable. Check your browser location permission.')}</div>}
    <button type="button" className="store-map-all" onClick={fitAll}>{copy('Xem tất cả điểm trên bản đồ', 'Show all locations')}<RiArrowRightUpLine /></button>
    {tileStatus === 'loading' && <div className="store-map-status" role="status"><span />{copy('Đang tải nền bản đồ…', 'Loading map tiles…')}</div>}
    {(tileStatus === 'error' || tileStatus === 'partial') && <div className="store-map-error" role="status"><p>{tileStatus === 'partial' ? copy('Một phần nền bản đồ chưa tải xong. Bạn có thể tải lại hoặc mở chỉ đường.', 'Some map tiles could not load. You can retry or open directions.') : copy('Nền bản đồ chưa tải được. Bạn vẫn có thể chọn cửa hàng hoặc mở chỉ đường.', 'Map tiles could not load. You can still choose a store or open directions.')}</p><button type="button" onClick={() => { setTileStatus('loading'); setRetry(value => value + 1); }}><RiRestartLine />{copy('Tải lại bản đồ', 'Retry map')}</button></div>}
    {selected && dismissedId !== selectedId && <div className="store-map-card"><button type="button" className="store-map-close" aria-label={copy('Thu gọn thông tin cửa hàng', 'Close store information')} onClick={() => setDismissedId(selectedId)}><RiCloseLine /></button><p className="store-map-eyebrow">AVENGERS COFFEE</p><h3>{decodeHtmlEntities(selected.name || selected.ten_chi_nhanh)}</h3><p className="store-map-address"><RiMapPin2Fill />{decodeHtmlEntities(selected.address || selected.dia_chi)}</p>{selected.hours && <p className="store-map-hours">{selected.hours}</p>}{!selectedPoint && <p className="store-map-coordinates-note">{copy('Cửa hàng chưa có tọa độ bản đồ.', 'Coordinates are not available for this store.')}</p>}<div className="store-map-card-actions"><button type="button" onClick={() => onViewDetail?.(selected)}>{copy('Chi tiết cửa hàng', 'Store details')}<RiArrowRightUpLine /></button><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.address || selected.dia_chi || selected.name)}`} target="_blank" rel="noopener noreferrer">{copy('Chỉ đường', 'Directions')}<RiArrowRightUpLine /></a></div></div>}
    {!points.length && <div className="store-map-empty">{copy('Chưa có tọa độ trong danh sách cửa hàng này.', 'There are no map coordinates in this selection.')}</div>}
  </div>;
}
