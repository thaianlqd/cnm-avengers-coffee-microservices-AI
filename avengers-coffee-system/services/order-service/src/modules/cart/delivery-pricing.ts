import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { secretWithDevDefault } from '../../config/runtime-secrets';

// Shared by cart quotes and every payment path. Never read a client-supplied fee.
export async function quoteDeliveryFee(userId: string, subtotal: number, mode?: string, method?: string) {
  if (mode && !['GIAO_TAN_NOI', 'LAY_TAI_QUAN', 'DUNG_TAI_CHO', 'KIOSK'].includes(mode)) {
    throw new BadRequestException('Hinh thuc nhan hang khong hop le');
  }
  if (method && !['INTERNAL', 'LALAMOVE'].includes(method)) {
    throw new BadRequestException('Phuong thuc giao hang khong hop le');
  }
  const base = mode === 'GIAO_TAN_NOI' && subtotal > 0 ? (method === 'LALAMOVE' ? 25000 : 15000) : 0;
  if (!base) return { delivery_fee_base: 0, delivery_fee_discount: 0, delivery_fee: 0 };
  const guest = !userId || ['guest', 'anonymous'].includes(userId) || userId.startsWith('anon-');
  let reduction = 0;
  if (!guest) {
    try {
      const url = process.env.IDENTITY_SERVICE_URL || 'http://identity-service:3001';
      const response = await fetch(`${url}/users/${encodeURIComponent(userId)}/membership`, {
        headers: { 'x-internal-token': secretWithDevDefault('INTERNAL_SERVICE_TOKEN', 'test-only-internal-service-token') },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Membership HTTP ${response.status}`);
      const membership = await response.json();
      const benefits = membership.quyen_loi_hien_tai;
      if (!benefits) throw new Error('Missing membership benefits');
      const value = Math.max(0, Number(benefits.freeship_value || 0));
      const minimum = Math.max(0, Number(benefits.freeship_min_order || 0));
      if (!Number.isFinite(value) || !Number.isFinite(minimum)) throw new Error('Invalid membership benefits');
      if (!benefits.dac_quyen_khoa && subtotal >= minimum) reduction = Math.min(base, value);
    } catch {
      throw new ServiceUnavailableException('Chua the xac minh quyen freeship. Vui long thu lai.');
    }
  }
  return { delivery_fee_base: base, delivery_fee_discount: reduction, delivery_fee: base - reduction };
}
