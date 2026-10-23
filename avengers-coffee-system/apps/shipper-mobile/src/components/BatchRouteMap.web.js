import React from 'react'
import LeafletFrame from '../../../shared-ui/LeafletFrame.web'
export default function BatchRouteMap({stops,coordinates,currentStep}) {
  const points=stops.map((p,index)=>({id:String(index),kind:index===currentStep?'driver':p.type==='shop'?'store':'destination',latitude:p.lat,longitude:p.lng,label:index===currentStep?'Bạn · Tài xế':`${index}. ${p.label}`})).filter((p,index)=>index>=currentStep&&Number.isFinite(p.latitude)&&Number.isFinite(p.longitude))
  return <LeafletFrame title="Bản đồ hành trình giao ghép" points={points} route={coordinates} fitToken={currentStep} />
}
