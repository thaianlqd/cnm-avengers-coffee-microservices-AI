export function systemBranches(rows = []) {
  return rows.filter(branch => {
    const type = branch.loai_diem_ban || branch.type;
    const name = branch.name || branch.ten_chi_nhanh || '';
    const code = branch.code || branch.ma_chi_nhanh || '';
    return (!type || type === 'CHI_NHANH_CHINH') && !/^(KSK|KVT|KIOSK)([-_]|$)/i.test(code) && !/^kiosk\b/i.test(name);
  });
}
export function newestShippers(rows = [], createdId) {
  return [...rows].sort((a,b) => {
    if (a.id === b.id) return 0;
    if (a.id === createdId) return -1;
    if (b.id === createdId) return 1;
    const date = row => Number.isFinite(Date.parse(row.created_at)) ? Date.parse(row.created_at) : 0;
    return date(b)-date(a) || String(b.id).localeCompare(String(a.id));
  });
}
