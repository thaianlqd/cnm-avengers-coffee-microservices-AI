import { installDetailedBasemap } from '../mapBasemap';
import { useEffect, useRef, useState } from 'react';
import { uiText as ui, useUiLanguage } from '../../lib/uiText';
import { parseMeasuredRoute as parseRoute, MAP_COLORS, JOURNEY_STAGES, journeyProgress, journeyWaypoints, measuredRouteSummary, mapPinHtml } from '../deliveryMapPresentation';
import './DeliveryJourney.css';
const EMPTY = [];
const routeCache = new Map();
export default function ShipperMapView({ shipperLocation = null, storeLocation = null, destinationLocation = null, otherDestinations = EMPTY, shipperName = 'Tài xế', deliveryStatus = '', storeAddress = 'Cửa hàng', height = '440px', onRouteInfo = null }) {
  useUiLanguage();
  const container = useRef(null), map = useRef(null), leaflet = useRef(null), markers = useRef({}), line = useRef(null), follow = useRef(true), fitted = useRef(false), animation = useRef(null);
  const [mapVersion, setMapVersion] = useState(0), [tileError, setTileError] = useState(false), [routeData, setRouteData] = useState(null), [routeError, setRouteError] = useState(false);
  const waypoints = journeyWaypoints({ store:storeLocation, destination:destinationLocation, driver:shipperLocation, status:deliveryStatus, otherDestinations });
  const loaded = mapVersion > 0;
  const callback = useRef(onRouteInfo); callback.current = onRouteInfo;
  const first = waypoints[0], pathKey = JSON.stringify(waypoints.map(p => [p.latitude.toFixed(3),p.longitude.toFixed(3)])), hasPoint = Boolean(first);
  const fitPoints = journeyWaypoints({ store:storeLocation,destination:destinationLocation,driver:shipperLocation,status:'CONFIRMED',otherDestinations });
  const fit = () => { if (map.current && fitPoints.length) map.current.fitBounds(leaflet.current.latLngBounds(fitPoints.map(p => [p.latitude,p.longitude])), { paddingTopLeft:[65,90],paddingBottomRight:[65,55],maxZoom:17 }); };
  useEffect(() => {
    if (!hasPoint) return;
    let stopped = false, observer, disposeBasemap;
    import('leaflet').then(async module => {
      await import('leaflet/dist/leaflet.css');
      if (stopped || !container.current) return;
      const L = module.default || module; leaflet.current = L;
      const instance = L.map(container.current,{ scrollWheelZoom:false, zoomControl:false }).setView([first.latitude,first.longitude],15); map.current = instance;
      const key = import.meta.env.VITE_VIETMAP_TILE_KEY;
      disposeBasemap = installDetailedBasemap(L,instance,{tileKey:key,onLoaded:()=>{if(!stopped)setTileError(false);},onError:()=>{if(!stopped)setTileError(true);}});
      L.control.zoom({ position:'bottomright' }).addTo(instance);
      instance.on('dragstart',() => { follow.current = false; });
      observer = new ResizeObserver(() => instance.invalidateSize()); observer.observe(container.current); setMapVersion(value => value + 1);
    }).catch(() => { if (!stopped) setTileError(true); });
    return () => { stopped = true; disposeBasemap?.(); observer?.disconnect(); cancelAnimationFrame(animation.current); map.current?.remove(); map.current = null; markers.current = {}; line.current = null; fitted.current = false; };
  },[hasPoint]);
  useEffect(() => {
    const L = leaflet.current; if (!loaded || !map.current || !L) return;
    for (const [kind, point, name] of [['store',storeLocation,'Cửa hàng'],['destination',destinationLocation,'Điểm nhận hàng'],['driver',shipperLocation,shipperName]]) {
      const normalized = journeyWaypoints({ destination:point })[0];
      if (!normalized) { markers.current[kind]?.remove(); delete markers.current[kind]; continue; }
      const target = L.latLng(normalized.latitude,normalized.longitude); let marker = markers.current[kind];
      if (!marker) {
        marker = L.marker(target,{ icon:L.divIcon({ html:mapPinHtml(kind),className:'journey-pin',iconSize:[44,54],iconAnchor:[22,52] }) }).addTo(map.current);
        const label = document.createElement('span'); label.textContent = name;
        marker.bindTooltip(label,{ permanent:kind !== 'driver',direction:kind === 'store' ? 'right' : 'left',offset:kind === 'store' ? [20,-26] : [-20,-26],className:'journey-marker-label' });
        const popup = document.createElement('p'); popup.textContent = kind === 'store' ? storeAddress : name; marker.bindPopup(popup); markers.current[kind] = marker;
      } else if (kind !== 'driver') marker.setLatLng(target);
      else {
        cancelAnimationFrame(animation.current); const origin = marker.getLatLng(), started = performance.now();
        const move = now => { if (!map.current) return; const t = Math.min((now-started)/900,1); marker.setLatLng([origin.lat+(target.lat-origin.lat)*t,origin.lng+(target.lng-origin.lng)*t]); if (t < 1) animation.current = requestAnimationFrame(move); }; animation.current = requestAnimationFrame(move);
      }
    }
    if (!fitted.current) { fit(); fitted.current = true; }
    else if (follow.current && shipperLocation) map.current.panTo([shipperLocation.latitude,shipperLocation.longitude],{animate:true});
  },[mapVersion,hasPoint,pathKey,shipperName,storeAddress]);
  useEffect(() => {
    if (!loaded || !map.current) return;
    const key = import.meta.env.VITE_VIETMAP_API_KEY;
    if (!key || waypoints.length < 2) return;
    const controller = new AbortController(), params = new URLSearchParams({ 'api-version':'1.1',apikey:key,vehicle:'motorcycle',points_encoded:'false' });
    waypoints.forEach(point => params.append('point',point.latitude+','+point.longitude));
    const publish = route => {
      if (controller.signal.aborted || !map.current) return;
      if (line.current) line.current.setLatLngs(route.coordinates.map(point => [point.latitude,point.longitude]));
      else line.current = leaflet.current.polyline(route.coordinates.map(point => [point.latitude,point.longitude]),{color:'#507fe5',weight:6,opacity:1,lineCap:'round',lineJoin:'round'}).addTo(map.current);
      setRouteData({ pathKey,...route }); setRouteError(false); callback.current?.({ distance:route.distanceKm,duration:route.durationMinutes });
    };
    const cached = routeCache.get(pathKey);
    if (cached && Date.now()-cached.at < 30000) publish(cached.route);
    else fetch('https://maps.vietmap.vn/api/route?'+params,{signal:controller.signal}).then(response => { if (!response.ok) throw new Error('route'); return response.json(); }).then(payload => {
      const route = parseRoute(payload);
      if (controller.signal.aborted) return;
      if (routeCache.size >= 20) routeCache.delete(routeCache.keys().next().value);
      routeCache.set(pathKey,{at:Date.now(),route}); publish(route);
    }).catch(() => { if (!controller.signal.aborted) setRouteError(true); });
    return () => controller.abort();
  },[mapVersion,hasPoint,pathKey]);
  const progress = journeyProgress(deliveryStatus,Boolean(shipperLocation)), metrics = measuredRouteSummary(routeData?.pathKey === pathKey ? routeData : null);
  if (!hasPoint) return <div className="journey-map-frame" style={{padding:32,color:'#8191a7'}}>Bản đồ sẽ hiển thị khi có tọa độ hành trình.</div>;
  return <div className="journey-map-frame" aria-label="Hành trình giao hàng"><div className="journey-map-canvas"><div ref={container} style={{height,minHeight:360,width:'100%',zIndex:1}} />
    <div className="journey-driver-chip"><span>➤</span><div><b>{shipperLocation ? shipperName : 'Hành trình đơn hàng'}</b><small>{shipperLocation ? 'Vị trí cập nhật từ tài xế' : 'Chưa có vị trí tài xế'}</small></div></div>
    <div className="journey-map-tools"><button type="button" aria-label="Định tâm hành trình" onClick={() => { follow.current = true; fit(); }}>◎</button></div>
    </div><div className="journey-map-sheet journey-map-summary"><div className="journey-sheet-status"><i />{ui(progress.label)}</div>
      {metrics ? <div className="journey-map-metrics"><div><small>THỜI GIAN TUYẾN DỰ KIẾN</small><b>{metrics.duration}</b></div><div><small>KHOẢNG CÁCH ĐƯỜNG BỘ</small><b>{metrics.distance}</b></div></div> : <p className="journey-map-wait">{tileError ? 'Chưa tải được nền bản đồ. Bạn kiểm tra kết nối nhé.' : routeError ? 'Chưa tải được tuyến đường. Bạn tải lại hành trình nhé.' : 'Chờ dữ liệu tuyến đường để tính thời gian và khoảng cách.'}</p>}
      {!progress.closed && <div className="journey-stages">{JOURNEY_STAGES.map((label,index) => <div key={label} className={index <= progress.step ? 'reached' : ''}><span>{index < progress.step ? '✓' : index+1}</span>{label}</div>)}</div>}
      <div className="journey-map-legend">{[['store','Cửa hàng'],['driver','Tài xế'],['destination','Điểm giao']].map(([kind,label]) => <span key={kind}><i style={{background:MAP_COLORS[kind]}} />{label}</span>)}</div>
    </div>
  </div>;
}
