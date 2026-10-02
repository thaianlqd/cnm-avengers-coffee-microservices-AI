import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { VoucherController } from '../modules/voucher/voucher.controller';
import { ThanhToanController } from '../modules/thanh-toan/thanh-toan.controller';
import { AppController } from '../app.controller';

const guest = 'anon-12345678-1234-4234-8234-123456789abc';
describe('Customer checkout and voucher HTTP boundaries', () => {
  it.each([
    [VoucherController.prototype, 'kiemTra'], [VoucherController.prototype, 'eligible'],
    [ThanhToanController.prototype, 'khoiTao'], [AppController.prototype, 'placeOrder'],
    [AppController.prototype, 'placeAiOrderDirect'], [AppController.prototype, 'placeAiOrderCustomer'],
  ])('requires JWT before reaching %s %s', (prototype, method) => {
    expect(Reflect.getMetadata(GUARDS_METADATA, prototype[method])).toContain(JwtAuthGuard);
  });
  it('does not quote an applied voucher or eligibility for a guest, even with internal caller', async () => {
    const service: any = { kiemTraVoucher: jest.fn(), layVoucherKhaDung: jest.fn() };
    const controller = new VoucherController(service);
    const req = { user: { username: 'internal-service' } };
    await expect(controller.kiemTra({ user_id: guest, ma_voucher: 'SAVE' }, req)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.eligible({ user_id: guest }, req)).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.kiemTraVoucher).not.toHaveBeenCalled(); expect(service.layVoucherKhaDung).not.toHaveBeenCalled();
  });
  it('does not send guest checkout to the payment service', () => {
    const service: any = { khoiTaoThanhToan: jest.fn() };
    const controller = new ThanhToanController(service);
    expect(() => controller.khoiTao(guest, { user: { username: 'internal-service' } } as any,
      { phuong_thuc_thanh_toan: 'THANH_TOAN_KHI_NHAN_HANG', dia_chi_giao_hang: 'A' })).toThrow(ForbiddenException);
    expect(service.khoiTaoThanhToan).not.toHaveBeenCalled();
  });
});
