import { assertLoginWorkspace } from './workspace-policy';
import { UserService } from '../modules/user/user.service';
import { createHash } from 'crypto';

const pairs = [['admin', 'ADMIN'], ['manager', 'MANAGER'], ['staff', 'STAFF'], ['partner', 'FRANCHISEE'], ['accountant', 'ACCOUNTANT']];
describe('workspace login separation', () => {
  for (const [portal, role] of pairs) {
    it(`accepts ${role} only in its ${portal} portal`, () => {
      expect(() => assertLoginWorkspace(portal, role)).not.toThrow();
      for (const [other] of pairs.filter(([name]) => name !== portal)) {
        expect(() => assertLoginWorkspace(other, role)).toThrow('Tài khoản không thuộc nhóm');
      }
    });
  }
  it('keeps customer/mobile login compatible and rejects invalid portal values', () => {
    expect(() => assertLoginWorkspace(undefined, 'CUSTOMER')).not.toThrow();
    for (const value of ['other', 'toString', '', null, ['admin']]) {
      expect(() => assertLoginWorkspace(value, 'ADMIN')).toThrow('Nhóm đăng nhập không hợp lệ');
    }
    for (const role of ['KIOSK_STAFF', 'FRANCHISE_STAFF']) {
      expect(() => assertLoginWorkspace('staff', role)).not.toThrow();
      expect(() => assertLoginWorkspace('partner', role)).toThrow();
    }
  });
  const serviceForRole = (role: string, extra: Record<string, unknown> = {}) => {
    const user = { ma_nguoi_dung: 'fixture', vai_tro: role, trang_thai: 'ACTIVE',
      mat_khau_hash: createHash('sha256').update('fixture-password').digest('hex'), ...extra };
    const service = Object.create(UserService.prototype) as any;
    service.userRepo = { findOne: jest.fn(async () => user) };
    service.kiemTraVaSinhVoucherSinhNhatChoUser = jest.fn(async () => false);
    service.jwtService = { signAsync: jest.fn(async () => 'fixture-token') };
    return service;
  };
  it('rejects manager in partner portal before issuing token, vouchers or password-change response', async () => {
    const service = serviceForRole('MANAGER', { require_password_change: true });
    await expect(service.login({ tai_khoan: 'fixture', mat_khau: 'fixture-password', workspace: 'partner' })).rejects.toThrow('Tài khoản không thuộc nhóm');
    expect(service.jwtService.signAsync).not.toHaveBeenCalled();
    expect(service.kiemTraVaSinhVoucherSinhNhatChoUser).not.toHaveBeenCalled();
  });
  it('keeps ADMIN role when an account has an incidental kiosk ID', async () => {
    const service = serviceForRole('ADMIN', { kiosk_id: 'fixture-kiosk' });
    const result = await service.login({ tai_khoan: 'fixture', mat_khau: 'fixture-password', workspace: 'admin' });
    expect(result.user.vaiTro).toBe('ADMIN');
    expect(service.jwtService.signAsync).toHaveBeenCalledWith(expect.objectContaining({ role: 'ADMIN' }));
  });
  it('routes staff in a franchise kiosk to staff portal, never partner portal', async () => {
    const service = serviceForRole('STAFF', { kiosk_id: 'fixture-kiosk' });
    await expect(service.login({ tai_khoan: 'fixture', mat_khau: 'fixture-password', workspace: 'partner' })).rejects.toThrow();
    const result = await service.login({ tai_khoan: 'fixture', mat_khau: 'fixture-password', workspace: 'staff' });
    expect(result.user.vaiTro).toBe('FRANCHISE_STAFF');
  });
});
