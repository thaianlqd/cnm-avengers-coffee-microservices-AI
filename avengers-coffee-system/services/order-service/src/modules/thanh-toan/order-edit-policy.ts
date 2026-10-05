import { BadRequestException } from '@nestjs/common';

export function orderEditPolicy(order: any) {
  const state = order.trang_thai_don_hang;
  const method = order.phuong_thuc_thanh_toan;
  const paid = order.trang_thai_thanh_toan === 'DA_THANH_TOAN';
  const isCod = ['THANH_TOAN_KHI_NHAN_HANG', 'TIEN_MAT', 'CASH'].includes(method) ||
                order.trang_thai_thanh_toan === 'CHO_THANH_TOAN_KHI_NHAN_HANG';
  const isWallet = ['VI_DIEN_TU', 'VI_AVENGERS'].includes(method);
  let reason: string | null = null;
  if (state === 'DA_HUY') reason = 'Đơn đã huỷ nên không thể sửa. Bạn có thể yêu cầu đặt lại đơn.';
  else if (!['MOI_TAO', 'DA_XAC_NHAN'].includes(state)) reason = 'Chỉ sửa được trước khi cửa hàng bắt đầu chuẩn bị món.';
  else if (!isCod && !isWallet)
    reason = paid ? 'Đơn đã thanh toán bằng QR/cổng thanh toán nên không thể sửa.' : 'Đơn QR/cổng thanh toán không hỗ trợ sửa; bạn có thể huỷ và đặt đơn mới.';
  else if (isWallet && !paid) reason = 'Đơn ví chưa hoàn tất thanh toán; bạn kiểm tra thanh toán trước khi sửa nhé.';
  else if (isCod && paid) reason = 'Đơn COD đã thu tiền nên không thể sửa số tiền phải trả.';
  return { allowed: !reason, reason, minimum_total: Number(order.tong_tien),
    settlement: isWallet ? 'wallet_difference' : 'cod_total',
    allowed_statuses: ['MOI_TAO', 'DA_XAC_NHAN'] };
}

export function orderEditAmounts(order: any, finalTotal: number) {
  const originalTotal = Number(order.tong_tien);
  if (!Number.isSafeInteger(originalTotal) || !Number.isSafeInteger(finalTotal) || originalTotal < 0)
    throw new BadRequestException('Tổng tiền đơn không hợp lệ.');
  if (finalTotal < originalTotal) throw new BadRequestException('Tổng tiền sau sửa phải bằng hoặc cao hơn tổng tiền đơn cũ.');
  return { original_total: originalTotal, amount_difference: finalTotal - originalTotal,
    wallet_charge: order.phuong_thuc_thanh_toan === 'VI_DIEN_TU' ? finalTotal - originalTotal : 0 };
}
