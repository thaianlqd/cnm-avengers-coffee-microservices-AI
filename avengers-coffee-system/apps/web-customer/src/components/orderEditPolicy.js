export function orderEditPolicy(order) {
  if (order?.update_policy) return order.update_policy;
  const paid = order?.trang_thai_thanh_toan === 'DA_THANH_TOAN';
  const method = order?.phuong_thuc_thanh_toan;
  const isCod = ['THANH_TOAN_KHI_NHAN_HANG', 'TIEN_MAT', 'CASH'].includes(method) ||
                order?.trang_thai_thanh_toan === 'CHO_THANH_TOAN_KHI_NHAN_HANG';
  const isWallet = method === 'VI_DIEN_TU';
  let reason = null;
  if (!['MOI_TAO', 'DA_XAC_NHAN'].includes(order?.trang_thai_don_hang)) {
    reason = 'Chỉ sửa được trước khi cửa hàng bắt đầu chuẩn bị món.';
  } else if (!isCod && !isWallet) {
    reason = 'Đơn QR/cổng thanh toán không hỗ trợ sửa; bạn có thể huỷ và đặt đơn mới.';
  } else if (isWallet && !paid) {
    reason = 'Đơn ví chưa hoàn tất thanh toán.';
  } else if (isCod && paid) {
    reason = 'Đơn COD đã thu tiền không hỗ trợ sửa.';
  }
  return { allowed: !reason, reason };
}

export function orderEditFingerprint(orderId, payload) {
  return JSON.stringify({ orderId, payload });
}

export function orderEditConfirmation(preview, fingerprint) {
  if (!preview || preview.fingerprint !== fingerprint) return null;
  const total = Number(preview.final_total), original = Number(preview.original_total);
  if (!preview.revision || preview.final_total == null || preview.original_total == null
      || !Number.isSafeInteger(total) || !Number.isSafeInteger(original)
      || original < 0 || total < original || Number(preview.wallet_shortfall) > 0) return null;
  return { ...preview.payload, expected_revision: preview.revision, expected_total: preview.final_total };
}
