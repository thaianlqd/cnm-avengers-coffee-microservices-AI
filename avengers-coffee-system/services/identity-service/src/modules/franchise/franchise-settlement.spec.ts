import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../auth/roles.guard';
import { FranchiseController } from './franchise.controller';
import { FranchiseService } from './franchise.service';
import { DonMuaCombo } from './entities/don-mua-combo.entity';
import { CongNo } from './entities/cong-no.entity';
import { Kiosk } from './entities/kiosk.entity';
import { RoyaltyHangThang } from './entities/royalty.entity';
import { User } from '../user/user.entity';
import { WalletTransaction } from '../user/wallet-transaction.entity';

function setup(overrides: any = {}) {
  const debt = { id: 'debt-1', kiosk_id: 'kiosk-1', royalty_id: 'royalty-1', so_tien: 7500000, phi_phat_tre_han: 100000, trang_thai: 'CON_NO', ...overrides.debt };
  const order = { id: 'combo-1', kiosk_id: 'kiosk-1', combo_id: 'product-1', so_luong: 2, tong_tien: 7500000, trang_thai: 'DA_DAT', phuong_thuc_thanh_toan: 'CONG_NO', thanh_toan_ngay: false, ...overrides.order };
  const user = { ma_nguoi_dung: 'partner-1', so_du_vi: 10000000, ...overrides.user };
  const repo = (record: any) => ({ findOne: jest.fn().mockResolvedValue(record), create: jest.fn(v => v), save: jest.fn(async v => v), update: jest.fn().mockResolvedValue({}), increment: jest.fn().mockResolvedValue({}), findBy: jest.fn().mockResolvedValue(record ? [record] : []) });
  const debts = repo(debt), orders = repo(order), users = repo(user), kiosks = repo(overrides.otherOwner ? null : { id: 'kiosk-1', franchisee_id: 'partner-1' });
  const royalties = repo({ id: 'royalty-1', kiosk_id: 'kiosk-1', trang_thai: 'DA_XAC_NHAN' }), wallet = repo(null);
  const repos = new Map<any, any>([[CongNo, debts], [DonMuaCombo, orders], [Kiosk, kiosks], [User, users], [RoyaltyHangThang, royalties], [WalletTransaction, wallet]]);
  const manager = { getRepository: jest.fn(type => repos.get(type)) };
  const service: FranchiseService = Object.assign(Object.create(FranchiseService.prototype), { dataSource: { transaction: jest.fn(cb => cb(manager)) }, congNoRepo: debts, donMuaComboRepo: orders, royaltyRepo: royalties, kioskRepo: kiosks, comboRepo: repo({ id: 'product-1' }), logAction: jest.fn() });
  return { service, debt, order, user, debts, orders, users, kiosks, royalties, wallet, manager };
}

describe('Combo acceptance and verified settlement', () => {
  it('accepts credit orders, issues a single linked payable, and does not add stock before delivery', async () => {
    const x = setup();
    await x.service.chapNhanDonCombo('combo-1', 'manager-1');
    expect(x.order.trang_thai).toBe('DA_XAC_NHAN');
    expect(x.orders.findOne).toHaveBeenCalledWith({ where: { id: 'combo-1' }, lock: { mode: 'pessimistic_write' } });
    expect(x.debts.save).toHaveBeenCalledWith(expect.objectContaining({ don_mua_combo_id: 'combo-1', so_tien: 7500000, loai_phat_sinh: 'NGUYEN_LIEU' }));
    expect(x.kiosks.increment).not.toHaveBeenCalled();
    await expect(x.service.chapNhanDonCombo('combo-1', 'manager-1')).rejects.toThrow(BadRequestException);
    expect(x.debts.save).toHaveBeenCalledTimes(1);
  });
  it('does not create a debt for an order already paid through the system', async () => {
    const x = setup({ order: { thanh_toan_ngay: true, phuong_thuc_thanh_toan: 'VI_DIEN_TU' } });
    await x.service.chapNhanDonCombo('combo-1', 'manager-1');
    expect(x.debts.save).not.toHaveBeenCalled();
  });
  it('requires acceptance before delivery, then does not duplicate its existing debt', async () => {
    const x = setup();
    await expect(x.service.xacNhanDaGiaoCombo('combo-1', 'manager-1')).rejects.toThrow('Cần chấp nhận');
    x.order.trang_thai = 'DA_XAC_NHAN';
    await x.service.xacNhanDaGiaoCombo('combo-1', 'manager-1');
    expect(x.kiosks.increment).toHaveBeenCalledTimes(1);
    expect(x.debts.save).not.toHaveBeenCalled();
    await expect(x.service.xacNhanDaGiaoCombo('combo-1', 'manager-1')).rejects.toThrow();
    expect(x.kiosks.increment).toHaveBeenCalledTimes(1);
  });
  it('locks debt and wallet, deducts principal plus late fees and marks royalty paid within the transaction', async () => {
    const x = setup();
    await x.service.thanhToanViRoyalty('royalty-1', 'partner-1');
    expect(x.debts.findOne).toHaveBeenCalledWith({ where: { id: 'debt-1' }, lock: { mode: 'pessimistic_write' } });
    expect(x.users.findOne).toHaveBeenCalledWith({ where: { ma_nguoi_dung: 'partner-1' }, lock: { mode: 'pessimistic_write' } });
    expect(x.user.so_du_vi).toBe(2400000);
    expect(x.wallet.save).toHaveBeenCalledWith(expect.objectContaining({ so_tien: -7600000, ma_nguoi_dung: 'partner-1' }));
    expect(x.royalties.update).toHaveBeenCalledWith({ id: 'royalty-1' }, expect.objectContaining({ trang_thai: 'DA_THANH_TOAN' }));
    await expect(x.service.thanhToanViCongNo('debt-1', 'partner-1')).rejects.toThrow('đã được thanh toán');
    expect(x.users.save).toHaveBeenCalledTimes(1);
    expect(x.wallet.save).toHaveBeenCalledTimes(1);
  });
  it.each([{ otherOwner: true }, { user: { so_du_vi: 100 } }, { debt: { trang_thai: 'DA_THANH_TOAN' } }])('refuses unauthorized, insufficient or repeated payments without financial writes (%j)', async overrides => {
    const x = setup(overrides);
    await expect(x.service.thanhToanViCongNo('debt-1', 'partner-1')).rejects.toThrow();
    for (const repo of [x.users, x.wallet, x.debts]) expect(repo.save).not.toHaveBeenCalled();
    expect(x.royalties.update).not.toHaveBeenCalled();
  });
  it('manager confirmation synchronizes royalties without charging a wallet', async () => {
    const x = setup();
    await x.service.ghiNhanThanhToanRoyalty('royalty-1', 'manager-1');
    expect(x.users.save).not.toHaveBeenCalled();
    expect(x.wallet.save).not.toHaveBeenCalled();
    expect(x.royalties.update).toHaveBeenCalledWith({ id: 'royalty-1' }, expect.objectContaining({ trang_thai: 'DA_THANH_TOAN' }));
  });
  it('derives payment from existing settled debt for legacy statements, without rewriting stored financial data', async () => {
    const x = setup({ debt: { trang_thai: 'DA_THANH_TOAN' } });
    const result = await (x.service as any).enrichRoyalty([{ id: 'royalty-1', kiosk_id: 'kiosk-1', trang_thai: 'DA_XAC_NHAN' }]);
    expect(result[0].trang_thai).toBe('DA_THANH_TOAN');
    expect(x.debts.save).not.toHaveBeenCalled();
    expect(x.royalties.update).not.toHaveBeenCalled();
  });
  it('a delivered credit order with unpaid debt is still unpaid on its invoice', async () => {
    const x = setup({ debt: { don_mua_combo_id: 'combo-1', trang_thai: 'CON_NO' }, order: { trang_thai: 'DA_GIAO' } });
    const result = await (x.service as any).enrichComboOrders([x.order]);
    expect(result[0].da_thanh_toan).toBe(false);
  });
  it('scopes acceptance to managers and wallet royalty settlement to partners', () => {
    const guard = new RolesGuard(new Reflector());
    const context = (role: string, handler: any) => ({ getHandler: () => handler, getClass: () => FranchiseController, switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }) }) as any;
    expect(guard.canActivate(context('ACCOUNTANT', FranchiseController.prototype.chapNhanDonCombo))).toBe(true);
    expect(() => guard.canActivate(context('FRANCHISEE', FranchiseController.prototype.chapNhanDonCombo))).toThrow();
    expect(guard.canActivate(context('FRANCHISEE', FranchiseController.prototype.thanhToanViRoyalty))).toBe(true);
  });
});
