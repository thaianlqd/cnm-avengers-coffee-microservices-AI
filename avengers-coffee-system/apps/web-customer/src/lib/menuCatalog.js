export const productCategoryId = product => String(product?.danhMuc?.ma_danh_muc ?? product?.ma_danh_muc ?? '');

// Include products assigned at any depth, including directly to the parent.
export function categoryIds(categories, rootId) {
  const found = new Set([String(rootId).replace(/^group-/, '')]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
      const id = String(category.ma_danh_muc);
      if (category.ma_danh_muc_cha != null && found.has(String(category.ma_danh_muc_cha)) && !found.has(id)) {
        found.add(id);
        changed = true;
      }
    }
  }
  return found;
}

export function productsInCategory(categories, products, rootId) {
  const ids = categoryIds(categories, rootId);
  return products.filter(product => ids.has(productCategoryId(product)));
}

export function categoryPath(categories, selectedId) {
  const byId = new Map(categories.map(category => [String(category.ma_danh_muc), category]));
  const path = [];
  const visited = new Set();
  let category = byId.get(String(selectedId).replace(/^group-/, ''));
  while (category && !visited.has(String(category.ma_danh_muc))) {
    path.unshift(category);
    visited.add(String(category.ma_danh_muc));
    category = byId.get(String(category.ma_danh_muc_cha));
  }
  return path;
}
