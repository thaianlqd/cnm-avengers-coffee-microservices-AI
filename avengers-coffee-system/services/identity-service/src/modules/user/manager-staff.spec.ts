import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { ROLES_KEY } from '../../auth/auth.decorators';

describe('Manager creates store staff in the authenticated branch', () => {
  const manager = { sub: 'manager-1', role: 'MANAGER', branchCode: 'STORE-1', branchName: 'Store 1', username: 'manager', email: null };
  const payload = { ten_dang_nhap: 'staff-test', mat_khau: 'test-password', ho_ten: 'Nhân viên thử nghiệm' };
  it('limits the endpoint to managers', () => {
    expect(Reflect.getMetadata(ROLES_KEY, UserController.prototype.taoNhanVienCuaHang)).toEqual(['MANAGER']);
  });
  it('forces STAFF and the authenticated branch even when a caller submits a different role or branch', async () => {
    const service = Object.create(UserService.prototype) as any;
    service.taoTaiKhoanHeThong = jest.fn().mockResolvedValue({ item: { vai_tro: 'STAFF', co_so_ma: 'STORE-1' } });
    await service.taoNhanVienCuaHang(manager, { ...payload, vai_tro: 'ADMIN', co_so_ma: 'OTHER', trang_thai: 'INACTIVE' });
    expect(service.taoTaiKhoanHeThong).toHaveBeenCalledWith({ ...payload, email: undefined, vai_tro: 'STAFF', co_so_ma: 'STORE-1' });
  });
  it('rejects staff and managers without an assigned branch before creating anything', async () => {
    const service = Object.create(UserService.prototype) as any;
    service.taoTaiKhoanHeThong = jest.fn();
    await expect(service.taoNhanVienCuaHang({ ...manager, role: 'STAFF' }, payload)).rejects.toThrow(UnauthorizedException);
    await expect(service.taoNhanVienCuaHang({ ...manager, branchCode: null }, payload)).rejects.toThrow(BadRequestException);
    expect(service.taoTaiKhoanHeThong).not.toHaveBeenCalled();
  });
  it('uses existing account validation, hashing and persistence for an active store employee', async () => {
    const service = Object.create(UserService.prototype) as any;
    service.resolveBranchInfo = jest.fn().mockResolvedValue({ code: 'STORE-1', name: 'Store 1' });
    service.userRepo = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn(value => value), save: jest.fn(async value => value) };
    const result = await service.taoNhanVienCuaHang(manager, payload);
    expect(service.resolveBranchInfo).toHaveBeenCalledWith('STORE-1');
    expect(result.item).toMatchObject({ vai_tro: 'STAFF', trang_thai: 'ACTIVE', co_so_ma: 'STORE-1', co_so_ten: 'Store 1' });
    expect(service.userRepo.save.mock.calls[0][0].mat_khau_hash).not.toBe(payload.mat_khau);
    expect(service.userRepo.save.mock.calls[0][0].mat_khau_hash).toMatch(/^\$2/);
  });
});
