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

export function paymentCardRows(options) {
  return options.map((option) => ({
    name: option.label,
    text: `Tôi chọn ${option.label}`,
    desc: option.reason || (option.balance != null ? `Số dư: ${Number(option.balance).toLocaleString('vi-VN')}đ` : ''),
    color: '#B22830',
    enabled: option.enabled,
  }));
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
