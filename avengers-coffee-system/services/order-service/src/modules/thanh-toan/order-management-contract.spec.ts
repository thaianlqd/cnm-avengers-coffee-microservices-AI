import { ThanhToanService } from './thanh-toan.service';
import { DonHang } from './entities/don-hang.entity';
import { ChiTietDonHang } from './entities/chi-tiet-don-hang.entity';
import { CustomerWalletService } from '../customer-wallet/customer-wallet.service';
import { CustomerWallet } from '../customer-wallet/entities/customer-wallet.entity';
import { CustomerWalletTransaction } from '../customer-wallet/entities/customer-wallet-transaction.entity';
import { orderRevision } from './order-amendment';

function runtime(walletBalance?: number) {
  const order: any = { ma_don_hang: 'owned-order', ma_nguoi_dung: 'customer', trang_thai_don_hang: 'MOI_TAO',
    phuong_thuc_thanh_toan: 'THANH_TOAN_KHI_NHAN_HANG', trang_thai_thanh_toan: 'CHO_THANH_TOAN',
    co_so_ma: 'BRANCH', tong_tien: 298000, so_tien_giam: 10000, ma_voucher: 'USED', dia_chi_giao_hang: '42 Nguyễn Hữu Tiến',
    chi_tiet: [{ id: 1, ma_san_pham: 114, ten_san_pham: 'Bánh Trung Thu Matcha', so_luong: 2, gia_ban: 99000, kich_co: 'Nhỏ', toppings: [] },
      { id: 2, ma_san_pham: 60, ten_san_pham: 'Latte Tiramisu', so_luong: 1, gia_ban: 95000, kich_co: 'Lớn', toppings: ['Xốt Caramel', 'Kem Phô Mai Macchiato'], luong_da: 'Ít đá', do_ngot: 'Thêm ngọt' }] };
  const products = [{ ma_san_pham: 114, ten_san_pham: 'Bánh Trung Thu Matcha', trang_thai: true, gia_ban: 99000, sizes: { Nhỏ: 99000 } },
    { ma_san_pham: 60, ten_san_pham: 'Latte Tiramisu', trang_thai: true, gia_ban: 69000, sizes: { Lớn: 79000 }, toppings: { 'Xốt Caramel': 5000, 'Kem Phô Mai Macchiato': 11000 }, luong_da: { 'Ít đá': 0 }, do_ngot: { 'Thêm ngọt': 0 } }];
  const query = jest.fn(async (sql: string, params: any[]) => {
    if (sql.includes('inventory.ton_kho')) return [];
    if (sql.includes('orders.voucher')) return [{ loai_phan_phoi: 'PUBLIC', loai: 'PERCENT', gia_tri: 15, giam_toi_da: 10000 }];
    if (sql.includes('bien_the_san_pham')) return params[0] === 60 ? [{ ten_thuoc_tinh: 'Kích thước', gia_tri: 'Lớn', phu_thu: 79000 }, { ten_thuoc_tinh: 'Topping', gia_tri: 'Xốt Caramel', phu_thu: 5000 }, { ten_thuoc_tinh: 'Topping', gia_tri: 'Kem Phô Mai Macchiato', phu_thu: 11000 }] : [];
    return products.filter(p => p.ma_san_pham === params[0]);
  });
  const orders = { findOne: jest.fn(async ({ where }) => where.ma_nguoi_dung && where.ma_nguoi_dung !== 'customer' ? null : order),
    update: jest.fn(async (_id, patch) => Object.assign(order, patch)), save: jest.fn(async row => row) };
  const details = { find: jest.fn(async () => order.chi_tiet), delete: jest.fn(async () => undefined), save: jest.fn(async items => { order.chi_tiet = items; return items; }) };
  const ledger: any[] = [];
  const wallet = { customer_id: 'customer', balance: walletBalance ?? 0 };
  const payment = { create: jest.fn(row => row), save: jest.fn(async row => row), findOne: jest.fn(async () => ({ ma_giao_dich: 7 })), update: jest.fn(async () => undefined) };
  const manager: any = { query, getRepository: cls => cls === DonHang ? orders : cls === ChiTietDonHang ? details : payment };
  const walletRows = { findOne: jest.fn(async () => wallet) };
  const walletPayments = { findOne: jest.fn(async ({ where }) => ledger.find(r => r.reference_id === where.reference_id) || null),
    create: (row: any) => row, save: jest.fn(async row => { ledger.push(row); return row; }) };
  const baseRepo = manager.getRepository;
  manager.getRepository = cls => cls === CustomerWallet ? walletRows : cls === CustomerWalletTransaction ? walletPayments : baseRepo(cls);
  manager.save = jest.fn(async (_cls, row) => row);
  let queue = Promise.resolve();
  manager.transaction = callback => {
    const run = queue.then(async () => {
      const previous = JSON.parse(JSON.stringify(order)), balance = wallet.balance, oldLedger = ledger.slice();
      try { return await callback(manager); }
      catch (e) { for (const k of Object.keys(order)) delete order[k]; Object.assign(order, previous); wallet.balance = balance; ledger.splice(0, ledger.length, ...oldLedger); throw e; }
    });
    queue = run.then(() => undefined, () => undefined);
    return run;
  };
  const service: any = Object.create(ThanhToanService.prototype);
  service.donHangRepo = { ...orders, manager };
  service.notificationService = { taoThongBao: jest.fn(async () => undefined) };
  service.invalidateOrderCaches = jest.fn(async () => undefined);
  service.guiThongBaoDonHangChoNhanSuChiNhanh = jest.fn(async () => undefined);
  service.rabbitMqService = { publish: jest.fn(async () => undefined) };
  service.surveyService = { huyVoucherPending: jest.fn(async () => undefined) };
  service.customerWalletService = { refundBalance: jest.fn(async () => true) };
  if (walletBalance !== undefined) {
    const unusedNestedTransaction = jest.fn(() => { throw new Error('Wallet must share order transaction'); });
    service.customerWalletService = new CustomerWalletService({ manager: { transaction: unusedNestedTransaction } } as any, {} as any);
    order.phuong_thuc_thanh_toan = 'VI_DIEN_TU';
    order.trang_thai_thanh_toan = 'DA_THANH_TOAN';
  }
  return { service, order, orders, details, payment, manager, query, wallet, ledger };
}

test('preview has correct final total and options without DB mutations or notifications', async () => {
  const r = runtime();
  const preview = await r.service.capNhatThongTinDonHang('customer', 'owned-order', { preview_only: true, items: [{ id: 1, so_luong: 3 }] });
  expect(preview.final_total).toBe(397000);
  expect(preview.delivery_fee).toBe(15000);
  expect(preview.items[1].toppings).toHaveLength(2);
  expect(r.details.delete).not.toHaveBeenCalled();
  expect(r.orders.update).not.toHaveBeenCalled();
  expect(r.service.notificationService.taoThongBao).not.toHaveBeenCalled();
});
test('commit uses owned order lock and matching preview, updates payment total', async () => {
  const r = runtime();
  const preview = await r.service.capNhatThongTinDonHang('customer', 'owned-order', { preview_only: true, items: [{ id: 1, so_luong: 3 }] });
  await r.service.capNhatThongTinDonHang('customer', 'owned-order', { items: [{ id: 1, so_luong: 3 }], expected_revision: preview.revision, expected_total: preview.final_total });
  expect(r.order.tong_tien).toBe(397000);
  expect(r.payment.update).toHaveBeenCalledWith(7, { so_tien: 397000 });
  expect(r.orders.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { ma_don_hang: 'owned-order', ma_nguoi_dung: 'customer' }, lock: { mode: 'pessimistic_write' } }));
});
test.each(['MOI_TAO', 'DANG_CHUAN_BI', 'DANG_GIAO'])('owner and COD/status restrictions at commit: %s', async status => {
  const r = runtime();
  await expect(r.service.capNhatThongTinDonHang('another-customer', 'owned-order', {})).rejects.toThrow();
  r.order.trang_thai_don_hang = status;
  if (status === 'MOI_TAO') r.order.phuong_thuc_thanh_toan = 'VI_DIEN_TU';
  await expect(r.service.capNhatThongTinDonHang('customer', 'owned-order', {})).rejects.toThrow();
  expect(r.details.delete).not.toHaveBeenCalled();
});
test('changed order revision or changed quoted total cannot mutate details', async () => {
  const r = runtime();
  await expect(r.service.capNhatThongTinDonHang('customer', 'owned-order', { expected_revision: 'stale' })).rejects.toThrow();
  await expect(r.service.capNhatThongTinDonHang('customer', 'owned-order', { expected_revision: orderRevision(r.order), expected_total: 1 })).rejects.toThrow();
  expect(r.details.delete).not.toHaveBeenCalled();
});
test('cancel validates current state/revision before refund and shares refund transaction', async () => {
  const r = runtime();
  r.order.trang_thai_thanh_toan = 'DA_THANH_TOAN';
  r.order.phuong_thuc_thanh_toan = 'VI_DIEN_TU';
  r.service.capNhatTrangThaiDonHangHeThong = jest.fn(async (_id, patch, manager) => { expect(manager).toBe(r.manager); Object.assign(r.order, patch); return r.order; });
  await expect(r.service.huyDonHang('customer', 'owned-order', 'Hết tiền', 'stale')).rejects.toThrow();
  expect(r.service.customerWalletService.refundBalance).not.toHaveBeenCalled();
  await r.service.huyDonHang('customer', 'owned-order', 'Hết tiền', orderRevision(r.order));
  expect(r.service.customerWalletService.refundBalance).toHaveBeenCalledWith('customer', 298000, 'owned-order', r.manager);
  await r.service.huyDonHang('customer', 'owned-order', 'Hết tiền');
  expect(r.service.customerWalletService.refundBalance).toHaveBeenCalledTimes(1);
});

const increase = { items: [{ id: 1, so_luong: 3 }] };
async function walletPreview(r: ReturnType<typeof runtime>) {
  return r.service.capNhatThongTinDonHang('customer', 'owned-order', { ...increase, preview_only: true });
}
function confirmation(preview: any) {
  return { ...increase, expected_revision: preview.revision, expected_total: preview.final_total };
}
test('confirmed COD orders may be edited without charging wallet', async () => {
  const r = runtime(); r.order.trang_thai_don_hang = 'DA_XAC_NHAN';
  await r.service.capNhatThongTinDonHang('customer', 'owned-order', increase);
  expect(r.order.tong_tien).toBe(397000);
  expect(r.order.trang_thai_don_hang).toBe('DA_XAC_NHAN');
  expect(r.service.customerWalletService.refundBalance).not.toHaveBeenCalled();
});
test('wallet preview never debits, commit charges only difference in the order transaction', async () => {
  const r = runtime(150000); r.order.trang_thai_don_hang = 'DA_XAC_NHAN';
  const preview = await walletPreview(r);
  expect(preview).toMatchObject({ original_total: 298000, final_total: 397000, wallet_charge: 99000, wallet_shortfall: 0 });
  expect(r.wallet.balance).toBe(150000); expect(r.ledger).toHaveLength(0);
  const result = await r.service.capNhatThongTinDonHang('customer', 'owned-order', confirmation(preview));
  expect(result.wallet_charge).toBe(99000); expect(r.wallet.balance).toBe(51000);
  expect(r.ledger).toHaveLength(1); expect(r.ledger[0]).toMatchObject({ amount: 99000, type: 'PAYMENT' });
  expect(r.payment.update).not.toHaveBeenCalled();
  expect(r.payment.save).toHaveBeenCalledWith(expect.objectContaining({ so_tien: 99000, trang_thai: 'THANH_CONG' }));
  await expect(r.service.capNhatThongTinDonHang('customer', 'owned-order', confirmation(preview))).rejects.toThrow('Don da thay doi');
  expect(r.wallet.balance).toBe(51000); expect(r.ledger).toHaveLength(1);
});
test('two wallet confirmations from same preview charge only once', async () => {
  const r = runtime(150000), preview = await walletPreview(r);
  const results = await Promise.allSettled([1, 2].map(() => r.service.capNhatThongTinDonHang('customer', 'owned-order', confirmation(preview))));
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(r.wallet.balance).toBe(51000); expect(r.ledger).toHaveLength(1);
});
test('equal total wallet edit needs no additional funds and retains original payment', async () => {
  const r = runtime(0), payload = { ghi_chu: 'Gọi trước khi giao' };
  const preview = await r.service.capNhatThongTinDonHang('customer', 'owned-order', { ...payload, preview_only: true });
  await r.service.capNhatThongTinDonHang('customer', 'owned-order', { ...payload, expected_revision: preview.revision, expected_total: preview.final_total });
  expect(r.order.tong_tien).toBe(298000); expect(r.wallet.balance).toBe(0);
  expect(r.ledger).toHaveLength(0); expect(r.payment.update).not.toHaveBeenCalled(); expect(r.payment.save).not.toHaveBeenCalled();
});
test.each([undefined, 150000])('lower totals cannot mutate COD or wallet: %s', async balance => {
  const r = runtime(balance);
  await expect(r.service.capNhatThongTinDonHang('customer', 'owned-order', { preview_only: true, items: [{ id: 1, so_luong: 1 }] })).rejects.toThrow('bằng hoặc cao hơn');
  expect(r.details.delete).not.toHaveBeenCalled(); expect(r.wallet.balance).toBe(balance ?? 0); expect(r.ledger).toHaveLength(0);
});
test('wallet shortfall is reported in preview and commit requests top-up without writes', async () => {
  const r = runtime(10000), preview = await walletPreview(r);
  expect(preview.wallet_shortfall).toBe(89000);
  await expect(r.service.capNhatThongTinDonHang('customer', 'owned-order', confirmation(preview))).rejects.toThrow('nạp thêm 89.000đ');
  expect(r.order.tong_tien).toBe(298000); expect(r.wallet.balance).toBe(10000); expect(r.ledger).toHaveLength(0);
  expect(r.details.delete).not.toHaveBeenCalled();
});
test('wallet order write failure rolls back both ledger and balance', async () => {
  const r = runtime(150000), preview = await walletPreview(r);
  r.details.save.mockRejectedValueOnce(new Error('DB write failed'));
  await expect(r.service.capNhatThongTinDonHang('customer', 'owned-order', confirmation(preview))).rejects.toThrow('DB write failed');
  expect(r.order.tong_tien).toBe(298000); expect(r.wallet.balance).toBe(150000); expect(r.ledger).toHaveLength(0);
  await r.service.capNhatThongTinDonHang('customer', 'owned-order', confirmation(preview));
  expect(r.wallet.balance).toBe(51000); expect(r.ledger).toHaveLength(1);
});
test.each(['NGAN_HANG_QR', 'VNPAY', 'MOMO', 'ZALOPAY'])('paid external orders cannot edit: %s', async method => {
  const r = runtime(150000); r.order.phuong_thuc_thanh_toan = method;
  await expect(walletPreview(r)).rejects.toThrow('QR/cổng thanh toán');
  expect(r.details.delete).not.toHaveBeenCalled(); expect(r.ledger).toHaveLength(0);
});
test('wallet commit requires price consent and rechecks current preparation status', async () => {
  const r = runtime(150000), preview = await walletPreview(r);
  await expect(r.service.capNhatThongTinDonHang('customer', 'owned-order', increase)).rejects.toThrow('xem và xác nhận');
  r.order.trang_thai_don_hang = 'DANG_CHUAN_BI';
  await expect(r.service.capNhatThongTinDonHang('customer', 'owned-order', confirmation(preview))).rejects.toThrow('bắt đầu chuẩn bị');
  expect(r.wallet.balance).toBe(150000); expect(r.ledger).toHaveLength(0);
});

test('status writer shares amendment lock and keeps raised wallet total', async () => {
  const r = runtime(150000), preview = await walletPreview(r);
  await r.service.capNhatThongTinDonHang('customer', 'owned-order', confirmation(preview));
  await r.manager.transaction(manager => r.service.capNhatTrangThaiDonHangHeThong('owned-order', { trang_thai_don_hang: 'DANG_CHUAN_BI' }, manager));
  expect(r.orders.findOne).toHaveBeenLastCalledWith(expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
  expect(r.order.tong_tien).toBe(397000); expect(r.order.trang_thai_don_hang).toBe('DANG_CHUAN_BI');
  expect(r.wallet.balance).toBe(51000); expect(r.ledger).toHaveLength(1);
  await expect(walletPreview(r)).rejects.toThrow('bắt đầu chuẩn bị');
});
test('status transitions recheck latest locked state instead of resurrecting cancelled orders', async () => {
  const r = runtime(); r.order.trang_thai_don_hang = 'DA_HUY';
  await expect(r.manager.transaction(manager => r.service.capNhatTrangThaiDonHangHeThong('owned-order', { trang_thai_don_hang: 'DA_XAC_NHAN' }, manager))).rejects.toThrow('Khong the chuyen');
  expect(r.order.trang_thai_don_hang).toBe('DA_HUY');
});
