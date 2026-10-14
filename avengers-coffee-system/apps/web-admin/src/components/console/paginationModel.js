export function pageWindow(page, totalPages) {
  const total = Math.max(1, Math.floor(Number(totalPages) || 1));
  const current = Math.min(total, Math.max(1, Math.floor(Number(page) || 1)));
  const start = Math.max(2, Math.min(current - 1, total - 3));
  const end = Math.min(total - 1, Math.max(current + 1, 4));
  const numbers = [...new Set([1, ...Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i), total])];
  return numbers.flatMap((value, index) => index && value - numbers[index - 1] > 1 ? [`gap-${value}`, value] : [value]);
}
export function pageSlice(items, page, pageSize = 10) {
  const rows = Array.isArray(items) ? items : [];
  const size = Math.max(1, Math.floor(Number(pageSize) || 10));
  const totalPages = Math.max(1, Math.ceil(rows.length / size));
  const safePage = Math.min(totalPages, Math.max(1, Math.floor(Number(page) || 1)));
  const offset = (safePage - 1) * size;
  return { rows: rows.slice(offset, offset + size), page: safePage, totalPages, total: rows.length, offset, from: rows.length ? offset + 1 : 0, to: Math.min(offset + size, rows.length) };
}
