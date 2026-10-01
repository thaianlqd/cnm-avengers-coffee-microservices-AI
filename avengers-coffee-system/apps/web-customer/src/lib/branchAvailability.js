// Customer sellability comes from menu activity and branch overrides.
// Stock quantity is warehouse information, not a customer-ordering gate.
const flag = value => value === true || value === 1 || value === 'true' ? true
  : value === false || value === 0 || value === 'false' ? false : null;
const id = item => String(item.ma_san_pham ?? item.product_id ?? '');

export function inventoryRows(payload) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.items) ? payload.items : null;
}

export function evaluateBranchAvailability(cart, products, inventory) {
  const matrix = {available_products: [], unavailable_products: [], unverified_products: []};
  const seen = new Set();
  for (const item of cart) {
    const productId = id(item);
    if (seen.has(productId)) continue;
    seen.add(productId);
    const product = products.find(row => id(row) === productId);
    const active = flag(product?.trang_thai);
    const override = inventory?.find(row => id(row) === productId);
    const enabled = override ? flag(override.dang_kinh_doanh) : true;
    const status = active === false ? 'UNAVAILABLE'
      : !productId || active !== true || !Array.isArray(inventory) || enabled === null ? 'UNVERIFIED'
      : enabled ? 'AVAILABLE' : 'UNAVAILABLE';
    const record = {product_id: productId,
      product_name: item.ten_san_pham || item.product_name || product?.ten_san_pham || productId,
      status};
    matrix[status === 'AVAILABLE' ? 'available_products'
      : status === 'UNAVAILABLE' ? 'unavailable_products' : 'unverified_products'].push(record);
  }
  return {...matrix, is_fully_available:
    matrix.unavailable_products.length === 0 && matrix.unverified_products.length === 0};
}

export function closestCompatibleBranch(branches, selectedBranch, manuallySelected = false) {
  const compatible = branches.filter(branch => branch.is_fully_available);
  if (manuallySelected && compatible.some(branch => branch.code === selectedBranch)) return selectedBranch;
  return [...compatible].sort((a, b) => a.distance - b.distance)[0]?.code || '';
}
