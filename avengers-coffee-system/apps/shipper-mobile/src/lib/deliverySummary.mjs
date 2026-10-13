export const deliveryArray = value => Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : Array.isArray(value?.data) ? value.data : []
export function deliveriesInRange(deliveries, range, now = new Date()) {
  const start = new Date(now); start.setHours(0,0,0,0)
  if (range === 'week') start.setDate(start.getDate()-6)
  if (range === 'month') start.setDate(1)
  return deliveries.filter(d => { const date = new Date(d.delivered_at || d.updated_at || d.assigned_at); return Number.isFinite(date.getTime()) && date >= start && date <= now })
}
export function summarizeDeliveries(deliveries) {
  const done = deliveries.filter(d => d.status === 'DELIVERED'), failed = deliveries.filter(d => d.status === 'FAILED')
  const amounts = done.map(d => d.delivery_fee == null || d.delivery_fee === '' ? null : Number(d.delivery_fee))
  const durations = done.map(d => (new Date(d.delivered_at)-new Date(d.picked_up_at))/60000).filter((value,i) => done[i].delivered_at && done[i].picked_up_at && Number.isFinite(value) && value >= 0)
  return { completed: done.length, failed: failed.length, total_income: amounts.every(a => a != null && Number.isFinite(a)) ? amounts.reduce((sum,a) => sum+a,0) : null, success_rate: done.length+failed.length ? Math.round(done.length/(done.length+failed.length)*100) : null, avg_delivery_time: durations.length ? Math.round(durations.reduce((sum,d) => sum+d,0)/durations.length) : null }
}
