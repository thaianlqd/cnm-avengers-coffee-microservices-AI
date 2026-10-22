import { STORE_COLORS } from './storeMap.mjs';
import { formatChartValue } from './aiChartConfig.mjs';

const TYPES:Record<string,string>={CHI_NHANH_CHINH:'Chi nhánh chính',KIOSK_NHUONG_QUYEN:'Kiosk nhượng quyền',KIOSK_VE_TINH:'Kiosk vệ tinh'};

/** Code-drawn pins stay local and share the directory's real coordinates. */
export function addStorePinImages(map:any){
  for(const [type,color] of Object.entries(STORE_COLORS)){
    const id='store-pin-'+type;if(map.hasImage(id))continue;
    const canvas=document.createElement('canvas');canvas.width=80;canvas.height=90;
    const ctx=canvas.getContext('2d');if(!ctx)continue;
    ctx.beginPath();ctx.moveTo(40,88);ctx.bezierCurveTo(34,76,10,56,10,35);ctx.arc(40,35,30,Math.PI,0);ctx.bezierCurveTo(70,56,46,76,40,88);ctx.closePath();
    ctx.fillStyle=String(color);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=4;ctx.stroke();
    // Cup, handle, saucer and steam; no font or remote image dependency.
    ctx.strokeStyle='#fff';ctx.lineWidth=3.5;ctx.lineJoin='round';ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(27,30);ctx.lineTo(48,30);ctx.lineTo(48,42);ctx.quadraticCurveTo(48,49,38,49);ctx.quadraticCurveTo(27,49,27,42);ctx.closePath();ctx.stroke();
    ctx.beginPath();ctx.moveTo(49,32);ctx.bezierCurveTo(63,30,62,44,49,42);ctx.moveTo(25,54);ctx.lineTo(54,54);ctx.moveTo(34,23);ctx.bezierCurveTo(28,18,39,17,34,12);ctx.moveTo(44,23);ctx.bezierCurveTo(38,18,49,17,44,12);ctx.stroke();
    map.addImage(id,ctx.getImageData(0,0,80,90),{pixelRatio:2});
  }
}

/** Build text nodes rather than interpolating database names as HTML. */
export function storeMapPopup(properties:any,onOpen:()=>void){
  const box=document.createElement('div');box.className='store-map-card';
  const type=document.createElement('span');type.className='store-map-card-type';type.textContent=TYPES[properties.storeType]||'Điểm bán';box.append(type);
  const title=document.createElement('strong');title.textContent=properties.name;box.append(title);
  const city=document.createElement('p');city.className='store-map-card-city';city.textContent=properties.city||'Chưa xác định tỉnh/thành';box.append(city);
  const metrics=document.createElement('dl');metrics.className='store-map-card-metrics';
  for(const [label,key,suffix] of [['Doanh thu trong kỳ','revenue',' VND'],['Số đơn','orders',' đơn'],['Giá trị đơn TB','aov',' VND']]){
    const group=document.createElement('div'),term=document.createElement('dt'),value=document.createElement('dd');term.textContent=label;
    value.textContent=properties[key]==null?'—':formatChartValue(Number(properties[key]),suffix);group.append(term,value);metrics.append(group);
  }
  box.append(metrics);
  const button=document.createElement('button');button.type='button';button.className='store-map-card-action';button.textContent='Phân tích cửa hàng ↓';button.onclick=onOpen;box.append(button);
  return box;
}
