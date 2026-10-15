// Offline vector style; exercises the real renderer without requesting a provider key.
export const vectorBasemapFixture = {
  version:8, name:'Offline detailed Street fixture',
  sources:{details:{type:'geojson',attribution:'Offline QA · map data fixture',data:{type:'FeatureCollection',features:[
    {type:'Feature',properties:{kind:'park'},geometry:{type:'Polygon',coordinates:[[[106.618,10.801],[106.622,10.801],[106.622,10.804],[106.618,10.804],[106.618,10.801]]]}},
    {type:'Feature',properties:{kind:'water'},geometry:{type:'LineString',coordinates:[[106.617,10.800],[106.622,10.804],[106.627,10.807],[106.630,10.810]]}},
    ...Array.from({length:13},(_,i)=>({type:'Feature',properties:{kind:'road'},geometry:{type:'LineString',coordinates:[[106.615,10.798+i*.001],[106.632,10.798+i*.001]]}})),
    ...Array.from({length:17},(_,i)=>({type:'Feature',properties:{kind:'road'},geometry:{type:'LineString',coordinates:[[106.616+i*.001,10.797],[106.616+i*.001,10.812]]}})),
    ...[[106.620,10.803],[106.626,10.805],[106.623,10.801]].map(coordinates=>({type:'Feature',properties:{kind:'poi'},geometry:{type:'Point',coordinates}})),
  ]}}},layers:[
    {id:'land',type:'background',paint:{'background-color':'#f3efe1'}},
    {id:'parks',type:'fill',source:'details',filter:['==','kind','park'],paint:{'fill-color':'#bce9bf'}},
    {id:'water',type:'line',source:'details',filter:['==','kind','water'],paint:{'line-color':'#92d5ee','line-width':24}},
    {id:'roads',type:'line',source:'details',filter:['==','kind','road'],paint:{'line-color':'#fff','line-width':8}},
    {id:'poi',type:'circle',source:'details',filter:['==','kind','poi'],paint:{'circle-color':'#347cf7','circle-radius':8,'circle-stroke-color':'#fff','circle-stroke-width':2}},
  ]
};
