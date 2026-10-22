import { BadRequestException } from '@nestjs/common';

export type AddressPayload = {
  tenDiaChi?: string; diaChiDayDu?: string; ghiChu?: string; macDinh?: boolean;
  latitude?: number | null; longitude?: number | null;
  structuredAddress?: { street?: string; ward?: string; district?: string; city?: string; provider?: string; placeId?: string };
};

export function selectedAddress(payload: AddressPayload) {
  const lat = payload.latitude, lng = payload.longitude;
  const hasPoint = lat != null && lng != null;

  if (hasPoint) {
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)
        || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new BadRequestException('Vui lòng chọn địa chỉ gợi ý hoặc xác nhận vị trí GPS hợp lệ.');
    }
  }

  const parts = payload.structuredAddress;
  const structured = parts ? Object.fromEntries(['street', 'ward', 'district', 'city', 'provider', 'placeId']
    .map(key => [key, String(parts[key] || '').trim().slice(0, 500)])) : null;
  const full = structured ? [...new Set([structured.street, structured.ward, structured.district, structured.city].filter(Boolean))].join(', ') : payload.diaChiDayDu?.trim();
  if (!full && !payload.diaChiDayDu?.trim()) throw new BadRequestException('Địa chỉ không được để trống.');

  return { vi_do: hasPoint ? lat : null, kinh_do: hasPoint ? lng : null, structured, full: full || payload.diaChiDayDu?.trim() || '' };
}
