const DAY = 86400000;
const dateOf = row => row.ngay_tao || row.created_at || row.createdAt;
export function vietnamDay(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(part => [part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
const startOf = key => Date.parse(`${key}T00:00:00+07:00`);
const labelOf = ts => new Date(ts).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
// Charts can show an explicitly labelled historical window; selected-period KPIs stay separate.
export function selectChartPeriod(rows = [], days = 7, now = new Date()) {
  const end = now.getTime(), start = startOf(vietnamDay(now)) - (days - 1) * DAY;
  const valid = rows.filter(row => Number.isFinite(new Date(dateOf(row)).getTime()) && new Date(dateOf(row)).getTime() <= end);
  const inWindow = (from,to) => valid.filter(row => {const time=new Date(dateOf(row)).getTime();return time>=from && time<=to;});
  const selectedRows = inWindow(start,end);
  const distinct = list => new Set(list.map(row => vietnamDay(dateOf(row)))).size;
  if (distinct(selectedRows) >= 2 || !valid.length) return {rows:selectedRows, selectedRows, fallback:false,start,end,label:`${labelOf(start)} – ${labelOf(end)}`};
  const latest = Math.max(...valid.map(row => new Date(dateOf(row)).getTime()));
  const historyEnd = startOf(vietnamDay(latest)) + DAY - 1;
  let historyStart=startOf(vietnamDay(latest))-(Math.max(days,7)-1)*DAY;
  let history=inWindow(historyStart,Math.min(historyEnd,end));
  for (const width of [...new Set([Math.max(days,7),30,90,365].filter(n=>n>=days))]) {
    const candidateStart=startOf(vietnamDay(latest))-(width-1)*DAY;
    const candidate=inWindow(candidateStart,Math.min(historyEnd,end));
    if (distinct(candidate)>=2) { historyStart=candidateStart; history=candidate; break; }
  }
  return {rows:history,selectedRows,fallback:historyStart!==start || historyEnd<end-DAY,start:historyStart,end:Math.min(historyEnd,end),label:`${labelOf(historyStart)} – ${labelOf(Math.min(historyEnd,end))}`};
}

export function orderChartData(orders=[]) {
  const daily=new Map(),status=new Map(),payment=new Map(),items=new Map();
  for(const order of orders) {
    const key=vietnamDay(dateOf(order)); if(!key) continue;
    daily.set(key,(daily.get(key)||0)+Number(order.tong_tien ?? order.thanh_tien ?? order.totalAmount ?? 0));
    const st=order.trang_thai_don_hang || order.status || 'Chưa xác định'; status.set(st,(status.get(st)||0)+1);
    const pm=order.phuong_thuc_thanh_toan || 'Chưa xác định'; payment.set(pm,(payment.get(pm)||0)+1);
    for(const line of order.chi_tiet||[]) { const code=String(line.ma_san_pham); const prev=items.get(code)||{ma_san_pham:code,ten_san_pham:line.ten_san_pham||code,so_luong:0,doanh_thu:0}; prev.so_luong+=Number(line.so_luong||0);prev.doanh_thu+=Number(line.gia_ban||0)*Number(line.so_luong||0);items.set(code,prev); }
  }
  return {revenueByDay:[...daily].sort(([a],[b])=>a.localeCompare(b)).map(([key,amount])=>({key,label:key.slice(8)+'/'+key.slice(5,7),amount})),statusRows:[...status].map(([status,count])=>({status,count})),paymentRows:[...payment].map(([code,count])=>({code,count})),topItems:[...items.values()].sort((a,b)=>b.so_luong-a.so_luong).slice(0,6)};
}
