import { MapContainer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchRoadRoute } from '../../lib/maps/deliveryRouting.mjs';
import { installDetailedBasemap } from '../map/mapBasemap';
import { useEffect, useRef, useState } from 'react';
import { uiText as ui, useUiLanguage } from '../../lib/uiText';
import { MAP_COLORS, JOURNEY_STAGES, journeyProgress, journeyWaypoints, measuredRouteSummary, mapPinHtml } from '../map/deliveryMapPresentation';
import './DeliveryJourney.css';
const EMPTY = [];
const routeCache = new Map();
export default function ShipperMapView({ shipperLocation = null, storeLocation = null, destinationLocation = null, otherDestinations = EMPTY, shipperName = 'Tài xế', deliveryStatus = '', storeAddress = 'Cửa hàng', height = '440px', onRouteInfo = null }) {
  useUiLanguage();
  const [instance, setInstance] = useState(null);
  const map = useRef(null), leaflet = useRef(null), markers = useRef({}), line = useRef(null), follow = useRef(true), fitted = useRef(false), animation = useRef(null);
  const [tileError, setTileError] = useState(false), [routeData, setRouteData] = useState(null), [routeError, setRouteError] = useState(false);
  const waypoints = journeyWaypoints({ store:storeLocation, destination:destinationLocation, driver:shipperLocation, status:deliveryStatus, otherDestinations });
  const loaded = Boolean(instance);
  const callback = useRef(onRouteInfo);
  useEffect(() => { callback.current=onRouteInfo; }, [onRouteInfo]);
  const first = waypoints[0], pathKey = JSON.stringify(waypoints.map(p => [p.latitude.toFixed(3),p.longitude.toFixed(3)])), hasPoint = Boolean(first);
  const fitPoints = journeyWaypoints({ store:storeLocation,destination:destinationLocation,driver:shipperLocation,status:'CONFIRMED',otherDestinations });
  const fit = () => { if (map.current && fitPoints.length) map.current.fitBounds(leaflet.current.latLngBounds(fitPoints.map(p => [p.latitude,p.longitude])), { paddingTopLeft:[65,90],paddingBottomRight:[65,55],maxZoom:17 }); };
  useEffect(() => {
    if (!instance) return;
    map.current = instance; leaflet.current = L;
    const dispose = installDetailedBasemap(L, instance, { onLoaded: () => setTileError(false), onError: () => setTileError(true) });
    const zoom = L.control.zoom({ position: 'bottomright' }).addTo(instance);
    const unfollow = () => { follow.current = false; };
    instance.on('dragstart', unfollow);
    const observer = new ResizeObserver(() => instance.invalidateSize({ pan: false })); observer.observe(instance.getContainer());
    return () => { dispose(); observer.disconnect(); instance.off('dragstart', unfollow); zoom.remove(); cancelAnimationFrame(animation.current); Object.values(markers.current).forEach(marker => marker.remove()); line.current?.remove(); map.current = null; markers.current = {}; line.current = null; fitted.current = false; };
  }, [instance]);
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
  },[instance,hasPoint,pathKey,shipperName,storeAddress,shipperLocation?.latitude,shipperLocation?.longitude,storeLocation?.latitude,storeLocation?.longitude,destinationLocation?.latitude,destinationLocation?.longitude]);
  useEffect(() => {
    if (!loaded || !map.current) return;
    const key = import.meta.env.VITE_VIETMAP_API_KEY;
    if (line.current) { line.current.remove(); line.current = null; }
    if (waypoints.length < 2) return;
    const controller = new AbortController();
    const publish = route => {
      if (controller.signal.aborted || !map.current) return;
      if (line.current) line.current.setLatLngs(route.coordinates.map(point => [point.latitude,point.longitude]));
      else line.current = leaflet.current.polyline(route.coordinates.map(point => [point.latitude,point.longitude]),{color:'#507fe5',weight:6,opacity:1,lineCap:'round',lineJoin:'round'}).addTo(map.current);
      setRouteData({ pathKey,...route }); setRouteError(false); callback.current?.({ distance:route.distanceKm,duration:route.durationMinutes });
    };
    const cached = routeCache.get(pathKey);
    if (cached && Date.now()-cached.at < 30000) publish(cached.route);
    else fetchRoadRoute(waypoints, { key, signal: controller.signal }).then(route => {
      if (controller.signal.aborted) return;
      if (routeCache.size >= 20) routeCache.delete(routeCache.keys().next().value);
      routeCache.set(pathKey,{at:Date.now(),route}); publish(route);
    }).catch(() => { if (!controller.signal.aborted) setRouteError(true); });
    return () => controller.abort();
  },[instance,hasPoint,pathKey]);
  const progress = journeyProgress(deliveryStatus,Boolean(shipperLocation)), metrics = measuredRouteSummary(routeData?.pathKey === pathKey ? routeData : null);
  if (!hasPoint) return <div className="journey-map-frame" style={{padding:32,color:'#8191a7'}}>{ui("Bản đồ sẽ hiển thị khi có tọa độ hành trình.")}</div>;
  return <div className="journey-map-frame" aria-label={ui("Hành trình giao hàng")}><div className="journey-map-canvas"><MapContainer ref={setInstance} center={[first.latitude,first.longitude]} zoom={15} scrollWheelZoom={false} zoomControl={false} style={{height,minHeight:360,width:'100%',zIndex:1}} />
    <div className="journey-driver-chip"><span>➤</span><div><b>{shipperLocation ? shipperName : 'Hành trình đơn hàng'}</b><small>{shipperLocation ? 'Vị trí cập nhật từ tài xế' : 'Chưa có vị trí tài xế'}</small></div></div>
    <div className="journey-map-tools"><button type="button" aria-label={ui("Định tâm hành trình")} onClick={() => { follow.current = true; fit(); }}>◎</button></div>
    </div><div className="journey-map-sheet journey-map-summary"><div className="journey-sheet-status"><i />{ui(progress.label)}</div>
      {metrics ? <div className="journey-map-metrics"><div><small>{ui("Thời gian tuyến dự kiến")}</small><b>{metrics.duration}</b></div><div><small>{ui("Khoảng cách đường bộ")}</small><b>{metrics.distance}</b></div></div> : <p className="journey-map-wait">{tileError ? 'Chưa tải được nền bản đồ. Bạn kiểm tra kết nối nhé.' : routeError ? 'Chưa tải được tuyến đường. Bạn tải lại hành trình nhé.' : 'Chờ dữ liệu tuyến đường để tính thời gian và khoảng cách.'}</p>}
      {routeData?.pathKey === pathKey && routeData?.approximate && <p className="journey-map-wait">Tuyến dự phòng OSRM theo đường ô tô; thời gian tham khảo, có thể khác tuyến xe máy.</p>}
      {!progress.closed && <div className="journey-stages">{JOURNEY_STAGES.map((label,index) => <div key={label} className={index <= progress.step ? 'reached' : ''}><span>{index < progress.step ? '✓' : index+1}</span>{label}</div>)}</div>}
      <div className="journey-map-legend">{[['store','Cửa hàng'],['driver','Tài xế'],['destination','Điểm giao']].map(([kind,label]) => <span key={kind}><i style={{background:MAP_COLORS[kind]}} />{label}</span>)}</div>
    </div>
  </div>;
}
