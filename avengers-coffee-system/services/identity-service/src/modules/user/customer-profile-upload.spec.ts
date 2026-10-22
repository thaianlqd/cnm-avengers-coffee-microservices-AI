import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserController } from './user.controller';
import { avatarDataUrl, MAX_AVATAR_BYTES, validateAvatarUrl } from './avatar-upload';
import { selectedAddress } from './address-selection';

describe('Customer avatar upload and confirmed address boundary', () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  it('validates both MIME and bytes and rejects unsupported or oversized images', () => {
    expect(avatarDataUrl({ buffer: png, mimetype: 'image/png', size: png.length })).toMatch(/^data:image\/png;base64,/);
    expect(() => avatarDataUrl({ buffer: png, mimetype: 'image/jpeg', size: png.length })).toThrow(BadRequestException);
    expect(() => avatarDataUrl({ buffer: png, mimetype: 'image/png', size: MAX_AVATAR_BYTES + 1 })).toThrow(BadRequestException);
    expect(() => avatarDataUrl()).toThrow(BadRequestException);
    expect(() => validateAvatarUrl('data:image/svg+xml;base64,PHN2Zz4=')).toThrow(BadRequestException);
    expect(() => validateAvatarUrl('javascript:alert(1)')).toThrow(BadRequestException);
  });
  it('enforces profile ownership before persisting a multipart avatar', async () => {
    const service: any = { capNhatThongTinCaNhan: jest.fn().mockResolvedValue({ user: {} }) };
    const controller = new UserController(service);
    await expect(controller.uploadAvatar('another-user', { sub: 'customer', role: 'CUSTOMER' } as any,
      { buffer: png, mimetype: 'image/png', size: png.length })).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.capNhatThongTinCaNhan).not.toHaveBeenCalled();
    await controller.uploadAvatar('customer', { sub: 'customer', role: 'CUSTOMER' } as any,
      { buffer: png, mimetype: 'image/png', size: png.length });
    expect(service.capNhatThongTinCaNhan).toHaveBeenCalledWith('customer', { avatarUrl: expect.stringMatching(/^data:image\/png/) });
  });
  it.each([{ latitude: 10 }, { latitude: null, longitude: null }, { latitude: '10', longitude: 106 },
    { latitude: NaN, longitude: 106 }, { latitude: 91, longitude: 106 }])('rejects invalid coordinate pairs: %j', payload => {
    expect(() => selectedAddress({ ...payload, diaChiDayDu: 'Address' } as any)).toThrow(BadRequestException);
  });
  it('keeps provider coordinates and structured address together without a geocode guess', () => {
    expect(selectedAddress({ latitude: 10.77, longitude: 106.69, structuredAddress: {
      street: ' 12 Nguyễn Trãi ', ward: 'Phường Bến Thành', city: 'Hồ Chí Minh', provider: 'vietmap', placeId: 'selected-place',
    } })).toMatchObject({ vi_do: 10.77, kinh_do: 106.69, full: '12 Nguyễn Trãi, Phường Bến Thành, Hồ Chí Minh', structured: { placeId: 'selected-place' } });
  });
});
