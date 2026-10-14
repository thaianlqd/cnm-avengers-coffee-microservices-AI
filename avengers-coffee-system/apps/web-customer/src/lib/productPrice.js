const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const isSizeAttribute = name => /size|kich thuoc/.test(normalize(name));

// Menu and cart server store size amounts as full prices; other options are surcharges.
export function productUnitPrice(product, size = '', options = {}) {
  const base = Number(product?.gia_ban ?? product?.price ?? 0);
  const dynamic = product?.bien_the || {};
  const attributes = Object.entries(dynamic);
  if (attributes.length) {
    const sizeAttribute = attributes.find(([name]) => isSizeAttribute(name));
    const selectedSize = size || (sizeAttribute && options.custom_attributes?.[sizeAttribute[0]]);
    const fullPrice = sizeAttribute?.[1]?.[selectedSize] ?? base;
    const values = new Set([...(options.toppings || []), options.loaiSua, options.luongDa, options.doNgot,
      ...Object.values(options.custom_attributes || {}).flat()].filter(Boolean));
    return Number(fullPrice) + attributes.filter(([name]) => !isSizeAttribute(name))
      .reduce((sum, [, choices]) => sum + Object.entries(choices || {}).reduce((total, [value, amount]) => total + (values.has(value) ? Number(amount) || 0 : 0), 0), 0);
  }
  return Number(product?.sizes?.[size] ?? base)
    + (options.toppings || []).reduce((sum, value) => sum + Number(product?.toppings?.[value] || 0), 0)
    + Number(product?.loai_sua?.[options.loaiSua] || 0)
    + Number(product?.luong_da?.[options.luongDa] || 0)
    + Number(product?.do_ngot?.[options.doNgot] || 0);
}
