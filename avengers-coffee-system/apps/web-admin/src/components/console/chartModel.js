export const money = (value) =>
  value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toLocaleString("vi-VN") + " đ";
export const number = (value) =>
  value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toLocaleString("vi-VN");
export function normalizeChartRows(rows = []) {
  return rows.map((row) => ({
    ...row,
    value: Number.isFinite(Number(row.value)) ? Number(row.value) : 0,
  }));
}
export function donutSegments(rows = []) {
  const positive = normalizeChartRows(rows).filter((row) => row.value > 0);
  const total = positive.reduce((sum, row) => sum + row.value, 0);
  return positive.map((row, index) => ({
    ...row,
    share: (row.value / total) * 100,
    offset: positive
      .slice(0, index)
      .reduce((sum, previous) => sum + (previous.value / total) * 100, 0),
  }));
}
