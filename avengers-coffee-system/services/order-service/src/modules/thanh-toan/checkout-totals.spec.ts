import * as crypto from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { ThanhToanService } from './thanh-toan.service';
import { DeliveryTrackingService } from '../shipper/features_thaian/delivery-tracking.service';
import { DonHang } from './entities/don-hang.entity';
import { GiaoDichThanhToan } from './entities/giao-dich-thanh-toan.entity';

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
    const trackings = new Map();
    const tracking: any = Object.create(DeliveryTrackingService.prototype);
    tracking.trackingRepo = { create: (v: any) => v, save: jest.fn(async (v: any) => { trackings.set(v.ma_don_hang, v); return v; }) };
    tracking.logger = { log: jest.fn() };
    tracking.getBranchDetail = jest.fn(async () => null);
    tracking.geocodeDiaChiMapbox = jest.fn(async () => null);
    tracking.getTrackingsByOrderIds = jest.fn(async (ids: string[]) => ids.map(id => trackings.get(id)).filter(Boolean));
    jest.spyOn(tracking, 'createTracking');
    s.deliveryTrackingService = tracking;
    const walletManager = {
      save: jest.fn(async (entity: any, value: any) => {
        if (entity === DonHang) orders.set(value.ma_don_hang, value);
        if (entity === GiaoDichThanhToan) transactions.set(value.ma_don_hang, value);
        return value;
      }),
      delete: jest.fn(),
    };
    s.customerWalletService = { withWalletPayment: jest.fn(async (_uid: string, _amount: number, _ref: string, write: any) => write(walletManager, 1793400)) };
    s.walletManager = walletManager;
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
    const savedPayment = payment === 'VI_DIEN_TU' ? s.walletManager.save.mock.calls.find(([entity]: any[]) => entity === GiaoDichThanhToan)?.[1] : s.giaoDichRepo.save.mock.calls[0][0];
    expect(savedPayment.so_tien).toBe(expected);
    expect(s.deliveryTrackingService.trackingRepo.save.mock.calls[0][0].delivery_fee).toBe(mode === 'GIAO_TAN_NOI' ? 15000 : 0);
    if (payment === 'VI_DIEN_TU') expect(s.customerWalletService.withWalletPayment).toHaveBeenCalledWith('user', expected, expect.stringMatching(/^WALLET-/), expect.any(Function));
    if (payment === 'VNPAY') expect(s.taoUrlVnpayThat.mock.calls[0][2]).toBe(expected);
    if (payment === 'NGAN_HANG_QR') expect(result.payment_details.so_tien).toBe(expected);
  });
  it.each(payments)('%s applies membership before charging', async payment => {
    const {s} = service(15000);
    const result = await s.khoiTaoThanhToan('user', { phuong_thuc_thanh_toan: payment, delivery_mode: 'GIAO_TAN_NOI', dia_chi_giao_hang: 'Địa chỉ', ma_voucher: 'SAVE20' });
    expect(Number(result.don_hang.tong_tien)).toBe(250400);
    const savedPayment = payment === 'VI_DIEN_TU' ? s.walletManager.save.mock.calls.find(([entity]: any[]) => entity === GiaoDichThanhToan)?.[1] : s.giaoDichRepo.save.mock.calls[0][0];
    expect(savedPayment.so_tien).toBe(250400);
    expect(s.deliveryTrackingService.trackingRepo.save.mock.calls[0][0].delivery_fee).toBe(0);
  });
  it.each([
    ['INTERNAL', 0, 15000], ['LALAMOVE', 0, 25000],
    ['INTERNAL', 15000, 0], ['LALAMOVE', 25000, 0], ['LALAMOVE', 15000, 10000],
  ])('%s persists authoritative fee with benefit %s', async (method, freeship, fee) => {
    const {s} = service(Number(freeship));
    const result = await s.khoiTaoThanhToan('user', { phuong_thuc_thanh_toan:'THANH_TOAN_KHI_NHAN_HANG', delivery_mode:'GIAO_TAN_NOI', delivery_method:method, dia_chi_giao_hang:'Địa chỉ', ma_voucher:'SAVE20', delivery_fee:999, phi_giao_hang:999 });
    expect(s.deliveryTrackingService.trackingRepo.save.mock.calls[0][0].delivery_fee).toBe(fee);
    expect(Number(result.don_hang.tong_tien)).toBe(250400 + Number(fee));
  });
  it.each([
    {branch_code:'CN_2'}, {branch_code:undefined}, {ma_voucher:'SAVE10'}, {ma_voucher:undefined},
    {delivery_method:'LALAMOVE'}, {expected_final_total:265401}, {expected_final_total:undefined},
    {ghi_chu:'Ghi chú khác'}, {table_number:'B2'}, {destination_latitude:10},
    {guest_phone:'0123456789'}, {phuong_thuc_thanh_toan:'VNPAY'},
    {delivery_mode:'LAY_TAI_QUAN'}, {dia_chi_giao_hang:'Địa chỉ khác'},
  ])('rejects replay with a changed business snapshot: %j', async changes => {
    const {s} = service();
    const dto = {checkout_action_id:'12345678-1234-4234-8234-123456789012', phuong_thuc_thanh_toan:'VI_DIEN_TU', delivery_mode:'GIAO_TAN_NOI', delivery_method:'INTERNAL', branch_code:'CN_1', dia_chi_giao_hang:'Địa chỉ', ma_voucher:'SAVE20', expected_final_total:265400};
    await s.khoiTaoThanhToan('user', dto);
    await expect(s.khoiTaoThanhToan('user', {...dto,...changes})).rejects.toThrow('Checkout action');
    expect(s.walletManager.save).toHaveBeenCalledTimes(3);
    expect(s.customerWalletService.withWalletPayment).toHaveBeenCalledTimes(1);
    expect(s.voucherService.apDungVoucher).toHaveBeenCalledTimes(1);
  });
  it.each([{branch_code:'CN_2'}, {ma_voucher:'SAVE10'}, {delivery_method:'LALAMOVE'}, {expected_final_total:1}])('protects legacy actions without persisted hashes: %j', async changes => {
    const {s} = service();
    const dto = {checkout_action_id:'12345678-1234-4234-8234-123456789012', phuong_thuc_thanh_toan:'VNPAY', delivery_mode:'GIAO_TAN_NOI', branch_code:'CN_1', dia_chi_giao_hang:'Địa chỉ', ma_voucher:'SAVE20', expected_final_total:265400};
    const first = await s.khoiTaoThanhToan('user',dto);
    delete first.don_hang.lich_su_trang_thai[0].checkout_snapshot_hash;
    await expect(s.khoiTaoThanhToan('user',{...dto,...changes})).rejects.toThrow('Checkout action');
    expect((await s.khoiTaoThanhToan('user',dto)).already_processed).toBe(true);
    expect(s.chiTietRepo.save).toHaveBeenCalledTimes(1);
  });
  it.each(['LAY_TAI_QUAN','DUNG_TAI_CHO'])('protects delivery_method in the %s snapshot as well', async mode => {
    const {s} = service();
    const dto = {checkout_action_id:'12345678-1234-4234-8234-123456789012',phuong_thuc_thanh_toan:'VNPAY',delivery_mode:mode,delivery_method:'INTERNAL',branch_code:'CN_1',dia_chi_giao_hang:'Nhận tại quán',ma_voucher:'SAVE20',expected_final_total:250400};
    await s.khoiTaoThanhToan('user',dto);
    await expect(s.khoiTaoThanhToan('user',{...dto,delivery_method:'LALAMOVE'})).rejects.toThrow('snapshot khac');
    expect(s.chiTietRepo.save).toHaveBeenCalledTimes(1);
  });
  it.each(payments)('%s replays the same summary after response timeout, with no second side effects', async payment => {
    const {s, runner} = service();
    const dto = { checkout_action_id: '12345678-1234-4234-8234-123456789012', phuong_thuc_thanh_toan: payment, delivery_mode: 'GIAO_TAN_NOI', dia_chi_giao_hang: 'Địa chỉ', ma_voucher: 'SAVE20' };
    const first = await s.khoiTaoThanhToan('user', dto);
    s.cartRepo.find.mockResolvedValue([]);
    const replay = await s.khoiTaoThanhToan('user', dto);
    expect(replay.don_hang.ma_don_hang).toBe(first.don_hang.ma_don_hang);
    expect(replay.already_processed).toBe(true);
    if (payment === 'VI_DIEN_TU') expect(s.walletManager.save).toHaveBeenCalledTimes(3);
    else expect(s.chiTietRepo.save).toHaveBeenCalledTimes(1);
    expect(s.voucherService.apDungVoucher).toHaveBeenCalledTimes(1);
    expect(s.deliveryTrackingService.createTracking).toHaveBeenCalledTimes(1);
    if (payment === 'VI_DIEN_TU') expect(s.customerWalletService.withWalletPayment).toHaveBeenCalledTimes(1);
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
  it('allows correction only when the failed action provably created no order', async () => {
    const {s} = service();
    s.voucherService.kiemTraVoucher.mockRejectedValue(new BadRequestException('Voucher không hợp lệ'));
    const dto = {checkout_action_id:'12345678-1234-4234-8234-123456789012',phuong_thuc_thanh_toan:'VNPAY',delivery_mode:'GIAO_TAN_NOI',dia_chi_giao_hang:'Địa chỉ',ma_voucher:'INVALID'};
    const error = await s.khoiTaoThanhToan('user',dto).catch((e: any) => e);
    expect(error.getResponse().checkout_not_created).toBe(true);
    expect(s.donHangRepo.save).not.toHaveBeenCalled();
  });
  it('insufficient wallet never writes order or clears cart', async () => {
    const {s} = service();
    s.customerWalletService.withWalletPayment.mockRejectedValue(new BadRequestException('Số dư không đủ'));
    const dto = {checkout_action_id:'12345678-1234-4234-8234-123456789012',phuong_thuc_thanh_toan:'VI_DIEN_TU',delivery_mode:'GIAO_TAN_NOI',dia_chi_giao_hang:'Địa chỉ'};
    const error = await s.khoiTaoThanhToan('user',dto).catch((e: any) => e);
    expect(error.getResponse().checkout_not_created).toBe(true);
    expect(s.donHangRepo.save).not.toHaveBeenCalled();
    expect(s.walletManager.save).not.toHaveBeenCalled();
    expect(s.cartRepo.delete).not.toHaveBeenCalled();
  });
  it('replays a persisted snapshot after restart even if membership or tracking has changed', async () => {
    const {s} = service();
    const dto = {checkout_action_id:'12345678-1234-4234-8234-123456789012',phuong_thuc_thanh_toan:'VNPAY',delivery_mode:'GIAO_TAN_NOI',delivery_method:'INTERNAL',dia_chi_giao_hang:'Địa chỉ',ma_voucher:'SAVE20',expected_final_total:265400};
    const first = await s.khoiTaoThanhToan('user',dto);
    const [tracking] = await s.deliveryTrackingService.getTrackingsByOrderIds([first.don_hang.ma_don_hang]);
    tracking.delivery_method = 'LALAMOVE';
    global.fetch = jest.fn(async () => { throw new Error('Membership unavailable'); }) as any;
    const restarted: any = Object.assign(Object.create(ThanhToanService.prototype),s);
    const replay = await restarted.khoiTaoThanhToan('user',{...dto,delivery_method:undefined});
    expect(replay.already_processed).toBe(true);
    expect(Number(replay.don_hang.tong_tien)).toBe(265400);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(s.cartRepo.find).toHaveBeenCalledTimes(1);
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
