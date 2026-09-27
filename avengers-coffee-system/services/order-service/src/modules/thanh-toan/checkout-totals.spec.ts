import * as crypto from 'crypto';
import { ThanhToanService } from './thanh-toan.service';

describe('checkout amount across all payment paths', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });
  function service(freeship = 0) {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ quyen_loi_hien_tai: { freeship_value: freeship, freeship_min_order: 0 } }) })) as any;
    const s: any = Object.create(ThanhToanService.prototype);
    const orders = new Map();
    const transactions = new Map();
    s.cartRepo = { find: jest.fn(async () => [{ ma_san_pham: 1, ten_san_pham: 'Nước + bánh', gia_ban: 313000, so_luong: 1 }]), delete: jest.fn() };
    const runner = { connect: jest.fn(), query: jest.fn(async () => [{locked:true}]), release: jest.fn() };
    s.donHangRepo = { create: (v: any) => v, save: jest.fn(async (v: any) => { orders.set(v.ma_don_hang, v); return v; }), findOne: jest.fn(async ({where}: any) => orders.get(where.ma_don_hang)), manager: { connection: { createQueryRunner: () => runner } } };
    s.chiTietRepo = { create: (v: any) => v, save: jest.fn() };
    s.giaoDichRepo = { create: (v: any) => v, save: jest.fn(async (v: any) => { transactions.set(v.ma_don_hang, v); return v; }), findOne: jest.fn(async ({where}: any) => transactions.get(where.ma_don_hang)) };
    s.voucherService = { kiemTraVoucher: jest.fn(async () => ({ so_tien_giam: 62600, voucher: { ma_voucher: 'SAVE20' } })), apDungVoucher: jest.fn() };
    s.notificationService = { taoThongBao: jest.fn() };
    s.deliveryTrackingService = { createTracking: jest.fn(async () => ({ tracking_code: 'track' })) };
    s.customerWalletService = { deductBalance: jest.fn() };
    s.xacDinhCoSoGanNhatTheoDiaChi = jest.fn(async () => ({ branchCode: 'CN_1' }));
    s.normalizeBranchCode = (v: string) => v;
    s.kiemTraTonKhoTruocKhiTaoDon = jest.fn();
    s.guiEmailXacNhanDonHang = jest.fn(async () => undefined);
    s.taoMaThamChieu = () => 'ref';
    s.invalidateOrderCaches = jest.fn(); s.publishOrderCreatedEvent = jest.fn(); s.tichDiemLoyalty = jest.fn();
    s.taoUrlVnpayThat = jest.fn(() => 'https://payment.test'); s.chuanHoaIpVnpay = (v: string) => v;
    s.taoQrNganHang = jest.fn(() => 'qr'); s.taoQrNganHangDuPhong = jest.fn(() => 'qr-fallback');
    return { s, runner };
  }
  const payments = ['THANH_TOAN_KHI_NHAN_HANG', 'VNPAY', 'NGAN_HANG_QR', 'VI_DIEN_TU'];
  const cases = payments.flatMap(payment => ['GIAO_TAN_NOI', 'LAY_TAI_QUAN', 'DUNG_TAI_CHO'].map(mode => [payment, mode]));
  it.each(cases)('%s / %s uses one server total', async (payment, mode) => {
    const {s} = service();
    const expected = mode === 'GIAO_TAN_NOI' ? 265400 : 250400;
    const result = await s.khoiTaoThanhToan('user', { phuong_thuc_thanh_toan: payment, delivery_mode: mode, branch_code: 'CN_1', dia_chi_giao_hang: '42/3 Nguyễn Hữu Tiến', ma_voucher: 'SAVE20', phi_giao_hang: 1, final_total: 1 });
    expect(Number(result.don_hang.tong_tien)).toBe(expected);
    expect(s.giaoDichRepo.save.mock.calls[0][0].so_tien).toBe(expected);
    if (payment === 'VI_DIEN_TU') expect(s.customerWalletService.deductBalance).toHaveBeenCalledWith('user', expected, 'ref');
    if (payment === 'VNPAY') expect(s.taoUrlVnpayThat.mock.calls[0][2]).toBe(expected);
    if (payment === 'NGAN_HANG_QR') expect(result.payment_details.so_tien).toBe(expected);
  });
  it.each(payments)('%s applies membership before charging', async payment => {
    const {s} = service(15000);
    const result = await s.khoiTaoThanhToan('user', { phuong_thuc_thanh_toan: payment, delivery_mode: 'GIAO_TAN_NOI', dia_chi_giao_hang: 'Địa chỉ', ma_voucher: 'SAVE20' });
    expect(Number(result.don_hang.tong_tien)).toBe(250400);
    expect(s.giaoDichRepo.save.mock.calls[0][0].so_tien).toBe(250400);
  });
  it.each(payments)('%s replays the same summary after response timeout, with no second side effects', async payment => {
    const {s, runner} = service();
    const dto = { checkout_action_id: '12345678-1234-4234-8234-123456789012', phuong_thuc_thanh_toan: payment, delivery_mode: 'GIAO_TAN_NOI', dia_chi_giao_hang: 'Địa chỉ', ma_voucher: 'SAVE20' };
    const first = await s.khoiTaoThanhToan('user', dto);
    s.cartRepo.find.mockResolvedValue([]);
    const replay = await s.khoiTaoThanhToan('user', dto);
    expect(replay.don_hang.ma_don_hang).toBe(first.don_hang.ma_don_hang);
    expect(replay.already_processed).toBe(true);
    expect(s.chiTietRepo.save).toHaveBeenCalledTimes(1);
    expect(s.voucherService.apDungVoucher).toHaveBeenCalledTimes(1);
    expect(s.deliveryTrackingService.createTracking).toHaveBeenCalledTimes(1);
    if (payment === 'VI_DIEN_TU') expect(s.customerWalletService.deductBalance).toHaveBeenCalledTimes(1);
    expect(runner.release).toHaveBeenCalledTimes(2);
  });
  it('serializes concurrent requests for one checkout action', async () => {
    const {s, runner} = service();
    let locked = false;
    runner.query.mockImplementation(async (sql: string) => {
      if (sql.includes('pg_try_advisory_lock(')) {
        if (locked) return [{locked:false}];
        locked = true;
        return [{locked:true}];
      }
      if (sql.includes('pg_advisory_unlock(')) locked = false;
      return [];
    });
    const dto = { checkout_action_id:'12345678-1234-4234-8234-123456789012', phuong_thuc_thanh_toan:'THANH_TOAN_KHI_NHAN_HANG', delivery_mode:'GIAO_TAN_NOI',dia_chi_giao_hang:'Địa chỉ',ma_voucher:'SAVE20' };
    const [first, busy] = await Promise.allSettled([s.khoiTaoThanhToan('user',dto),s.khoiTaoThanhToan('user',dto)]);
    expect(first.status).toBe('fulfilled');
    expect(busy.status).toBe('rejected');
    const replay = await s.khoiTaoThanhToan('user',dto);
    expect(replay.already_processed).toBe(true);
    expect(runner.release).toHaveBeenCalledTimes(3);
    expect(s.chiTietRepo.save).toHaveBeenCalledTimes(1);
    expect(s.voucherService.apDungVoucher).toHaveBeenCalledTimes(1);
  });
  it('rejects changed totals before any order write', async () => {
    const {s} = service();
    await expect(s.khoiTaoThanhToan('user', { phuong_thuc_thanh_toan: 'VNPAY', delivery_mode: 'GIAO_TAN_NOI', dia_chi_giao_hang: 'Địa chỉ', expected_final_total: 1 })).rejects.toThrow('Tong tien');
    expect(s.donHangRepo.save).not.toHaveBeenCalled();
  });
  it.each(['VNPAY', 'NGAN_HANG_QR'])('%s callback validates the stored shipping-inclusive amount and keeps points on subtotal', async payment => {
    const {s} = service();
    const transaction: any = {ma_don_hang:'order',so_tien:265400,trang_thai:'CHO_THANH_TOAN'};
    s.giaoDichRepo.findOne.mockResolvedValue(transaction);
    s.donHangRepo.findOne.mockResolvedValue({ma_don_hang:'order',ma_nguoi_dung:'user',tong_tien:265400,so_tien_giam:62600});
    s.chiTietRepo.find = jest.fn(async () => [{gia_ban:313000,so_luong:1}]);
    s.capNhatTrangThaiDonHangHeThong = jest.fn();
    s.trichXuatMaThamChieuQr = () => 'QRref';
    const invoke = async (amount: number) => {
      if (payment === 'NGAN_HANG_QR') return s.xuLyWebhookSepay({transferType:'in',content:'QRref',transferAmount:amount}, {}, '{}');
      s.VNP_HASH_SECRET = 'test-signing-key';
      const q: any = {vnp_TxnRef:'ref',vnp_Amount:String(amount*100),vnp_ResponseCode:'00'};
      const data = Object.keys(q).sort().map(key => `${encodeURIComponent(key)}=${encodeURIComponent(q[key]).replace(/%20/g,'+')}`).join('&');
      q.vnp_SecureHash = crypto.createHmac('sha512',s.VNP_HASH_SECRET).update(Buffer.from(data,'utf-8')).digest('hex');
      return s.xuLyVnpayIpn(q);
    };
    await invoke(250400);
    expect(s.capNhatTrangThaiDonHangHeThong).not.toHaveBeenCalled();
    await invoke(265400);
    expect(s.capNhatTrangThaiDonHangHeThong).toHaveBeenCalledTimes(1);
    expect(s.tichDiemLoyalty).toHaveBeenCalledWith('user',313000);
  });

});
