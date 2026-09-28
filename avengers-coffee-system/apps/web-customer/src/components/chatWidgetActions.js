export function openChatProductDetail(productId, dispatch = (event) => window.dispatchEvent(event)) {
  if (productId == null) return;
  dispatch(new CustomEvent('navigate-tab', { detail: { tab: 'product-detail', productId } }));
}

export function addChatProduct(event, onAdd, product) {
  event.stopPropagation();
  onAdd({
    product_id: product.product_id || product.ma_san_pham || product.id,
    product_name: product.ten_san_pham || product.product_name || product.name,
  });
}

export function branchDistanceLabel(branch) {
  if (branch?.khoang_cach_km == null) return null;
  return branch.distance_estimated || branch.distance_basis === 'area_centroid'
    ? `${branch.khoang_cach_km} km đường chim bay, ước tính theo khu vực`
    : `${branch.khoang_cach_km} km đường chim bay`;
}

export function paymentCardRows(options) {
  return options.map((option) => ({
    name: option.label,
    text: `Tôi chọn ${option.label}`,
    desc: option.reason || (option.balance != null ? `Số dư: ${Number(option.balance).toLocaleString('vi-VN')}đ` : ''),
    color: '#B22830',
    enabled: option.enabled,
  }));
}

export function structuredLegacyCards(response) {
  const data = response || {};
  return {
    ...(Array.isArray(data.products) && data.products.length ? { _products: data.products.slice(0, 6) } : {}),
    ...(Array.isArray(data.stores) && data.stores.length ? { _stores: data.stores.slice(0, 5) } : {}),
    ...(Array.isArray(data.vouchers) && data.vouchers.length ? { _vouchers: data.vouchers.slice(0, 4) } : {}),
    ...(Array.isArray(data.orders) && data.orders.length ? { _orders: data.orders.slice(0, 3) } : {}),
    ...(Array.isArray(data.payment_options) && data.payment_options.length ? { _paymentOptions: data.payment_options } : {}),
  };
}

export function chatLoadingLabel(confirming) {
  if (confirming) return 'Đang xác nhận đơn hàng...';
  return 'Mình đang xử lý yêu cầu của bạn...';
}

export async function refreshWalletAfterCheckout(queryClient, userId, paymentMethod) {
  if (userId && paymentMethod === 'VI_DIEN_TU') {
    await queryClient.invalidateQueries({ queryKey: ['userWallet', userId] });
  }
}
