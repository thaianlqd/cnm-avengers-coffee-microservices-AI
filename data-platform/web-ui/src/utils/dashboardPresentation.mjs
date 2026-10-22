// V3.1 small "Báo cáo & Phân tích" corrections: explicit period scope,
// correct units, honest incomplete periods, and the ask-AI bridge.
// No values are invented here; series come straight from /api/marts/all.

const PERIODS = { today: 'Hôm nay', '7days': '7 ngày gần nhất', '14days': '14 ngày gần nhất', '30days': '30 ngày gần nhất', '90days': '90 ngày gần nhất', all: 'Toàn bộ thời gian' };

/** Label of the dashboard's own period selector (the KPI query uses it). */
export function periodLabel(dateRange) {
  return PERIODS[dateRange] || 'Kỳ đã chọn';
}

const iso = value => /^\d{4}-\d{2}-\d{2}/.test(String(value)) ? String(value).slice(0, 10) : null;

/**
 * Daily revenue series. The bucket for today (or later) is incomplete; the
 * chart marks it (period.end = last complete day) instead of implying a drop.
 */
export function dailyRevenueSeries(rows = [], today) {
  const points = rows.map(r => ({ label: iso(r.date) || String(r.date), value: Number(r.revenue) || 0 })).filter(p => p.label);
  const todayIso = today || new Date().toISOString().slice(0, 10);
  const complete = points.filter(p => p.label < todayIso);
  const partialLast = points.length > 0 && points[points.length - 1].label >= todayIso;
  const lastComplete = complete.length ? complete[complete.length - 1].label : null;
  const average = complete.length ? complete.reduce((s, p) => s + p.value, 0) / complete.length : null;
  const peak = complete.length ? Math.max(...complete.map(p => p.value)) : null;
  const notes = [];
  if (partialLast) notes.push('Điểm cuối là ngày hiện tại chưa kết thúc (đánh dấu rỗng, nét đứt); không so sánh như ngày đầy đủ.');
  const window = Math.min(3, Math.floor(complete.length / 4));
  if (window >= 1) {
    const recent = complete.slice(-window), earlier = complete.slice(-2 * window - 7, -window);
    const mean = list => list.reduce((s, p) => s + p.value, 0) / list.length;
    if (earlier.length && mean(earlier) > 0 && mean(recent) < 0.1 * mean(earlier)) {
      notes.push('Ghi nhận những ngày gần đây giảm đột ngột so với trước; có thể do dữ liệu nguồn chưa đồng bộ đầy đủ. Kiểm tra “Đồng bộ gần nhất” trước khi kết luận.');
    }
  }
  // Days without any recorded revenue are gaps, not zeros: the source may be
  // unsynced. The line breaks there instead of drawing a decline.
  const data = [], gaps = [];
  points.forEach((p, i) => {
    if (i > 0) {
      const day = new Date(points[i - 1].label + 'T00:00:00Z'); day.setUTCDate(day.getUTCDate() + 1);
      const first = day.toISOString().slice(0, 10);
      let missing = 0;
      while (day.toISOString().slice(0, 10) < p.label && missing < 62) { data.push({ label: day.toISOString().slice(0, 10), series_1: null }); day.setUTCDate(day.getUTCDate() + 1); missing++; }
      if (missing) { const last = new Date(p.label + 'T00:00:00Z'); last.setUTCDate(last.getUTCDate() - 1); gaps.push([first, last.toISOString().slice(0, 10)]); }
    }
    data.push({ label: p.label, series_1: p.value });
  });
  if (gaps.length) notes.push(`Không có doanh thu ghi nhận ${gaps.map(([a, b]) => a === b ? `ngày ${a}` : `từ ${a} đến ${b}`).join(', ')}; có thể nguồn chưa đồng bộ. Khoảng trống không được vẽ như doanh thu bằng 0.`);
  return { data, gaps, period: points.length ? { start: points[0].label, end: lastComplete || points[0].label } : null,
    partialLast, average, peak, completeDays: complete.length, notes };
}

/** Channel donut: values are order counts, so the unit is "đơn". */
export function channelSlices(behavior = {}) {
  const store = Number(behavior.store_orders || 0), delivery = Number(behavior.delivery_orders || 0), total = store + delivery;
  return { total, unit: 'đơn', slices: total > 0 ? [
    { label: 'Tại quán và Mang đi', value: store, color: '#059669' },
    { label: 'Giao hàng tận nơi', value: delivery, color: '#0284c7' }] : [] };
}

/**
 * "Hỏi trợ lý AI về biểu đồ này": a governed question built from capability
 * labels (metric/dimension ids bound to the card). Returns null if the metric
 * is not offered by the server. The user still submits it explicitly.
 */
export function chartQuestion(capabilities, { metric, dimension, granularity, time } = {}) {
  const m = (capabilities?.metrics || []).find(x => x.id === metric);
  if (!m) return null;
  const d = dimension ? m.dimensions?.find(x => x.id === dimension) : null;
  if (dimension && !d) return null;
  const g = granularity ? capabilities?.phrases?.granularity?.[granularity] : '';
  return [m.label, d ? `theo ${d.label.toLowerCase()}` : '', g || '', time || ''].filter(Boolean).join(' ').trim();
}
