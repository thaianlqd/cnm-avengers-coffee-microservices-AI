// Web/native share the exact customer actions and option validation.
export const MAX_SELECTED_PRODUCTS = 16;
export const productIdentity = product => String(product.product_id || product.ma_san_pham || product.id);
export const productName = product => product.ten_san_pham || product.product_name || product.name;
export function toggleProductSelection(selected, product, snapshot) {
  const id = productIdentity(product);
  const exists = selected.some(row => productIdentity(row) === id && row.snapshot === snapshot);
  if (exists) return selected.filter(row => productIdentity(row) !== id);
  const current = selected.filter(row => row.snapshot === snapshot);
  return current.length >= MAX_SELECTED_PRODUCTS ? current : [...current, { ...product, snapshot, quantity: 1 }];
}
export function selectionAction(selected) {
  if (!selected.length || !selected[0].snapshot || selected.some(row => row.snapshot !== selected[0].snapshot)) throw new Error('Danh sách món đã thay đổi. Bạn chọn lại các món ở danh sách mới nhé.');
  return { type: 'select_products', snapshot: selected[0].snapshot, items: selected.map(row => ({ product_id: productIdentity(row), quantity: row.quantity || 1 })) };
}
export function initialChoices(item) {
  const choices = { ...(item.selected_options || {}) };
  for (const group of item.groups || []) if (group.fixed && group.field && choices[group.field] == null && !group.multiple) choices[group.field] = group.values[0];
  return choices;
}
export function toggleOption(choices, group, value) {
  if (!group.field || !group.values.includes(value)) return choices;
  if (group.multiple) {
    const current = choices[group.field] || [];
    return { ...choices, [group.field]: current.includes(value) ? current.filter(row => row !== value) : [...current, value] };
  }
  const next = { ...choices };
  if (next[group.field] === value && !group.required && !group.fixed) delete next[group.field];
  else next[group.field] = value;
  return next;
}
export function missingChoices(item, choices) {
  return (item.groups || []).filter(group => group.required && (!choices[group.field] || Array.isArray(choices[group.field]) && !choices[group.field].length)).map(group => group.name);
}
export function configurationAction(configuration, drafts, useDefaults = false) {
  const items = configuration.items.map(item => ({ product_id: item.product_id,
    quantity: drafts[item.product_id]?.quantity || item.quantity || 1,
    options: useDefaults ? {} : drafts[item.product_id]?.choices || initialChoices(item),
    ...(useDefaults ? { use_defaults: true } : {}),
  }));
  return { type: 'configure_products', snapshot: configuration.snapshot, items };
}
export function actionMessage(action, items) {
  if (action.type === 'select_products') return `Chọn ${items.map(item => `${item.quantity || 1} × ${productName(item)}`).join(', ')} để thêm vào giỏ`;
  return action.items.every(item => item.use_defaults) ? 'Dùng công thức mặc định của quán cho các món đang chọn' : 'Áp dụng các tùy chọn đã chọn và thêm các món vào giỏ';
}
