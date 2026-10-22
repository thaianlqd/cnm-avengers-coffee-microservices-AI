/** Monotone cubic interpolation. Curves stay inside neighbouring observations. */
export function monotonePath(points=[]) {
  if(!points.length)return '';
  if(points.length===1)return `M ${points[0].x} ${points[0].y}`;
  const slopes=points.slice(1).map((p,i)=>(p.y-points[i].y)/(p.x-points[i].x||1));
  const tangent=points.map((p,i)=>i===0?slopes[0]:i===points.length-1?slopes[i-1]:slopes[i-1]*slopes[i]<=0?0:2/(1/slopes[i-1]+1/slopes[i]));
  return `M ${points[0].x} ${points[0].y} `+points.slice(1).map((p,i)=>{
    const a=points[i],dx=(p.x-a.x)/3;
    return `C ${a.x+dx} ${a.y+dx*tangent[i]} ${p.x-dx} ${p.y-dx*tangent[i+1]} ${p.x} ${p.y}`;
  }).join(' ');
}

export function axisInset(labels=[]) {
  return Math.max(56,Math.min(104,Math.ceil(Math.max(0,...labels.map(v=>String(v).length))*6.5+16)));
}

function observedDate(label) {
  const text=String(label||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return null;
  const stamp=Date.parse(text+'T00:00:00Z');
  return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===text?stamp:null;
}

/** Dates use elapsed time, including absent buckets; categorical legacy labels
 * retain their declared order. Invalid/mixed/reversed dates need a table. */
export function timePositions(rows=[]) {
  const dates=rows.map(r=>observedDate(r.label));
  if(dates.every(d=>d===null)&&!rows.some(r=>/^\d{4}-\d{2}-\d{2}/.test(String(r.label))))
    return rows.map((_,i)=>rows.length===1?.5:i/Math.max(1,rows.length-1));
  if(dates.some(d=>d===null)||dates.some((d,i)=>i>0&&d<=dates[i-1]))return null;
  return dates.map(d=>dates.length===1?.5:(d-dates[0])/(dates[dates.length-1]-dates[0]));
}

function missingBucket(previous,current,granularity) {
  const a=observedDate(previous),b=observedDate(current);
  if(a===null||b===null||!granularity)return false;
  const next=new Date(a);
  if(granularity==='day')next.setUTCDate(next.getUTCDate()+1);
  else if(granularity==='week')next.setUTCDate(next.getUTCDate()+7);
  else if(['month','quarter','year'].includes(granularity))next.setUTCMonth(next.getUTCMonth()+({month:1,quarter:3,year:12}[granularity]));
  else return false;
  return b>next.getTime();
}

/** Nulls split paths; partial observations split solid and dashed segments. */
export function timeSegments(rows,key,coverage=[],granularity) {
  const solid=[],partial=[];let run=[];
  rows.forEach((row,i)=>{
    if(!Number.isFinite(row[key])){if(run.length)solid.push(run);run=[];return;}
    const gap=i>0&&missingBucket(rows[i-1].label,row.label,granularity);
    if(gap){if(run.length)solid.push(run);run=[];}
    if(i>0&&!gap&&Number.isFinite(rows[i-1][key])&&(coverage[i]?.partial||coverage[i-1]?.partial)){
      if(run.length)solid.push(run);run=[];partial.push([i-1,i]);
    }else if(i>0&&!gap&&Number.isFinite(rows[i-1][key])&&!run.length)run.push(i-1);
    run.push(i);
  });
  if(run.length)solid.push(run);
  return {solid,partial};
}
