export const isGuestId = id => /^anon-[0-9a-f-]{36}$/i.test(String(id || ''))
export const cartItems = payload => Array.isArray(payload) ? payload : (Array.isArray(payload?.items) ? payload.items : [])
export const cartCount = payload => cartItems(payload).reduce((n, item) => n + Number(item.so_luong ?? item.quantity ?? 0), 0)
export function lineOptions(item) {
  return { size: item.size || 'Nhỏ', toppings: item.toppings || [], luong_da: item.luong_da || '',
    do_ngot: item.do_ngot || '', loai_sua: item.loai_sua || '', ghi_chu: item.ghi_chu || '', custom_attributes: { ...(item.custom_attributes || {}), ...(item.ghi_chu != null ? { ghi_chu: item.ghi_chu } : {}) } }
}
export function createCartService(api, operationId) {
  const config = () => ({ headers: { 'x-idempotency-key': operationId() } })
  return {
    read: userId => api.get(`/cart/${userId}`),
    add: (userId, item, quantity = 1, options = {}) => api.post('/cart', {
      ma_nguoi_dung: userId, ma_san_pham: Number(item.ma_san_pham || item.id),
      ...lineOptions(item), ...options, so_luong: quantity,
    }, config()),
    update: (lineId, changes) => api.patch(`/cart/${lineId}`, changes, config()),
    remove: lineId => api.delete(`/cart/${lineId}`, config()),
    reorder: (userId, orderId, expected = {}) => api.post(`/cart/${userId}/reorder`, { order_id: orderId, ...expected }, config()),
  }
}
