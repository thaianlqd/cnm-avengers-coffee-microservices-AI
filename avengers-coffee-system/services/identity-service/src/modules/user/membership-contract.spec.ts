import { UserService } from './user.service';

describe('membership delivery-pricing contract', () => {
  const originalConfig = (UserService as any).tierConfigCache;
  afterEach(() => { (UserService as any).tierConfigCache = originalConfig; });

  const makeService = (points: number, monthlySpend: number) => {
    (UserService as any).tierConfigCache = [
      { ma_hang: 'MEMBER', ten_hang: 'Thành viên', diem_toi_thieu: 0, chi_tieu_toi_thieu_thang: 0, freeship_value: 0, freeship_min_order: 0 },
      { ma_hang: 'GOLD', ten_hang: 'Vàng', diem_toi_thieu: 10, chi_tieu_toi_thieu_thang: 100000, freeship_value: 25000, freeship_min_order: 100000 },
    ];
    const users = { findOne: jest.fn(async () => ({ diem_loyalty: points, chi_tieu_thang_nay: monthlySpend,
      thang_chi_tieu_gan_nhat: new Date().toISOString().substring(0, 7) })), save: jest.fn() };
    const promotions = { find: jest.fn(async () => []) };
    const service = new UserService({} as any, users as any, {} as any, {} as any,
      promotions as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    return { service, users };
  };

  it('returns authoritative freeship fields calculated for an eligible member', async () => {
    const { service, users } = makeService(20, 110000);
    const result = await service.layThongTinMembership('customer');
    expect(result.quyen_loi_hien_tai).toMatchObject({ freeship_value: 25000, freeship_min_order: 100000, dac_quyen_khoa: false });
    expect(result.hang_hien_tai.ma_hang).toBe('GOLD');
    expect(result.chi_tieu_toi_thieu_thang).toBe(100000);
    expect(result.con_thieu_thang_nay).toBe(0);
    expect(result.dat_dieu_kien_dac_quyen).toBe(true);
    expect(users.save).not.toHaveBeenCalled();
  });

  it('a user without an earned membership tier has explicit zero freeship', async () => {
    const { service } = makeService(0, 0);
    const result = await service.layThongTinMembership('customer');
    expect(result.hang_hien_tai.ma_hang).toBe('MEMBER');
    expect(result.quyen_loi_hien_tai).toMatchObject({ freeship_value: 0, freeship_min_order: 0, dac_quyen_khoa: false });
  });

  it('preserves monthly eligibility rules rather than inventing freeship', async () => {
    const { service } = makeService(20, 0);
    const result = await service.layThongTinMembership('customer');
    expect(result.quyen_loi_hien_tai.freeship_value).toBe(0);
    expect(result.dat_dieu_kien_dac_quyen).toBe(false);
    expect(result.con_thieu_thang_nay).toBe(100000);
  });

  it('an unknown user is still rejected, never assigned assumed benefits', async () => {
    const { service, users } = makeService(0, 0);
    users.findOne.mockResolvedValueOnce(null as any);
    await expect(service.layThongTinMembership('missing')).rejects.toThrow('Khong tim thay nguoi dung');
  });
});
