/** Presentation only: preserve chart order, IDs, rows and the server's analytical scope. */
export function chartLayoutProfile(chart = {}) {
  const rows = chart.data || [], count = rows.length;
  const longest = Math.max(0, ...rows.map(row => String(row.label ?? '').length));
  const series = chart.series?.length || 1, type = chart.chart_type;
  const temporal = ['line', 'area', 'multi_line'].includes(type);
  const horizontal = type === 'horizontal_bar' || (type === 'bar' && (count > 8 || longest > 18 || chart.risk_threshold));
  const matrix = type === 'heatmap';
  const fullWidth = (matrix && (count > 8 || new Set(rows.map(row => row.x).filter(x => x != null)).size > 3))
    || (['grouped_bar', 'stacked_bar', 'stacked_100'].includes(type) && count > 12);
  const dense = series > 1 || (temporal && count > 4) || (horizontal && (count > 6 || longest > 24))
    || (type === 'bar' && count > 6) || (type === 'donut' && count > 5);
  const compactSeries=temporal&&count<=12&&series<=3;
  const minSpan = fullWidth ? 12 : ['scatter','pareto'].includes(type) || series > 3 ? 6 : ['grouped_bar','stacked_bar','stacked_100'].includes(type)||matrix || (dense&&!compactSeries) ? 4.8 : 3.6;
  // A long-label ranking needs more width than a univariate time series.
  const weight = matrix ? 12 : horizontal && longest > 24 ? 10 : series > 1 ? 8 : temporal && count>=3 ? 7 : dense ? 6 : type === 'donut' ? 3 : 4;
  const height = type === 'donut' && count > 5 ? 264 : horizontal && chart.risk_threshold ? 272 : horizontal && count > 10 ? 258 : horizontal&&count<=5?160:234;
  return { minSpan, weight, height };
}

function rowSpans(row) {
  if (row.length === 1) return [12];
  const options = row.length === 2 ? [[8.4,3.6],[7.2,4.8],[6,6],[4.8,7.2],[3.6,8.4]]
    : [[4.8,3.6,3.6],[3.6,4.8,3.6],[3.6,3.6,4.8],[4,4,4]];
  const total = row.reduce((sum,p)=>sum+p.weight,0);
  return options.filter(spans=>spans.every((span,i)=>span>=row[i].minSpan))
    .map(spans=>({spans,cost:spans.reduce((cost,span,i)=>cost+(span/12-row[i].weight/total)**2,0)+(spans.length===2&&spans[0]===6&&row.every(p=>p.minSpan<6)?.06:0)}))
    .sort((a,b)=>a.cost-b.cost)[0]?.spans;
}

/** Pack mixed rows with 70/30, 60/40 and 30/30/40 where readable.
 * The sixty-column CSS canvas represents fractional twelve-column spans exactly.
 * Matrices get their own row instead of a clipped, horizontally scrolling card.
 */
export function dashboardGridLayout(charts = [], maxColumns = 3) {
  const profiles = charts.map(chartLayoutProfile), columns = Math.max(1, Math.min(3, maxColumns));
  const memo = new Map();
  function pack(start) {
    if (start === charts.length) return {cost:0,rows:[]};
    if (memo.has(start)) return memo.get(start);
    let best={cost:Infinity,rows:[]};
    for (const size of [2,3,1]) {
      if (size>columns || start+size>charts.length) continue;
      const row=profiles.slice(start,start+size);
      if (row.reduce((sum,p)=>sum+p.minSpan,0)>12) continue;
      const spans=rowSpans(row);if(!spans)continue;
      const rest=pack(start+size);
      const cost=rest.cost+100+(size===1&&charts.length>1&&columns>1&&row[0].minSpan<12?35:0);
      if(cost<best.cost)best={cost,rows:[spans,...rest.rows]};
    }
    memo.set(start,best);return best;
  }
  let index=0;
  return pack(0).rows.flatMap((spans,rowIndex)=>{
    const row=profiles.slice(index,index+spans.length),height=Math.max(...row.map(p=>p.height));
    return row.map((profile,offset)=>({...profile,span:spans[offset],row:rowIndex,height,index:index++}));
  });
}
