export const normalizedValue = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().trim()
export function variantMap(rows) {
  const map = {}
  for (const row of rows || []) {
    const id = String(row.ma_san_pham || ''), name = row.ten_thuoc_tinh || '', attr = normalizedValue(name)
    if (!id || !row.gia_tri) continue
    const group = map[id] ||= { sizes: {}, toppings: {}, luong_da: {}, do_ngot: {}, loai_sua: {}, custom: {}, rows: [] }
    group.rows.push(row)
    const field = attr.includes('size') || attr.includes('kich thuoc') || attr.includes('kich co') ? 'sizes' : attr.includes('topping') || attr.includes('do kem') ? 'toppings' : attr.includes('luong da') || attr === 'da' || attr === 'ice' ? 'luong_da' : attr.includes('ngot') || attr.includes('duong') || attr === 'sugar' ? 'do_ngot' : attr.includes('sua') || attr === 'milk' ? 'loai_sua' : null
    const target = field ? group[field] : (group.custom[name] ||= {})
    target[row.gia_tri] = Number(row.phu_thu || 0)
  }
  return map
}
export function variantPrice(basePrice, rows, selections) {
  const size = normalizedValue(selections.size)
  const extras = new Set([...(selections.toppings || []), selections.luong_da, selections.do_ngot, selections.loai_sua,
    ...Object.entries(selections.custom_attributes || {}).filter(([key]) => key !== 'ghi_chu').flatMap(([,v]) => Array.isArray(v) ? v : [v])].map(normalizedValue).filter(Boolean))
  let price = Number(basePrice || 0)
  for (const row of rows || []) {
    const attr = normalizedValue(row.ten_thuoc_tinh), val = normalizedValue(row.gia_tri)
    const isSize = attr.includes('size') || attr.includes('kich thuoc') || attr.includes('kich co')
    if (isSize && val === size) price = Number(row.phu_thu || 0)
  }
  return price + (rows || []).filter(row => {
    const attr = normalizedValue(row.ten_thuoc_tinh)
    return !attr.includes('size') && !attr.includes('kich thuoc') && !attr.includes('kich co') && extras.has(normalizedValue(row.gia_tri))
  }).reduce((sum, row) => sum + Number(row.phu_thu || 0), 0)
}
// GET /menu/san-pham already contains the option maps; no separate variants route exists.
export function catalogVariantRows(products) {
  const attributes = { sizes: 'Size', toppings: 'Topping', luong_da: 'Lượng đá', do_ngot: 'Độ ngọt', loai_sua: 'Loại sữa' }
  return (products || []).flatMap(product => {
    const dynamic = product.bien_the && typeof product.bien_the === 'object' ? product.bien_the : {}
    const groups = Object.keys(dynamic).length ? dynamic : Object.fromEntries(Object.entries(attributes).filter(([key]) => product[key] && typeof product[key] === 'object').map(([key, name]) => [name, product[key]]))
    return Object.entries(groups).flatMap(([attribute, options]) => options && typeof options === 'object' && !Array.isArray(options) ? Object.entries(options).map(([value, price]) => ({ ma_san_pham: product.ma_san_pham, ten_thuoc_tinh: attribute, gia_tri: value, phu_thu: Number(price || 0) })) : [])
  })
}
