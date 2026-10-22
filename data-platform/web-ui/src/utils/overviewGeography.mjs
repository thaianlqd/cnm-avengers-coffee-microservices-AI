import { locateGeography } from './reportGeography.mjs';

const numeric = value => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const sum = (rows, field) => rows.every(row => Number.isFinite(row[field])) ? rows.reduce((total, row) => total + row[field], 0) : null;
/** Reuse the already scoped overview directory; no AI job, fake session or GPS. */
export function overviewGeography(directory, dateRange, referenceDate, cohort = 'all') {
  const labels = {today:'Hôm nay', '7days':'7 ngày qua', '14days':'14 ngày qua', '30days':'30 ngày qua', '90days':'90 ngày qua', all:'Từ đầu năm 2026 đến nay'};
  const period = {label:(labels[dateRange] || dateRange) + (referenceDate ? ` · mốc ${referenceDate}` : '')};
  const stores = (directory?.stores || []).filter(s=>cohort==='all'||(cohort==='kiosks'?['KIOSK_NHUONG_QUYEN','KIOSK_VE_TINH'].includes(s.store_type):s.store_type===cohort)).map(s => ({
    store_id:String(s.store_code), store:s.store_name, city:locateGeography(s.city,'city')?.label || s.city || 'Chưa xác định',
    store_type:s.store_type || '', status:s.status, revenue:numeric(s.total_revenue), orders:numeric(s.total_orders),
    latitude:s.latitude,longitude:s.longitude,location_status:s.location_status,
    valid_orders:numeric(s.valid_orders), aov:numeric(s.total_revenue) > 0 ? numeric(s.aov) : null,
    has_sales:numeric(s.total_orders) > 0,
  })).sort((a,b)=>(b.revenue ?? -Infinity)-(a.revenue ?? -Infinity));
  const summarize = rows => {
    const revenue=sum(rows,'revenue'), orders=sum(rows,'orders'), validOrders=sum(rows,'valid_orders');
    return {revenue,orders,valid_orders:validOrders,aov:validOrders>0&&revenue!=null?revenue/validOrders:null,store_count:rows.length};
  };
  const groups = new Map();
  for (const store of stores) { if(!groups.has(store.city))groups.set(store.city,[]); groups.get(store.city).push(store); }
  const provinces=[...groups].map(([city,rows])=>({city,label:city,...summarize(rows)})).sort((a,b)=>(b.revenue ?? -Infinity)-(a.revenue ?? -Infinity));
  const charts=[['revenue','Doanh thu theo tỉnh/thành','VND'],['orders','Tổng số đơn theo tỉnh/thành','đơn'],['store_count','Độ phủ điểm bán','điểm bán']].map(([field,title,unit])=>({id:`overview_${field}`,title,metric:field,x_field:'city',unit,selection:'complete',data:provinces.map(p=>({label:p.label,value:p[field]}))}));
  return {report:{charts},snapshot:{snapshot_type:'overview',period,summary:summarize(stores),provinces,stores,
    definitions:{revenue:'Doanh thu từ đơn hoàn thành và đang giao.',orders:'Tổng đơn gồm mọi trạng thái.',
      aggregation:'AOV cấp tỉnh/toàn chuỗi chỉ hiện khi có số đơn hợp lệ làm mẫu số; AOV từng cửa hàng giữ theo nguồn. Không lấy trung bình AOV giữa các cửa hàng.',
      network:'Danh mục điểm bán hiện có, gồm cửa hàng chưa có đơn trong kỳ.'}}};
}
