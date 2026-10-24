import { BadRequestException } from '@nestjs/common';
import { branchCoordinates, inBranchArea, searchBranchAddresses } from './branch-location';
import { UserService } from './user.service';

describe('Confirmed branch map locations', () => {
  const point = { vi_do: 10.773, kinh_do: 106.704 };
  it.each([{ vi_do: 10 }, { vi_do: null, kinh_do: null }, { vi_do: '10', kinh_do: 106 },
    { vi_do: NaN, kinh_do: 106 }, { vi_do: 91, kinh_do: 106 }, { vi_do: 10, kinh_do: -181 }])('rejects incomplete or invalid pairs %j', payload => {
    expect(() => branchCoordinates(payload as any)).toThrow(BadRequestException);
  });
  it('accepts zero and preserves the full coordinate precision', () => {
    expect(branchCoordinates({ vi_do: 0, kinh_do: 0 })).toEqual({ vi_do: 0, kinh_do: 0 });
    expect(branchCoordinates({ vi_do: 10.77312345, kinh_do: 106.70412345 })).toEqual({ vi_do: 10.77312345, kinh_do: 106.70412345 });
  });
  it('retains compatibility for callers that do not submit coordinates', () => expect(branchCoordinates({})).toBeUndefined());
  it('persists coordinates on create and edit, and returns them through the existing branch contract used by shippers', async () => {
    const service = Object.create(UserService.prototype) as any;
    let stored: any;
    const builder: any = { update: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), execute: jest.fn().mockResolvedValue({}) };
    service.userRepo = { createQueryBuilder: () => builder };
    service.branchRepo = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn(value => value), save: jest.fn(async value => (stored = { ...value })) };
    const created = await service.taoChiNhanhAdmin({ ma_chi_nhanh: 'MAP_TEST', ten_chi_nhanh: 'Map test', dia_chi: '12 Nguyễn Huệ', ...point });
    expect(created.item).toMatchObject(point);
    service.branchRepo.findOne.mockImplementation(async ({ where }) => where.ma_chi_nhanh ? stored : null);
    const updated = await service.capNhatChiNhanhAdmin('MAP_TEST', { dia_chi: '45 Nguyễn Huệ', vi_do: 10.774, kinh_do: 106.705 });
    expect(updated.item).toMatchObject({ vi_do: 10.774, kinh_do: 106.705 });
    const unchanged = await service.capNhatChiNhanhAdmin('MAP_TEST', { so_dien_thoai: '0900000000' });
    expect(unchanged.item.vi_do).toBe(10.774);
    const legacy = await service.capNhatChiNhanhAdmin('MAP_TEST', { dia_chi: 'Changed without a confirmed map location' });
    expect(legacy.item).toMatchObject({ vi_do: null, kinh_do: null });
  });
  it('does not look up addresses before city and ward are selected', async () => {
    const fetcher = jest.fn();
    expect(await searchBranchAddresses('Nguyễn Huệ', 'Hồ Chí Minh', '', fetcher as any, '')).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('filters out another ward, another city and invalid coordinates without fabricating a match', () => {
    const place = { id: 'map-id', title: '12 Nguyễn Huệ', address: '12 Nguyễn Huệ, Phường Sài Gòn, Hồ Chí Minh', ...point, city: 'Hồ Chí Minh', ward: 'Phường Sài Gòn', provider: 'vietmap' };
    expect(inBranchArea(place, 'Thành phố Hồ Chí Minh', 'Phường Sài Gòn')).toBe(true);
    expect(inBranchArea(place, 'Hồ Chí Minh', 'Phường Bến Thành')).toBe(false);
    expect(inBranchArea(place, 'Hà Nội', 'Phường Sài Gòn')).toBe(false);
    expect(inBranchArea({ ...place, vi_do: NaN }, 'Hồ Chí Minh', 'Phường Sài Gòn')).toBe(false);
  });
  it('resolves Vietmap place details and retains only locations within both selected administrative areas', async () => {
    const fetcher = jest.fn().mockResolvedValueOnce({ ok: true, json: async () => [{ ref_id: 'correct' }, { ref_id: 'wrong' }] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ name: '45 Nguyễn Huệ', display: '45 Nguyễn Huệ, Phường Sài Gòn, Hồ Chí Minh', city: 'Hồ Chí Minh', ward: 'Phường Sài Gòn', lat: '10.773', lng: '106.704' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ name: 'Other address', display: 'Phường Bến Thành, Hồ Chí Minh', city: 'Hồ Chí Minh', ward: 'Bến Thành', lat: 10.77, lng: 106.7 }) });
    const items = await searchBranchAddresses('Nguyễn Huệ', 'Hồ Chí Minh', 'Phường Sài Gòn', fetcher as any, 'test-key');
    expect(items).toHaveLength(1); expect(items[0]).toMatchObject({ id: 'correct', ...point });
    expect(new URL(fetcher.mock.calls[0][0]).searchParams.get('text')).toBe('Nguyễn Huệ, Phường Sài Gòn, Hồ Chí Minh');
  });
  it('surfaces provider failures rather than offering guessed district centroids', async () => {
    await expect(searchBranchAddresses('Nguyễn Huệ', 'Hồ Chí Minh', 'Sài Gòn', jest.fn().mockResolvedValue({ ok: false }) as any, '')).rejects.toThrow();
  });
});
