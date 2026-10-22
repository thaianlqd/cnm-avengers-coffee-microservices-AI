export const STORE_COLORS={CHI_NHANH_CHINH:'#2563eb',KIOSK_NHUONG_QUYEN:'#f59e0b',KIOSK_VE_TINH:'#8b5cf6'};
export function storeCoordinates(store){
  const lat=store.latitude,lon=store.longitude;
  if(lat==null||lon==null||lat===''||lon===''||typeof lat==='boolean'||typeof lon==='boolean')return null;
  const latitude=Number(lat),longitude=Number(lon);
  return Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180&&(latitude!==0||longitude!==0)?[longitude,latitude]:null;
}
export function storePointFeatures(stores=[],metric='revenue'){
  return {type:'FeatureCollection',features:stores.flatMap(store=>{
    const coordinates=storeCoordinates(store);if(!coordinates)return [];
    return [{type:'Feature',id:String(store.store_id),geometry:{type:'Point',coordinates},properties:{
      storeId:String(store.store_id),name:store.store,city:store.city,storeType:store.store_type,
      revenue:store.revenue,orders:store.orders,aov:store.aov,value:store[metric]??null,
      color:STORE_COLORS[store.store_type]||'#64748b',
    }}];
  })};
}
