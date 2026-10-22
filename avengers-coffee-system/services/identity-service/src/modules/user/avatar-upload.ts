import { BadRequestException } from '@nestjs/common';

export const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
export type AvatarFile = { buffer: Buffer; mimetype: string; size: number };

export function avatarDataUrl(file?: AvatarFile): string {
  if (!file?.buffer?.length) throw new BadRequestException('Tệp ảnh trống hoặc không đọc được.');
  if (file.size > MAX_AVATAR_BYTES || file.buffer.length > MAX_AVATAR_BYTES) {
    throw new BadRequestException('Ảnh vượt quá 3 MB. Vui lòng chọn ảnh nhỏ hơn.');
  }
  const bytes = file.buffer;
  const valid = (file.mimetype === 'image/jpeg' && bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
    || (file.mimetype === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    || (file.mimetype === 'image/webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP');
  if (!valid) throw new BadRequestException('Chỉ chấp nhận ảnh JPG, JPEG, PNG hoặc WebP.');
  return `data:${file.mimetype};base64,${bytes.toString('base64')}`;
}

export function validateAvatarUrl(value: string): string {
  if (!value) return '';
  const data = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (data) {
    if (value.length > Math.ceil(MAX_AVATAR_BYTES * 4 / 3) + 64) throw new BadRequestException('Ảnh vượt quá 3 MB.');
    const buffer = Buffer.from(data[2], 'base64');
    return avatarDataUrl({ buffer, size: buffer.length, mimetype: data[1] });
  }
  if (value.length > 2048 || !/^https?:\/\/[^\s]+$/i.test(value)) throw new BadRequestException('Đường dẫn ảnh không hợp lệ.');
  return value;
}
