// Retina Street tiles retain the existing native map camera and GPS controls.
export const nativeTileUrl = key => key ? 'https://maps.vietmap.vn/tm/{z}/{x}/{y}@2x.png?apikey='+encodeURIComponent(key) : null;
export const detailedNativeStyle = [
  {featureType:'landscape',elementType:'geometry',stylers:[{color:'#f3efe1'}]},
  {featureType:'water',elementType:'geometry',stylers:[{color:'#9ddcf4'}]},
  {featureType:'poi.park',elementType:'geometry',stylers:[{color:'#bde9c4'}]},
  {featureType:'poi',elementType:'labels',stylers:[{visibility:'on'}]},
  {featureType:'transit',elementType:'labels',stylers:[{visibility:'on'}]},
  {featureType:'road',elementType:'geometry',stylers:[{color:'#ffffff'}]},
  {featureType:'road.arterial',elementType:'geometry.stroke',stylers:[{color:'#e8dab7'}]},
  {featureType:'road.highway',elementType:'geometry',stylers:[{color:'#ffda83'}]},
];
