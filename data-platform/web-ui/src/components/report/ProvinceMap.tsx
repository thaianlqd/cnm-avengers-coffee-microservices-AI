import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { loadMapRenderer } from '../../utils/loadMapRenderer';
import { geometryBounds, geometryPath } from '../../utils/provinceMap.mjs';
import { locateGeography, projectPoint } from '../../utils/reportGeography.mjs';
import { foldSearch } from '../../utils/dashboardDiscovery.mjs';
import { formatChartValue } from '../../utils/aiChartConfig.mjs';
import { storePointFeatures } from '../../utils/storeMap.mjs';
import { addStorePinImages, storeMapPopup } from '../../utils/storeMapPresentation';

const STYLES: Record<string,string> = { street:'/map-styles/avengers-streets.json', detailed:'https://tiles.openfreemap.org/styles/liberty', light:'https://tiles.openfreemap.org/styles/positron' };
const LOCAL_STYLE = { version:8, sources:{}, layers:[{ id:'land',type:'background',paint:{'background-color':'#eef4f8'} }] };
const COUNTRY_BOUNDS = [[102,8.1],[110,23.7]];
const EMPTY_STORES:any[]=[];
export type ProvinceMapHandle = { zoomIn:()=>void;zoomOut:()=>void;reset:()=>void;exportSvg:()=>void;fullscreen:()=>void };
type Props = { data:any; selectedRow:number|null; selectedProvince:string|null; onSelect:(row:number|null,name:string)=>void; opacity:number; labels:boolean; basemap:string; search:string; unit:string; regional:boolean; onNotice:(text:string)=>void; stores?:any[]; selectedStore?:string|null; onStore?:(id:string,openDetails?:boolean)=>void; showStores?:boolean; storeMetric?:string; viewMode?:'provinces'|'stores';clusterStores?:boolean };

/** Native MapLibre camera + local province polygons. Source rows never leave the browser. */
export const ProvinceMap = forwardRef<ProvinceMapHandle,Props>(({ data,selectedRow,selectedProvince,onSelect,opacity,labels,basemap,search,unit,regional,onNotice,stores=EMPTY_STORES,selectedStore=null,onStore,showStores=true,storeMetric='revenue',viewMode='provinces',clusterStores=true },ref) => {
  const pinned=useRef<any>(null),pinnedStore=useRef<string|null>(null),hoverPopup=useRef<any>(null);
  const [visibleStores,setVisibleStores]=useState(0),[visiblePins,setVisiblePins]=useState(0);
  const element=useRef<HTMLDivElement>(null), frame=useRef<HTMLDivElement>(null), native=useRef<any>(null), fallback=useRef<SVGSVGElement>(null);
  const points=useMemo(()=>storePointFeatures(showStores?stores:[],storeMetric),[stores,showStores,storeMetric]);
  const latest=useRef({data,selectedRow,selectedProvince,onSelect,opacity,labels,search,unit,regional,points,selectedStore,onStore,storeMetric,viewMode,clusterStores});
  latest.current={data,selectedRow,selectedProvince,onSelect,opacity,labels,search,unit,regional,points,selectedStore,onStore,storeMetric,viewMode,clusterStores};
  const [ready,setReady]=useState(false),[camera,setCamera]=useState('country'),[svgZoom,setSvgZoom]=useState(1),[baseState,setBaseState]=useState('Đang nạp nền đường phố…');
  const paths=useMemo(()=>data.features.map((feature:any)=>({...feature,path:geometryPath(feature.geometry)})),[data]);
  const selectedFeature=data.features.find((f:any)=>f.properties.name===selectedProvince);
  const selectedPlace=selectedProvince ? locateGeography(selectedProvince,'city') : null;
  const center=selectedPlace ? projectPoint(selectedPlace.coordinates) : [300,250];
  const svgView=svgZoom===1?'0 0 600 500':`${center[0]-300/svgZoom} ${center[1]-250/svgZoom} ${600/svgZoom} ${500/svgZoom}`;

  const addLayers=(styleEvent=false)=>{
    const map=native.current;if(!map)return;
    const state=latest.current;
    if(map.getSource('province-data')) map.getSource('province-data').setData(state.data);
    else {
      if(!styleEvent&&!map.isStyleLoaded())return;
      map.addSource('province-data',{type:'geojson',data:state.data});
      const before=map.getStyle().layers.find((layer:any)=>layer.type==='symbol'&&layer.layout?.['text-field'])?.id;
      map.addLayer({id:'province-fill',type:'fill',source:'province-data',paint:{'fill-color':['get','color'],'fill-opacity':state.opacity}},before);
      map.addLayer({id:'province-border',type:'line',source:'province-data',paint:{'line-color':'#fff','line-width':['interpolate',['linear'],['zoom'],4,.7,8,1.5]}},before);
      map.addLayer({id:'province-selected',type:'line',source:'province-data',filter:['==',['get','name'],''],paint:{'line-color':'#2563eb','line-width':2}});
    }
    if(map.getStyle().glyphs && !map.getLayer('province-names')) {
      const points={type:'FeatureCollection',features:state.data.features.flatMap((f:any)=>{
        const place=locateGeography(f.properties.name,'city');return place?[{type:'Feature',properties:{name:f.properties.name,storeCount:f.properties.storeCount||0,networkKnown:f.properties.networkKnown||false},geometry:{type:'Point',coordinates:place.coordinates}}]:[];
      })};
      map.addSource('province-labels',{type:'geojson',data:points});
      map.addLayer({id:'province-names',type:'symbol',source:'province-labels',minzoom:4.5,maxzoom:9,layout:{'text-field':['get','name'],'text-font':['Noto Sans Regular'],'text-size':['interpolate',['linear'],['zoom'],4,10,8,12],'text-max-width':8,'visibility':state.labels?'visible':'none'},paint:{'text-color':'#172554','text-halo-color':'#fff','text-halo-width':1.8}});
    }
    if(map.getSource('province-labels'))map.getSource('province-labels').setData({type:'FeatureCollection',features:state.data.features.flatMap((f:any)=>{const p=locateGeography(f.properties.name,'city');return p?[{type:'Feature',properties:{name:f.properties.name,storeCount:f.properties.storeCount||0,networkKnown:f.properties.networkKnown||false},geometry:{type:'Point',coordinates:p.coordinates}}]:[];})});
    addStorePinImages(map);
    if(map.getSource('store-points'))map.getSource('store-points').setData(state.points);
    else{
      map.addSource('store-points',{type:'geojson',data:state.points,cluster:true,clusterMaxZoom:12,clusterRadius:45});
      map.addLayer({id:'store-cluster-halo',type:'circle',source:'store-points',filter:['has','point_count'],paint:{'circle-color':'#bfdbfe','circle-opacity':.55,'circle-radius':['step',['get','point_count'],21,20,25,100,29]}});
      map.addLayer({id:'store-clusters',type:'circle',source:'store-points',filter:['has','point_count'],paint:{'circle-color':'#2563eb','circle-radius':['step',['get','point_count'],15,20,19,100,23],'circle-stroke-width':2.5,'circle-stroke-color':'#fff'}});
      map.addLayer({id:'store-selected',type:'circle',source:'store-points',filter:['==',['get','storeId'],''],paint:{'circle-color':'#2563eb','circle-opacity':.12,'circle-radius':24,'circle-translate':[0,-25],'circle-stroke-color':'#2563eb','circle-stroke-opacity':.3,'circle-stroke-width':2}});
      map.addLayer({id:'store-markers',type:'symbol',source:'store-points',filter:['!', ['has','point_count']],layout:{'icon-image':['concat','store-pin-',['case',['in',['get','storeType'],['literal',['CHI_NHANH_CHINH','KIOSK_NHUONG_QUYEN','KIOSK_VE_TINH']]],['get','storeType'],'CHI_NHANH_CHINH']],'icon-size':['interpolate',['linear'],['zoom'],4,.65,12,.85,15,1],'icon-anchor':'bottom','icon-allow-overlap':true,'icon-ignore-placement':true}});
    }
    if(map.getSource('store-individuals'))map.getSource('store-individuals').setData(state.points);
    else map.addSource('store-individuals',{type:'geojson',data:state.points});
    if(!map.getLayer('store-individual-markers')){
      const marker=map.getStyle().layers.find((layer:any)=>layer.id==='store-markers');
      map.addLayer({...marker,id:'store-individual-markers',source:'store-individuals'});
    }
    if(map.getStyle().glyphs&&!map.getLayer('store-counts')){
      map.addLayer({id:'store-counts',type:'symbol',source:'store-points',filter:['has','point_count'],layout:{'text-field':['to-string',['get','point_count_abbreviated']],'text-font':['Noto Sans Regular'],'text-size':12},paint:{'text-color':'#fff'}});
      map.addLayer({id:'store-names',type:'symbol',source:'store-points',minzoom:13,filter:['!', ['has','point_count']],layout:{'text-field':['get','name'],'text-font':['Noto Sans Regular'],'text-size':11,'text-offset':[0,.4],'text-anchor':'top','text-max-width':14},paint:{'text-color':'#0f172a','text-halo-color':'#fff','text-halo-width':2}});
    }
    if(map.getLayer('store-selected'))map.setFilter('store-selected',['==',['get','storeId'],state.selectedStore||'']);
    updateSelection();updateSearch();updateMode();
  };
  const updateMode=()=>{
    const map=native.current;if(!map?.getLayer('province-fill'))return;
    const state=latest.current,overview=state.viewMode==='provinces';
    for(const id of ['store-cluster-halo','store-clusters','store-counts','store-markers','store-individual-markers','store-selected'])if(map.getLayer(id))map.setLayerZoomRange(id,0,24);
    for(const id of ['store-cluster-halo','store-clusters','store-counts','store-markers'])if(map.getLayer(id))map.setLayoutProperty(id,'visibility',state.clusterStores?'visible':'none');
    if(map.getLayer('store-individual-markers'))map.setLayoutProperty('store-individual-markers','visibility',state.clusterStores?'none':'visible');
    if(map.getLayer('province-names'))map.setLayoutProperty('province-names','visibility',overview&&state.labels?'visible':'none');
    map.setPaintProperty('province-border','line-opacity',overview?.8:.22);
    map.setPaintProperty('province-selected','line-opacity',overview?1:.4);
    // Keep the province comparison free of road shields and neighbourhood labels;
    // the normal street labels return as the user approaches store zoom.
    const detailOpacity=overview?['interpolate',['linear'],['zoom'],4,0,9,0,12,1]:1;
    for(const layer of map.getStyle().layers){
      if(layer.type==='symbol'&&['transportation_name','place','poi','aerodrome_label'].includes(layer['source-layer'])){
        if(layer.layout?.['text-field'])map.setPaintProperty(layer.id,'text-opacity',detailOpacity);
        if(layer.layout?.['icon-image'])map.setPaintProperty(layer.id,'icon-opacity',detailOpacity);
      }
    }
  };
  const updateSelection=()=>{
    const map=native.current,state=latest.current;if(!map?.getLayer('province-selected'))return;
    map.setFilter('province-selected',state.selectedProvince?['==',['get','name'],state.selectedProvince]:state.selectedRow!=null?['==',['get','rowIndex'],state.selectedRow]:['==',['get','name'],'']);
  };
  const updateSearch=()=>{
    const map=native.current,state=latest.current;if(!map?.getLayer('province-fill'))return;
    const names=state.data.features.filter((f:any)=>!state.search||f.properties.searchKey.includes(foldSearch(state.search))).map((f:any)=>f.properties.name);
    const match=['in',['get','name'],['literal',names]];
    const focus=(value:number)=>state.selectedProvince?['case',['==',['get','name'],state.selectedProvince],value,value*.24]:value;
    const fill=(value:number)=>state.search?['case',match,focus(value),.06]:focus(value);
    map.setPaintProperty('province-fill','fill-opacity',['interpolate',['linear'],['zoom'],4,state.viewMode==='stores'?.025:fill(state.opacity),9,state.viewMode==='stores'?.015:fill(state.opacity*.8),12,0]);
  };

  useEffect(()=>{
    let disposed=false,observer:ResizeObserver|undefined;
    loadMapRenderer().then(gl=>{
      if(disposed||!element.current)return;
      let map:any;
      try { map=new gl.Map({container:element.current,style:LOCAL_STYLE,center:[106.1,16.1],zoom:4.3,minZoom:3,maxZoom:18,renderWorldCopies:false,preserveDrawingBuffer:false,attributionControl:false}); }
      catch { setBaseState('Thiết bị chưa bật WebGL · đang dùng địa giới chi tiết');return; }
      native.current=map;
      // Set the initial camera immediately: a late basemap load must never
      // reset a store the user has already selected at street level.
      map.fitBounds(COUNTRY_BOUNDS,{padding:28,duration:0});
      map.addControl(new gl.AttributionControl({compact:true,customAttribution:'Địa giới 2020: Government of Viet Nam / HDX · geoBoundaries · <a href="/map-styles/README.md" target="_blank">Streets style</a>'}),'bottom-right');
      map.addControl(new gl.NavigationControl({showCompass:false}),'bottom-right');
      map.addControl(new gl.ScaleControl({unit:'metric'}),'bottom-left');
      map.on('style.load',()=>{if(disposed)return;addLayers(true);setReady(true);});
      map.on('idle',()=>{
        if(disposed||!map.getLayer('store-markers'))return;
        const markers=map.queryRenderedFeatures({layers:['store-markers','store-individual-markers']});
        const clusters=map.queryRenderedFeatures({layers:['store-clusters']});
        setVisiblePins(new Set(markers.map((f:any)=>f.properties.storeId)).size);
        setVisibleStores(new Set(markers.map((f:any)=>f.properties.storeId)).size+clusters.reduce((n:number,f:any)=>n+Number(f.properties.point_count||0),0));
      });
      const fitStorePopup=()=>{
        const card=pinned.current?.getElement();if(!card||!element.current||!pinned.current.isOpen())return;
        const a=card.getBoundingClientRect(),b=element.current.getBoundingClientRect(),pad=14;
        const dx=a.left<b.left+pad?a.left-b.left-pad:a.right>b.right-pad?a.right-b.right+pad:0;
        const dy=a.top<b.top+pad?a.top-b.top-pad:a.bottom>b.bottom-pad?a.bottom-b.bottom+pad:0;
        if(Math.abs(dx)>1||Math.abs(dy)>1)map.panBy([dx,dy],{duration:220});
      };
      map.on('moveend',fitStorePopup);
      map.on('moveend',()=>{if(!disposed)setCamera(`${map.getCenter().lng.toFixed(3)},${map.getCenter().lat.toFixed(3)},${map.getZoom().toFixed(2)}`);});
      const popup=new gl.Popup({closeButton:false,closeOnClick:false,offset:12,maxWidth:'225px',className:'province-hover-popup'});
      hoverPopup.current=popup;
      pinned.current=new gl.Popup({closeButton:true,closeOnClick:false,maxWidth:'310px',className:'store-map-popup',anchor:'bottom',offset:[0,-43]});
      map.on('mousemove',(event:any)=>{
        if(!map.getLayer('province-fill'))return;
        if(map.getLayer('store-markers')){
          const point=map.queryRenderedFeatures(event.point,{layers:['store-markers','store-individual-markers','store-clusters']})[0];
          if(point){map.getCanvas().style.cursor='pointer';popup.remove();return;}
        }
        if(pinned.current?.isOpen()||latest.current.selectedStore||latest.current.viewMode==='stores'||map.getZoom()>=10){popup.remove();map.getCanvas().style.cursor='';return;}
        const feature=map.queryRenderedFeatures(event.point,{layers:['province-fill']})[0];
        map.getCanvas().style.cursor=feature?'pointer':'';
        if(!feature){popup.remove();return;}
        const box=document.createElement('div');box.className='province-tooltip';
        const title=document.createElement('strong');title.textContent=feature.properties.name;box.append(title);
        const value=document.createElement('p');value.textContent=feature.properties.hasData?`${latest.current.regional?'Tổng '+feature.properties.group+': ':''}${formatChartValue(Number(feature.properties.value),latest.current.unit)}`:'Chưa có giá trị trong báo cáo';box.append(value);
        if(feature.properties.networkKnown){const count=document.createElement('p');count.textContent=feature.properties.storeCount>0?`${feature.properties.storeCount} điểm bán trong dữ liệu`:'Chưa có điểm bán trong phạm vi này';box.append(count);if(feature.properties.storeCount>0){const hint=document.createElement('small');hint.textContent='Bấm để mở cửa hàng, doanh số và bảng xếp hạng.';box.append(hint);}}
        if(latest.current.regional){const note=document.createElement('small');note.textContent='Giá trị của nhóm miền; không phải số liệu riêng của tỉnh.';box.append(note);}
        popup.setLngLat(event.lngLat).setDOMContent(box).addTo(map);
      });
      map.on('mouseout',()=>popup.remove());
      map.on('click',(event:any)=>{
        if(map.getLayer('store-markers')){
          const feature=map.queryRenderedFeatures(event.point,{layers:['store-clusters','store-markers','store-individual-markers']})[0];
          if(feature){
            if(feature.properties.cluster){
              popup.remove();
              const focus=(error:any,zoom:number)=>{if(!error)map.easeTo({center:feature.geometry.coordinates,zoom:Math.min(zoom,16),duration:400});};
              const expansion=map.getSource('store-points').getClusterExpansionZoom(feature.properties.cluster_id,focus);
              if(expansion?.then)expansion.then((zoom:number)=>focus(null,zoom)).catch(()=>{});
              return;
            }
            popup.remove();
            const p=feature.properties; pinnedStore.current=p.storeId;
            const box=storeMapPopup(p,()=>latest.current.onStore?.(p.storeId,true));
            pinned.current.setLngLat(feature.geometry.coordinates).setDOMContent(box).addTo(map);
            requestAnimationFrame(()=>{if(!disposed)fitStorePopup();});
            latest.current.onStore?.(p.storeId);return;
          }
        }
        if(!map.getLayer('province-fill'))return;
        if(map.getZoom()>=11){popup.remove();pinned.current?.remove();return;}
        const feature=map.queryRenderedFeatures(event.point,{layers:['province-fill']})[0];
        if(feature)latest.current.onSelect(feature.properties.rowIndex>=0?feature.properties.rowIndex:null,feature.properties.name);
      });
      map.on('webglcontextlost',()=>{if(!disposed){setReady(false);setBaseState('Nền đồ họa tạm ngắt · địa giới chi tiết vẫn sẵn sàng');}});
      observer=new ResizeObserver(()=>map.resize());observer.observe(element.current);
    }).catch(()=>{if(!disposed)setBaseState('Đang dùng địa giới chi tiết ngoại tuyến');});
    return()=>{disposed=true;observer?.disconnect();native.current?.remove();native.current=null;};
  },[]);

  useEffect(()=>{if(ready)addLayers();},[data,points,ready]);
  useEffect(()=>{pinned.current?.remove();pinnedStore.current=null;},[points]);
  useEffect(()=>{if(selectedStore)hoverPopup.current?.remove();if(selectedStore!==pinnedStore.current)pinned.current?.remove();},[selectedStore]);
  useEffect(()=>{hoverPopup.current?.remove();},[viewMode]);
  useEffect(()=>{
    const map=native.current;if(!map||!ready)return;
    if(map.getLayer('store-selected'))map.setFilter('store-selected',['==',['get','storeId'],selectedStore||'']);
    const point=points.features.find((p:any)=>p.properties.storeId===selectedStore);
    if(point)map.flyTo({center:point.geometry.coordinates,zoom:15,duration:500});
  },[selectedStore,ready,points]);
  useEffect(()=>{
    updateSelection();if(selectedStore||!selectedFeature||!native.current)return;
    const coords=points.features.map((p:any)=>p.geometry.coordinates);
    const bounds=!clusterStores&&coords.length?[[Math.min(...coords.map((c:any)=>c[0])),Math.min(...coords.map((c:any)=>c[1]))],[Math.max(...coords.map((c:any)=>c[0])),Math.max(...coords.map((c:any)=>c[1]))]]:geometryBounds(selectedFeature.geometry);
    native.current.fitBounds(bounds,{padding:65,maxZoom:!clusterStores&&coords.length?12:9,duration:450});
  },[selectedProvince,selectedRow,selectedStore,ready,points]);
  useEffect(()=>{updateSearch();updateMode();},[search,opacity,viewMode,selectedProvince,clusterStores,ready]);
  useEffect(()=>{const map=native.current;if(map?.getLayer('province-names'))map.setLayoutProperty('province-names','visibility',labels&&viewMode==='provinces'?'visible':'none');},[labels,viewMode,ready]);
  useEffect(()=>{
    const map=native.current;if(!map||!ready)return;
    let disposed=false;const controller=new AbortController();
    if(basemap==='boundaries'){map.setStyle(LOCAL_STYLE);setBaseState('Chỉ địa giới · không tải nền ngoài');return;}
    setVisiblePins(0);setVisibleStores(0);
    setBaseState('Đang nạp nền đường phố…');
    fetch(STYLES[basemap]||STYLES.street,{signal:controller.signal}).then(async response=>{
      if(!response.ok)throw Error('basemap');const style=await response.json();
      if(!disposed){map.setStyle(style);setBaseState(basemap==='street'?'Nền đường phố OpenFreeMap · Streets':'Nền đường phố OpenFreeMap');}
    }).catch(()=>{if(!disposed)setBaseState('Nền ngoài chưa tải được · địa giới vẫn hiển thị');});
    return()=>{disposed=true;controller.abort();};
  },[basemap,ready]);

  useImperativeHandle(ref,()=>({
    zoomIn:()=>{if(native.current)native.current.zoomIn({duration:250});setSvgZoom(z=>Math.min(8,z+.5));setCamera(String(Date.now()));},
    zoomOut:()=>{if(native.current)native.current.zoomOut({duration:250});setSvgZoom(z=>Math.max(1,z-.5));setCamera(String(Date.now()));},
    reset:()=>{native.current?.fitBounds(COUNTRY_BOUNDS,{padding:28,duration:350});setSvgZoom(1);setCamera('country');},
    fullscreen:()=>{if(document.fullscreenElement)void document.exitFullscreen();else void frame.current?.requestFullscreen().catch(()=>onNotice('Trình duyệt chưa cho phép toàn màn hình.'));},
    exportSvg:()=>{
      if(!fallback.current)return;const copy=fallback.current.cloneNode(true) as SVGSVGElement;
      copy.removeAttribute('class');copy.removeAttribute('aria-hidden');copy.setAttribute('xmlns','http://www.w3.org/2000/svg');copy.setAttribute('viewBox','0 0 600 500');copy.setAttribute('width','1200');copy.setAttribute('height','1000');
      const text=document.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('x','12');text.setAttribute('y','490');text.setAttribute('font-size','7');text.textContent='Địa giới 2020 · Government of Viet Nam / HDX · geoBoundaries · CC BY 3.0 IGO';copy.append(text);
      const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml'}));const a=document.createElement('a');a.href=url;a.download='ban-do-tinh-thanh.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);onNotice('Đã xuất lớp địa giới và màu chỉ số ra SVG; nền đường phố không nằm trong tệp.');
    },
  }));
  return <div ref={frame} className="province-map-frame" data-province-map data-map-engine={ready?'maplibre':'svg'} data-map-camera={camera} data-map-store-markers={visiblePins} data-map-store-count={visibleStores} data-map-clustered={clusterStores} data-map-view={viewMode}>
    <div ref={element} className="province-map-native" aria-label="Bản đồ đường phố tương tác; dùng mũi tên để di chuyển, cộng trừ để phóng to" />
    <svg ref={fallback} viewBox={svgView} role="group" aria-label="Địa giới 63 tỉnh/thành năm 2020" aria-hidden={ready} className={`province-map-fallback ${ready?'province-map-fallback-hidden':''}`}>
      <rect width="600" height="500" fill="#eef4f8" />
      {paths.map((feature:any)=><path key={feature.id} data-province-boundary data-province-name={feature.properties.name} data-row-index={feature.properties.rowIndex} data-has-value={feature.properties.hasData}
        d={feature.path} fill={feature.properties.color} fillOpacity={viewMode==='stores'?.06:search&&!feature.properties.searchKey.includes(foldSearch(search))?.18:opacity} stroke={selectedProvince===feature.properties.name?'#2563eb':'white'} strokeWidth={selectedProvince===feature.properties.name?1.7:.45}
        role="button" tabIndex={ready?-1:0} aria-label={`${feature.properties.name}: ${feature.properties.hasData?formatChartValue(feature.properties.value,unit):'Chưa có giá trị'}`}
        onClick={()=>onSelect(feature.properties.rowIndex>=0?feature.properties.rowIndex:null,feature.properties.name)} onKeyDown={e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();onSelect(feature.properties.rowIndex>=0?feature.properties.rowIndex:null,feature.properties.name);}}}>
        <title>{feature.properties.name}: {feature.properties.hasData?formatChartValue(feature.properties.value,unit):'Chưa có giá trị'}</title>
      </path>)}
      {labels&&viewMode==='provinces'&&paths.map((feature:any)=>{const place=locateGeography(feature.properties.name,'city');if(!place)return null;const [x,y]=projectPoint(place.coordinates);return <text key={feature.id} x={x} y={y} textAnchor="middle" fontSize="5.5" fill="#172554" stroke="white" strokeWidth="1.4" paintOrder="stroke" pointerEvents="none">{feature.properties.name}</text>;})}
      {points.features.map((point:any)=>{const [x,y]=projectPoint(point.geometry.coordinates);return <circle key={point.id} data-store-point={point.id} cx={x} cy={y} r={selectedStore===point.id?4:2.5} fill={point.properties.color} stroke="white" strokeWidth=".6" role="button" tabIndex={ready?-1:0} aria-label={`Cửa hàng ${point.properties.name}`} onClick={()=>onStore?.(point.id)} onKeyDown={e=>{if(e.key==='Enter')onStore?.(point.id);}}><title>{point.properties.name} · {point.properties.city}</title></circle>;})}
    </svg>
    <span role="status" className="province-basemap-state">{baseState}{ready&&visibleStores>0?` · ${visibleStores} điểm bán trong khung nhìn`:''}</span>
  </div>;
});
