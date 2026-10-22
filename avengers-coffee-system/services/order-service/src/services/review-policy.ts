import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

const schema = process.env.DB_SCHEMA || 'orders';

export function assertRating(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) {
    throw new BadRequestException('Điểm đánh giá phải là số nguyên từ 1 đến 5');
  }
}

export function duplicateReview() {
  return new ConflictException('Đơn hàng này đã được đánh giá trước đó');
}

// All review writers lock the same order, so concurrent submissions cannot
// both pass the duplicate check, including the legacy product endpoint.
export async function lockReviewOrder(manager: EntityManager, orderId: string | undefined, userId: string) {
  if (!orderId || !/^[a-f0-9-]{36}$/i.test(orderId)) {
    throw new BadRequestException('Cần chọn đơn hàng đã hoàn thành để đánh giá');
  }
  const [order] = await manager.query(
    `SELECT ma_don_hang, ma_nguoi_dung, co_so_ma, trang_thai_don_hang, loai_don_hang
     FROM "${schema}"."don_hang" WHERE ma_don_hang = $1 FOR UPDATE`,
    [orderId],
  );
  if (!order || order.ma_nguoi_dung !== userId) {
    throw new ForbiddenException('Bạn chỉ được đánh giá đơn hàng của mình');
  }
  if (order.trang_thai_don_hang !== 'HOAN_THANH' || !order.co_so_ma) {
    throw new BadRequestException('Chỉ được đánh giá đơn hàng đã hoàn thành tại chi nhánh xử lý đơn');
  }
  return order;
}

// Hide explicitly marked fixtures instead of stripping their provenance and
// misrepresenting generated feedback as customer purchases.
export function isPublicReview(row: Record<string, any>) {
  const content = [row.binh_luan, row.nhan_xet, row.ten_nguoi_dung].filter(Boolean).join(' ');
  return !row.is_demo && !row.is_seed &&
    !/dữ liệu mẫu|du lieu mau|đánh giá mẫu|danh gia mau|\btest (review|user)\b|\bmock\b|\blorem ipsum\b|\bseeded review\b|\[demo\]/iu.test(content);
}
