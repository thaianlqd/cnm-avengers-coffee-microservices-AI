export function distanceKm(a, b) {
  if (!a || !b || [a.lat,a.lng,b.lat,b.lng].some(n => !Number.isFinite(n)) || Math.abs(a.lat)>90 || Math.abs(b.lat)>90 || Math.abs(a.lng)>180 || Math.abs(b.lng)>180) return null;
  const rad = n => n*Math.PI/180;
  const h = Math.sin(rad(b.lat-a.lat)/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lng-a.lng)/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
