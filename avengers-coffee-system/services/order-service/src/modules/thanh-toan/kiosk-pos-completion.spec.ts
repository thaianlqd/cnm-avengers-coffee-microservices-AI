import { createHmac } from 'crypto';
import { ThanhToanService } from './thanh-toan.service';
import { DonHang } from './entities/don-hang.entity';
import { ChiTietDonHang } from './entities/chi-tiet-don-hang.entity';

function counterService() {
  const service = Object.create(ThanhToanService.prototype) as any;
  const repository = () => ({ create: jest.fn(value => value), save: jest.fn(async value => Array.isArray(value) ? value : { ...value, ngay_tao: new Date(), ngay_cap_nhat: new Date() }) });
  const orders = repository(), lines = repository(), payments = repository();
  service.donHangRepo = { manager: { transaction: async callback => callback({ getRepository: entity => entity === DonHang ? orders : entity === ChiTietDonHang ? lines : payments }) } };
  service.kioskShiftSessionRepo = { findOne: jest.fn().mockResolvedValue({ trang_thai:'OPEN' }) };
  service.invalidateOrderCaches = jest.fn();
  service.publishOrderCreatedEvent = jest.fn();
  service.taoQrNganHang = jest.fn().mockReturnValue('https://example.test/qr');
  service.taoUrlVnpayThat = jest.fn().mockReturnValue('https://example.test/payment');
  return { service, orders, payments };
}
const sale = { branch_code:'KSK-052', loai_don_hang:'TAI_CHO', phuong_thuc_thanh_toan:'THANH_TOAN_KHI_NHAN_HANG', tien_khach_dua:100000, items:[{ ma_san_pham:1,ten_san_pham:'Cà phê',so_luong:1,gia_ban:65000 }] };

describe('kiosk takeaway payment completion', () => {
  it('records a cash sale as paid and completed, including change, without kitchen stages', async () => {
    const { service, payments } = counterService();
    const response = await service.taoDonTaiQuayChoStaff(sale, '127.0.0.1', 'FRANCHISE_KIOSK');
    expect(response.order).toMatchObject({ loai_don_hang:'MANG_DI', trang_thai_don_hang:'HOAN_THANH', trang_thai_thanh_toan:'DA_THANH_TOAN', tien_khach_dua:100000, tien_thoi:35000 });
    expect(payments.save).toHaveBeenCalledWith(expect.objectContaining({ trang_thai:'THANH_CONG', so_tien:65000 }));
  });
  it.each(['NGAN_HANG_QR','VNPAY'])('keeps %s pending until payment confirmation', async method => {
    const { service, payments } = counterService();
    const response = await service.taoDonTaiQuayChoStaff({ ...sale, phuong_thuc_thanh_toan:method }, '127.0.0.1', 'FRANCHISE_KIOSK');
    expect(response.order).toMatchObject({ loai_don_hang:'MANG_DI', trang_thai_don_hang:'MOI_TAO', trang_thai_thanh_toan:'CHO_XU_LY' });
    expect(payments.save).toHaveBeenCalledWith(expect.objectContaining({ trang_thai:'CHO_THANH_TOAN' }));
  });
  it('keeps the main store workflow and dine-in order type', async () => {
    const { service } = counterService();
    const response = await service.taoDonTaiQuayChoStaff({ ...sale,branch_code:'HC-01' }, '127.0.0.1', 'STORE_BRANCH');
    expect(response.order).toMatchObject({ loai_don_hang:'TAI_CHO', trang_thai_don_hang:'MOI_TAO', trang_thai_thanh_toan:'CHO_THANH_TOAN_KHI_NHAN_HANG' });
  });
  it('rejects insufficient cash and a kiosk with no active shift before saving', async () => {
    const { service, orders } = counterService();
    await expect(service.taoDonTaiQuayChoStaff({ ...sale, tien_khach_dua:1000 }, '127.0.0.1', 'FRANCHISE_KIOSK')).rejects.toThrow('khong du');
    service.kioskShiftSessionRepo.findOne.mockResolvedValue(null);
    await expect(service.taoDonTaiQuayChoStaff(sale, '127.0.0.1', 'FRANCHISE_KIOSK')).rejects.toThrow('chưa mở ca');
    expect(orders.save).not.toHaveBeenCalled();
  });
  it('rejects manual preparation/status changes for kiosk orders', async () => {
    const { service } = counterService();
    service.donHangRepo.findOne = jest.fn().mockResolvedValue({ ...sale, co_so_ma:'KSK-052',trang_thai_don_hang:'HOAN_THANH' });
    await expect(service.capNhatTrangThaiDonHangChoStaff('order-1','DANG_CHUAN_BI','KSK-052')).rejects.toThrow('Chỉ sử dụng chức năng hoàn tiền');
  });
  it('completes a confirmed QR kiosk payment but retains normal store confirmation', async () => {
    for (const code of ['KSK-052','HC-01']) {
      const { service } = counterService();
      service.giaoDichRepo = { findOne:jest.fn().mockResolvedValue({ ma_don_hang:'order-1',ma_tham_chieu:'QR-order-1',so_tien:65000,trang_thai:'CHO_THANH_TOAN' }),update:jest.fn().mockResolvedValue({ affected:1 }) };
      service.donHangRepo.findOne = jest.fn().mockResolvedValue({ ma_don_hang:'order-1',co_so_ma:code,loai_don_hang:'MANG_DI' });
      service.capNhatTrangThaiDonHangHeThong = jest.fn();
      service.trichXuatMaThamChieuQr = () => 'QR-order-1';
      await service.xuLyWebhookSepay({ content:'QR-order-1',transferAmount:65000 }, {}, '');
      expect(service.capNhatTrangThaiDonHangHeThong).toHaveBeenCalledWith('order-1',expect.objectContaining({ trang_thai_thanh_toan:'DA_THANH_TOAN', trang_thai_don_hang:code.startsWith('KSK') ? 'HOAN_THANH' : 'DA_XAC_NHAN' }));
    }
  });
});


test('a verified VNPay callback completes kiosk takeaway without changing the store workflow', async () => {
  for (const code of ['KSK-052', 'HC-01']) {
    const { service } = counterService();
    service.VNP_HASH_SECRET = 'test-secret';
    service.giaoDichRepo = { findOne:jest.fn().mockResolvedValue({ma_don_hang:'order-1',ma_tham_chieu:'txn-1',so_tien:65000,trang_thai:'CHO_THANH_TOAN'}), save:jest.fn() };
    service.donHangRepo.findOne = jest.fn().mockResolvedValue({ma_don_hang:'order-1',co_so_ma:code,loai_don_hang:'MANG_DI'});
    service.capNhatTrangThaiDonHangHeThong = jest.fn();
    const signature = createHmac('sha512','test-secret').update('vnp_Amount=6500000&vnp_ResponseCode=00&vnp_TxnRef=txn-1').digest('hex');
    expect(await service.xuLyVnpayIpn({vnp_Amount:'6500000',vnp_ResponseCode:'00',vnp_TxnRef:'txn-1',vnp_SecureHash:signature})).toMatchObject({RspCode:'00'});
    expect(service.capNhatTrangThaiDonHangHeThong).toHaveBeenCalledWith('order-1',expect.objectContaining({trang_thai_don_hang:code.startsWith('KSK') ? 'HOAN_THANH' : 'DA_XAC_NHAN'}));
  }
});
