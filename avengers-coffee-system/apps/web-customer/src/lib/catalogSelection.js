export function normalizeSearch(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
}

export function searchCatalog(items, query, label = item => item.ten_san_pham || item.name, limit = 8) {
  const term = normalizeSearch(query);
  if (!term) return [];
  return items.filter(item => normalizeSearch(label(item)).includes(term))
    .sort((a, b) => Number(normalizeSearch(label(b)).startsWith(term)) - Number(normalizeSearch(label(a)).startsWith(term)))
    .slice(0, limit);
}

export function categoryFamily(label) {
  const text = normalizeSearch(label);
  if (text.includes('ca phe') || text.includes('coffee')) return 'coffee';
  if (text.includes('tra') || text.includes('tea')) return 'tea';
  if (text.includes('banh') || text.includes('do an') || text.includes('food')) return 'food';
  return 'other';
}

export function featuredCategories(items, getLabel = item => item.ten_danh_muc) {
  const featured = ['coffee', 'tea', 'food'].map(family => items.find(item => categoryFamily(getLabel(item)) === family)).filter(Boolean);
  for (const item of items) {
    if (featured.length >= 3) break;
    if (!featured.includes(item)) featured.push(item);
  }
  return featured;
}
