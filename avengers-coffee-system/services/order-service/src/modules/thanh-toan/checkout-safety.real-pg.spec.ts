/** Full CheckoutSafetyService against a disposable PostgreSQL database.
 * Set V5_TEST_PG_URL to an admin URL; this suite creates a random database and
 * drops only that database. Never point it at production credentials.
 */
import { randomBytes, randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { CartItem } from '../cart/cart.entity';
import { ProductConfigurationValidator } from '../cart/product-configuration-validator.service';
import { CustomerWalletService } from '../customer-wallet/customer-wallet.service';
import { CustomerWallet } from '../customer-wallet/entities/customer-wallet.entity';
import { CustomerWalletTransaction } from '../customer-wallet/entities/customer-wallet-transaction.entity';
import { ThongBao } from '../notification/entities/thong-bao.entity';
import { DeliveryTracking } from '../shipper/features_thaian/delivery-tracking.entity';
import { CheckoutSafetyService } from './checkout-safety.service';
import { CheckoutOutboxService } from './checkout-outbox.service';
import { ChiTietDonHang } from './entities/chi-tiet-don-hang.entity';
import { DonHang } from './entities/don-hang.entity';
import { GiaoDichThanhToan } from './entities/giao-dich-thanh-toan.entity';
import { ThanhToanService } from './thanh-toan.service';

const pg = require('pg');
const adminUrl = process.env.V5_TEST_PG_URL;
const run = adminUrl ? describe : describe.skip;

run('CheckoutSafetyService real PostgreSQL transaction', () => {
  const databaseName = `v5_checkout_${randomBytes(5).toString('hex')}`;
  let admin: any;
  let dataSource: DataSource;
  let service: CheckoutSafetyService;
  let voucher: any;
  const presentation = Object.create(ThanhToanService.prototype) as ThanhToanService;
  let nextBranch = 0;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    const url = new URL(adminUrl!);
    url.pathname = `/${databaseName}`;
    const bootstrap = new pg.Client({ connectionString: url.toString() });
    await bootstrap.connect();
    await bootstrap.query('CREATE SCHEMA orders');
    await bootstrap.query('CREATE SCHEMA menu');
    await bootstrap.query('CREATE SCHEMA inventory');
    await bootstrap.end();
    dataSource = new DataSource({
      type: 'postgres', url: url.toString(), synchronize: true,
      entities: [CartItem, DonHang, ChiTietDonHang, GiaoDichThanhToan,
        DeliveryTracking, ThongBao, CustomerWallet, CustomerWalletTransaction],
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE TABLE orders.cart_metadata (
      user_id varchar PRIMARY KEY, cart_id varchar(200) NOT NULL, cart_version bigint NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT NOW())`);
    await dataSource.query(`CREATE TABLE orders.voucher (
      ma_voucher varchar(50) PRIMARY KEY, luot_da_dung int NOT NULL DEFAULT 0,
      tong_luot_dung int, trang_thai varchar NOT NULL, han_su_dung timestamptz)`);
    await dataSource.query(`CREATE TABLE menu.san_pham (
      ma_san_pham int PRIMARY KEY, ten_san_pham varchar, gia_ban numeric, hinh_anh_url varchar, trang_thai boolean)`);
    await dataSource.query(`CREATE TABLE menu.thuoc_tinh (ma_thuoc_tinh int PRIMARY KEY, ten_thuoc_tinh varchar)`);
    await dataSource.query(`CREATE TABLE menu.bien_the_san_pham (
      ma_san_pham int, ma_thuoc_tinh int, gia_tri varchar, phu_thu numeric)`);
    await dataSource.query(`CREATE TABLE inventory.ton_kho_san_pham (
      co_so_ma varchar, ma_san_pham int, so_luong_ton int, dang_kinh_doanh boolean,
      PRIMARY KEY (co_so_ma, ma_san_pham))`);
    await dataSource.query(`INSERT INTO menu.san_pham VALUES (12, 'Matcha Latte', 39000, '', TRUE)`);
    await dataSource.query(`INSERT INTO menu.thuoc_tinh VALUES (1, 'Kích thước')`);
    await dataSource.query(`INSERT INTO menu.bien_the_san_pham VALUES (12, 1, 'Vừa', 49000)`);
    (presentation as any).taoUrlVnpayThat = jest.fn((_user: string, _order: string, _amount: number, ref: string) => `https://vnpay.test/pay?ref=${ref}`);
    (presentation as any).taoQrNganHang = jest.fn((_amount: number, ref: string) => `qr:${ref}`);
    (presentation as any).taoQrNganHangDuPhong = jest.fn((_amount: number, ref: string) => `fallback:${ref}`);
    voucher = { kiemTraVoucher: jest.fn(async () => ({
      voucher: { ma_voucher: 'SAVE' }, so_tien_giam: 5000,
      gioi_han_moi_nguoi: 1, luot_da_dung_user: 0,
    })) };
    const wallet = new CustomerWalletService(
      dataSource.getRepository(CustomerWallet), dataSource.getRepository(CustomerWalletTransaction),
    );
    service = new CheckoutSafetyService(dataSource, voucher, new ProductConfigurationValidator(), presentation, wallet);
  }, 30000);

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      await admin.end();
    }
  }, 30000);

  async function seed(quantity = 2, stock = 5) {
    const userId = randomUUID();
    const branchCode = `BR-${++nextBranch}`;
    await dataSource.query(`INSERT INTO orders.cart_metadata VALUES ($1, $2, 7)`, [userId, `user:${userId}`]);
    await dataSource.getRepository(CartItem).save(dataSource.getRepository(CartItem).create({
      ma_nguoi_dung: userId, ma_san_pham: 12, ten_san_pham: 'Matcha Latte',
      gia_ban: 1, so_luong: quantity, size: 'Vừa', toppings: [], custom_attributes: {},
    }));
    if (stock >= 0) await dataSource.query(
      `INSERT INTO inventory.ton_kho_san_pham VALUES ($1, 12, $2, TRUE)`, [branchCode, stock],
    );
    const input: any = { phuong_thuc_thanh_toan: 'THANH_TOAN_KHI_NHAN_HANG',
      delivery_mode: 'LAY_TAI_QUAN', branch_code: branchCode, expected_cart_version: 7 };
    return { userId, branchCode, input };
  }

  async function quoteAndConfirm(userId: string, input: any, operationId = randomUUID()) {
    const quote = await service.createQuote(userId, input);
    const confirm = { ...input, quote_id: quote.quote_id, action_id: quote.action_id };
    return { quote, confirm, result: await service.confirmQuote(userId, confirm, operationId), operationId };
  }

  it('quotes current price without version bump, then commits once and replays the complete result', async () => {
    const { userId, branchCode, input } = await seed();
    const quote = await service.createQuote(userId, input);
    expect(quote.subtotal).toBe(98000);
    expect(quote.cart_version).toBe(7);
    expect((await dataSource.query(`SELECT cart_version FROM orders.cart_metadata WHERE user_id=$1`, [userId]))[0].cart_version).toBe('7');
    const confirm = { ...input, quote_id: quote.quote_id, action_id: quote.action_id };
    const operationId = randomUUID();
    const first = await service.confirmQuote(userId, confirm, operationId);
    expect(first).toMatchObject({ status: 'success', cart_version: 8, final_total: 98000,
      payment_method: 'THANH_TOAN_KHI_NHAN_HANG', redirect_url: null, payment_details: null });
    expect(await service.confirmQuote(userId, confirm, operationId)).toEqual({ ...first, already_processed: true });
    expect(await dataSource.getRepository(CartItem).count({ where: { ma_nguoi_dung: userId } })).toBe(0);
    expect(await dataSource.getRepository(DonHang).count({ where: { ma_nguoi_dung: userId } })).toBe(1);
    expect(await dataSource.getRepository(ChiTietDonHang).count({ where: { ma_don_hang: first.order_id } })).toBe(1);
    expect(await dataSource.getRepository(DeliveryTracking).count({ where: { ma_don_hang: first.order_id } })).toBe(1);
    expect(await dataSource.getRepository(ThongBao).count({ where: { ma_nguoi_dung: userId } })).toBe(1);
    expect((await dataSource.query(`SELECT so_luong_ton FROM inventory.ton_kho_san_pham WHERE co_so_ma=$1`, [branchCode]))[0].so_luong_ton).toBe(3);
    expect((await dataSource.query(`SELECT count(*)::int AS n FROM orders.checkout_outbox WHERE payload->>'orderId'=$1`, [first.order_id]))[0].n).toBe(2);
  });

  it('rejects a stale Menu price and keeps cart, stock, and version', async () => {
    const { userId, branchCode, input } = await seed();
    const quote = await service.createQuote(userId, input);
    await dataSource.query(`UPDATE menu.bien_the_san_pham SET phu_thu=51000 WHERE ma_san_pham=12`);
    await expect(service.confirmQuote(userId, { ...input, quote_id: quote.quote_id, action_id: quote.action_id }, randomUUID())).rejects.toThrow();
    await dataSource.query(`UPDATE menu.bien_the_san_pham SET phu_thu=49000 WHERE ma_san_pham=12`);
    expect(await dataSource.getRepository(CartItem).count({ where: { ma_nguoi_dung: userId } })).toBe(1);
    expect((await dataSource.query(`SELECT cart_version FROM orders.cart_metadata WHERE user_id=$1`, [userId]))[0].cart_version).toBe('7');
    expect((await dataSource.query(`SELECT so_luong_ton FROM inventory.ton_kho_san_pham WHERE co_so_ma=$1`, [branchCode]))[0].so_luong_ton).toBe(5);
  });

  it('rejects missing and insufficient inventory at quote time', async () => {
    const missing = await seed(2, -1);
    const low = await seed(2, 1);
    await expect(service.createQuote(missing.userId, missing.input)).rejects.toThrow();
    await expect(service.createQuote(low.userId, low.input)).rejects.toThrow();
  });

  it('rejects a direct cart line whose required size is invalid', async () => {
    const { userId, input } = await seed(1, 2);
    await dataSource.query(`UPDATE orders.gio_hang SET kich_co='Unknown' WHERE ma_nguoi_dung=$1`, [userId]);
    await expect(service.createQuote(userId, input)).rejects.toMatchObject({
      response: expect.objectContaining({ reason: 'OPTION_UNAVAILABLE' }),
    });
  });

  it('rejects stale cart version, disabled option, and stock changed after quote', async () => {
    const stale = await seed();
    const staleQuote = await service.createQuote(stale.userId, stale.input);
    await dataSource.query(`UPDATE orders.cart_metadata SET cart_version=8 WHERE user_id=$1`, [stale.userId]);
    await expect(service.confirmQuote(stale.userId, { ...stale.input, quote_id: staleQuote.quote_id, action_id: staleQuote.action_id }, randomUUID())).rejects.toThrow();

    const option = await seed();
    const optionQuote = await service.createQuote(option.userId, option.input);
    await dataSource.query(`DELETE FROM menu.bien_the_san_pham WHERE ma_san_pham=12`);
    await expect(service.confirmQuote(option.userId, { ...option.input, quote_id: optionQuote.quote_id, action_id: optionQuote.action_id }, randomUUID())).rejects.toThrow();
    await dataSource.query(`INSERT INTO menu.bien_the_san_pham VALUES (12, 1, 'Vừa', 49000)`);

    const stock = await seed();
    const stockQuote = await service.createQuote(stock.userId, stock.input);
    await dataSource.query(`UPDATE inventory.ton_kho_san_pham SET so_luong_ton=0 WHERE co_so_ma=$1`, [stock.branchCode]);
    await expect(service.confirmQuote(stock.userId, { ...stock.input, quote_id: stockQuote.quote_id, action_id: stockQuote.action_id }, randomUUID())).rejects.toThrow();
    expect(await dataSource.getRepository(CartItem).count({ where: { ma_nguoi_dung: stock.userId } })).toBe(1);
    expect((await dataSource.query(`SELECT cart_version FROM orders.cart_metadata WHERE user_id=$1`, [stock.userId]))[0].cart_version).toBe('7');
  });

  it.each(['don_hang', 'chi_tiet_don_hang', 'giao_dich_thanh_toan'])(
    'rolls back cart, version, and stock when %s insert fails', async (table) => {
      const { userId, branchCode, input } = await seed();
      const quote = await service.createQuote(userId, input);
      await dataSource.query(`CREATE OR REPLACE FUNCTION orders.fail_checkout_test() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'injected checkout failure'; END $$`);
      await dataSource.query(`CREATE TRIGGER fail_checkout_test BEFORE INSERT ON orders.${table}
        FOR EACH ROW EXECUTE FUNCTION orders.fail_checkout_test()`);
      try {
        await expect(service.confirmQuote(userId, { ...input, quote_id: quote.quote_id, action_id: quote.action_id }, randomUUID()))
          .rejects.toThrow('injected checkout failure');
        expect(await dataSource.getRepository(DonHang).count({ where: { ma_nguoi_dung: userId } })).toBe(0);
        expect(await dataSource.getRepository(CartItem).count({ where: { ma_nguoi_dung: userId } })).toBe(1);
        expect((await dataSource.query(`SELECT cart_version FROM orders.cart_metadata WHERE user_id=$1`, [userId]))[0].cart_version).toBe('7');
        expect((await dataSource.query(`SELECT so_luong_ton FROM inventory.ton_kho_san_pham WHERE co_so_ma=$1`, [branchCode]))[0].so_luong_ton).toBe(5);
      } finally {
        await dataSource.query(`DROP TRIGGER fail_checkout_test ON orders.${table}`);
      }
    },
  );

  it('serializes concurrent same-action confirmations into one order', async () => {
    const { userId, branchCode, input } = await seed(1, 1);
    const quote = await service.createQuote(userId, input);
    const confirm = { ...input, quote_id: quote.quote_id, action_id: quote.action_id };
    const operationId = randomUUID();
    const [first, second] = await Promise.all([
      service.confirmQuote(userId, confirm, operationId),
      service.confirmQuote(userId, confirm, operationId),
    ]);
    expect(first.order_id).toBe(second.order_id);
    expect([first.already_processed, second.already_processed].sort()).toEqual([false, true]);
    expect(await dataSource.getRepository(DonHang).count({ where: { ma_nguoi_dung: userId } })).toBe(1);
    expect((await dataSource.query(`SELECT so_luong_ton FROM inventory.ton_kho_san_pham WHERE co_so_ma=$1`, [branchCode]))[0].so_luong_ton).toBe(0);
  });

  it('allows only one of two distinct carts to consume the final branch stock unit', async () => {
    const first = await seed(1, 1);
    const second = await seed(1, 1);
    const secondInput = { ...second.input, branch_code: first.branchCode };
    const firstQuote = await service.createQuote(first.userId, first.input);
    const secondQuote = await service.createQuote(second.userId, secondInput);
    const results = await Promise.allSettled([
      service.confirmQuote(first.userId, { ...first.input, quote_id: firstQuote.quote_id,
        action_id: firstQuote.action_id }, randomUUID()),
      service.confirmQuote(second.userId, { ...secondInput, quote_id: secondQuote.quote_id,
        action_id: secondQuote.action_id }, randomUUID()),
    ]);
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1);
    expect((await dataSource.query(`SELECT so_luong_ton FROM inventory.ton_kho_san_pham WHERE co_so_ma=$1`,
      [first.branchCode]))[0].so_luong_ton).toBe(0);
    expect(await dataSource.getRepository(DonHang).count({ where: [
      { ma_nguoi_dung: first.userId }, { ma_nguoi_dung: second.userId },
    ] })).toBe(1);
  });

  it('rejects same idempotency key for changed payload or another user', async () => {
    const first = await seed(1, 2);
    const quote = await service.createQuote(first.userId, first.input);
    const confirm = { ...first.input, quote_id: quote.quote_id, action_id: quote.action_id };
    const operationId = randomUUID();
    await service.confirmQuote(first.userId, confirm, operationId);
    await expect(service.confirmQuote(first.userId, { ...confirm, ghi_chu: 'changed' }, operationId)).rejects.toThrow();
    const second = await seed(1, 2);
    const secondQuote = await service.createQuote(second.userId, second.input);
    await expect(service.confirmQuote(second.userId, { ...second.input, quote_id: secondQuote.quote_id,
      action_id: secondQuote.action_id }, operationId)).rejects.toThrow();
    expect(await dataSource.getRepository(DonHang).count({ where: { ma_nguoi_dung: second.userId } })).toBe(0);
  });

  it('holds a local voucher claim so a rapid second order cannot bypass per-user limit', async () => {
    const { userId, branchCode, input } = await seed(1, 5);
    const withVoucher = { ...input, ma_voucher: 'SAVE' };
    const first = await quoteAndConfirm(userId, withVoucher);
    expect(first.result.discount_amount).toBe(5000);
    await dataSource.getRepository(CartItem).save(dataSource.getRepository(CartItem).create({
      ma_nguoi_dung: userId, ma_san_pham: 12, ten_san_pham: 'Matcha Latte',
      gia_ban: 49000, so_luong: 1, size: 'Vừa', toppings: [], custom_attributes: {},
    }));
    await dataSource.query(`UPDATE orders.cart_metadata SET cart_version=8 WHERE user_id=$1`, [userId]);
    await expect(service.createQuote(userId, { ...withVoucher, expected_cart_version: 8 })).rejects.toThrow();
    expect((await dataSource.query(`SELECT count(*)::int AS n FROM orders.checkout_voucher_claim WHERE user_id=$1 AND reconciled_at IS NULL`, [userId]))[0].n).toBe(1);
    expect((await dataSource.query(`SELECT so_luong_ton FROM inventory.ton_kho_san_pham WHERE co_so_ma=$1`, [branchCode]))[0].so_luong_ton).toBe(4);
  });

  it('revalidates voucher discount and increments a local PUBLIC voucher only once', async () => {
    const stale = await seed(1, 2);
    const voucherInput = { ...stale.input, ma_voucher: 'SAVE' };
    const staleQuote = await service.createQuote(stale.userId, voucherInput);
    voucher.kiemTraVoucher.mockResolvedValueOnce({
      voucher: { ma_voucher: 'SAVE' }, so_tien_giam: 6000,
      gioi_han_moi_nguoi: 1, luot_da_dung_user: 0,
    });
    await expect(service.confirmQuote(stale.userId, { ...voucherInput, quote_id: staleQuote.quote_id,
      action_id: staleQuote.action_id }, randomUUID())).rejects.toThrow();
    await dataSource.query(`INSERT INTO orders.voucher VALUES ('SAVE', 0, 10, 'ACTIVE', NULL)`);
    const good = await seed(1, 2);
    const goodInput = { ...good.input, ma_voucher: 'SAVE' };
    const { result, confirm, operationId } = await quoteAndConfirm(good.userId, goodInput);
    await service.confirmQuote(good.userId, confirm, operationId);
    expect(result.discount_amount).toBe(5000);
    expect((await dataSource.query(`SELECT luot_da_dung FROM orders.voucher WHERE ma_voucher='SAVE'`))[0].luot_da_dung).toBe(1);
  });

  it('uses stable VNPAY/QR presentation and atomically debits wallet', async () => {
    for (const method of ['VNPAY', 'NGAN_HANG_QR', 'VI_DIEN_TU'] as const) {
      const { userId, input } = await seed(1, 2);
      if (method === 'VI_DIEN_TU') await dataSource.getRepository(CustomerWallet).save({ customer_id: userId, balance: 100000 });
      const { result, confirm, operationId } = await quoteAndConfirm(userId, { ...input, phuong_thuc_thanh_toan: method });
      if (method === 'VNPAY') expect(result.redirect_url).toContain(result.payment_reference);
      if (method === 'NGAN_HANG_QR') expect(result.payment_details?.ma_tham_chieu).toBe(result.payment_reference);
      if (method === 'VI_DIEN_TU') {
        expect(Number((await dataSource.getRepository(CustomerWallet).findOneByOrFail({ customer_id: userId })).balance)).toBe(51000);
        expect(await dataSource.getRepository(CustomerWalletTransaction).count({ where: { customer_id: userId } })).toBe(1);
      }
      const replay = await service.confirmQuote(userId, confirm, operationId);
      expect(replay.payment_reference).toBe(result.payment_reference);
      expect(replay.redirect_url).toBe(result.redirect_url);
      expect(replay.payment_details).toEqual(result.payment_details);
    }
  });

  it('wallet insufficient balance leaves no order and does not consume stock', async () => {
    const { userId, branchCode, input } = await seed(1, 2);
    const walletInput = { ...input, phuong_thuc_thanh_toan: 'VI_DIEN_TU' };
    const quote = await service.createQuote(userId, walletInput);
    await expect(service.confirmQuote(userId, { ...walletInput, quote_id: quote.quote_id,
      action_id: quote.action_id }, randomUUID())).rejects.toThrow('So du vi dien tu khong du');
    expect(await dataSource.getRepository(DonHang).count({ where: { ma_nguoi_dung: userId } })).toBe(0);
    expect(await dataSource.getRepository(CartItem).count({ where: { ma_nguoi_dung: userId } })).toBe(1);
    expect((await dataSource.query(`SELECT so_luong_ton FROM inventory.ton_kho_san_pham WHERE co_so_ma=$1`, [branchCode]))[0].so_luong_ton).toBe(2);
  });

  it('recovers loyalty through the outbox only after an online order is paid', async () => {
    const { userId, input } = await seed(1, 2);
    const { result } = await quoteAndConfirm(userId, { ...input, phuong_thuc_thanh_toan: 'VNPAY' });
    const publish = jest.fn(async () => true);
    const followup = jest.fn(async () => undefined);
    const outbox = new CheckoutOutboxService(dataSource, { publish } as any,
      { runStrictOrderFollowup: followup } as any);
    const originalFetch = global.fetch;
    const fetchMock = jest.fn(async () => ({ ok: true }));
    global.fetch = fetchMock as any;
    try {
      await outbox.deliverPending();
      expect((await dataSource.query(`SELECT count(*)::int AS n FROM orders.checkout_outbox
        WHERE event_key=$1`, [`loyalty-award:${result.order_id}`]))[0].n).toBe(0);
      await dataSource.query(`UPDATE orders.don_hang SET trang_thai_thanh_toan='DA_THANH_TOAN'
        WHERE ma_don_hang=$1`, [result.order_id]);
      await outbox.deliverPending();
      expect((await dataSource.query(`SELECT count(*)::int AS n FROM orders.checkout_outbox
        WHERE event_key=$1 AND delivered_at IS NOT NULL`, [`loyalty-award:${result.order_id}`]))[0].n).toBe(1);
      const targetCalls = () => fetchMock.mock.calls.filter(([, options]) =>
        JSON.parse(options.body).order_id === result.order_id);
      expect(targetCalls()).toHaveLength(1);
      expect(JSON.parse(targetCalls()[0][1].body)).toEqual({ diem: 49, order_id: result.order_id });
      await outbox.deliverPending();
      expect(targetCalls()).toHaveLength(1);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
