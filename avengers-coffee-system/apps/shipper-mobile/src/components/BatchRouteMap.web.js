import React, { useEffect, useRef } from 'react'
import { loadLeaflet } from '../screens/MapScreen.web'
import { installDetailedBasemap } from '../../../web-customer/src/components/mapBasemap'
import { mapPinHtml } from '../../../web-customer/src/components/deliveryMapPresentation'
import '../../../web-customer/src/components/features_thaian/DeliveryJourney.css'
export default function BatchRouteMap({ stops, coordinates, currentStep }) {
  const element = useRef(null), map = useRef(null), L = useRef(null), pins = useRef(null), line = useRef(null)
  const current = useRef({stops,coordinates,currentStep}); current.current = {stops,coordinates,currentStep}
  const draw = () => {
    if (!map.current || !pins.current) return
    pins.current.clearLayers(); line.current?.remove()
    const state = current.current
    state.stops.forEach((point,index) => {
      if (index < state.currentStep || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return
      const kind = index === state.currentStep ? 'driver' : point.type === 'shop' ? 'store' : 'destination'
      const marker = L.current.marker([point.lat,point.lng],{icon:L.current.divIcon({className:'journey-pin',html:mapPinHtml(kind),iconSize:[44,54],iconAnchor:[22,52]})}).addTo(pins.current)
      const text = document.createElement('span'); text.textContent = kind==='driver' ? 'Bạn · Tài xế' : `${index}. ${point.label}`
      marker.bindTooltip(text,{permanent:true,direction:'top',offset:[0,-47],className:'journey-marker-label'})
    })
    if (state.coordinates.length>1) line.current = L.current.polyline(state.coordinates.map(p=>[p.latitude,p.longitude]),{color:'#507fe5',weight:5}).addTo(map.current)
  }
  useEffect(() => {
    let alive = true,observer,dispose
    loadLeaflet().then(leaflet => {
      if (!alive || !element.current) return
      L.current=leaflet
      const valid=current.current.stops.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)); if (!valid.length) return
      const instance=leaflet.map(element.current,{scrollWheelZoom:false}).setView([valid[0].lat,valid[0].lng],15);map.current=instance
      instance.attributionControl.setPosition('topright')
      dispose=installDetailedBasemap(leaflet,instance,{tileKey:process.env.EXPO_PUBLIC_VIETMAP_TILE_KEY})
      pins.current=leaflet.layerGroup().addTo(instance);draw()
      instance.fitBounds(valid.map(p=>[p.lat,p.lng]),{paddingTopLeft:[50,50],paddingBottomRight:[50,instance.getSize().y*.6],maxZoom:16})
      observer=new ResizeObserver(()=>instance.invalidateSize());observer.observe(element.current)
    }).catch(()=>{})
    return ()=>{alive=false;dispose?.();observer?.disconnect();map.current?.remove();map.current=null}
  },[Boolean(stops.length)])
  useEffect(draw,[stops,coordinates,currentStep])
  return <div ref={element} aria-label="Bản đồ hành trình giao ghép" style={{width:'100%',height:'100%',position:'absolute',inset:0,zIndex:0}} />
}
