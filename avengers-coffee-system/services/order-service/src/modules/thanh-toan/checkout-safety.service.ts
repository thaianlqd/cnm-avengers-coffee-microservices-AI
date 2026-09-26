import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { CartItem } from '../cart/cart.entity';
import { DonHang } from './entities/don-hang.entity';
import { ChiTietDonHang } from './entities/chi-tiet-don-hang.entity';
import { GiaoDichThanhToan } from './entities/giao-dich-thanh-toan.entity';
import { VoucherService } from '../voucher/voucher.service';

type QuoteInput = {
  phuong_thuc_thanh_toan: 'VNPAY' | 'NGAN_HANG_QR' | 'THANH_TOAN_KHI_NHAN_HANG';
  delivery_mode: 'GIAO_TAN_NOI' | 'LAY_TAI_QUAN' | 'DUNG_TAI_CHO';
  dia_chi_giao_hang?: string;
  branch_code: string;
  ma_voucher?: string;
  expected_cart_version?: number;
  ghi_chu?: string;
};

type ConfirmInput = QuoteInput & {
  quote_id: string;
  action_id: string;
  expected_cart_version: number;
};

/**
 * The legacy payment endpoint predates cart_version and must remain for web
 * compatibility. New AI traffic uses this service: it has one transaction
 * boundary for the irreversible cart-to-order transition.
 */
@Injectable()
export class CheckoutSafetyService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly voucherService: VoucherService,
  ) {}

  private schema() {
    const schema = process.env.DB_SCHEMA || 'orders';
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
      throw new BadRequestException('DB_SCHEMA khong hop le');
    }
    return schema;
  }

  private async ensureTables() {
    const schema = this.schema();
    await this.dataSource.query(`CREATE TABLE IF NOT EXISTS "${schema}".checkout_quote (
      quote_id UUID PRIMARY KEY,
      action_id UUID NOT NULL UNIQUE,
      user_id VARCHAR NOT NULL,
      cart_id VARCHAR(200) NOT NULL,
      cart_version BIGINT NOT NULL,
      request JSONB NOT NULL,
      quote JSONB NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await this.dataSource.query(`CREATE TABLE IF NOT EXISTS "${schema}".checkout_operation (
      operation_id VARCHAR(200) PRIMARY KEY,
      user_id VARCHAR NOT NULL,
      request_hash TEXT NOT NULL,
      result JSONB NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  }

  private stableJson(value: any): string {
    if (Array.isArray(value)) return `[${value.map((entry) => this.stableJson(entry)).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${this.stableJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value ?? null);
  }

  private hash(value: any) {
    return createHash('sha256').update(this.stableJson(value)).digest('hex');
  }

  private async lockCart(manager: EntityManager, userId: string) {
    const schema = this.schema();
    await manager.query(
      `INSERT INTO "${schema}".cart_metadata (user_id, cart_id)
       VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
      [userId, `user:${userId}`],
    );
    const rows = await manager.query(
      `SELECT user_id, cart_id, cart_version FROM "${schema}".cart_metadata
       WHERE user_id = $1 FOR UPDATE`, [userId],
    );
    return rows[0];
  }

  private snapshot(items: CartItem[]) {
    return items.map((item) => {
      const quantity = Number(item.so_luong);
      const unitPrice = Number(item.gia_ban);
      return {
        line_id: item.id,
        product_id: item.ma_san_pham,
        product_name: item.ten_san_pham,
        quantity,
        size: item.size || 'Nhỏ',
        toppings: item.toppings || [],
        luong_da: item.luong_da || '',
        do_ngot: item.do_ngot || '',
        loai_sua: item.loai_sua || '',
        custom_attributes: item.custom_attributes || {},
        unit_price: unitPrice,
        line_total: unitPrice * quantity,
      };
    });
  }

  private async validateStock(manager: EntityManager, branchCode: string, items: CartItem[]) {
    const required = new Map<number, number>();
    for (const item of items) required.set(item.ma_san_pham, (required.get(item.ma_san_pham) || 0) + Number(item.so_luong));
    const ids = [...required.keys()];
    const rows: Array<{ ma_san_pham: number; so_luong_ton: number; dang_kinh_doanh: boolean }> = await manager.query(
      `SELECT ma_san_pham, so_luong_ton, dang_kinh_doanh
       FROM inventory.ton_kho_san_pham WHERE co_so_ma = $1 AND ma_san_pham = ANY($2::int[])`,
      [branchCode, ids],
    );
    const byProduct = new Map(rows.map((row) => [Number(row.ma_san_pham), row]));
    const conflicts = items.filter((item) => {
      const stock = byProduct.get(Number(item.ma_san_pham));
      return stock && (!stock.dang_kinh_doanh || Number(stock.so_luong_ton) < (required.get(item.ma_san_pham) || 0));
    }).map((item) => ({ line_id: item.id, product_id: item.ma_san_pham, product_name: item.ten_san_pham }));
    if (conflicts.length) {
      throw new ConflictException({ code: 'STOCK_CONFLICT', conflicts });
    }
  }

  private async calculateQuote(userId: string, input: QuoteInput, items: CartItem[]) {
    if (!input.branch_code?.trim()) throw new BadRequestException('branch_code la bat buoc');
    if (input.delivery_mode === 'GIAO_TAN_NOI' && !input.dia_chi_giao_hang?.trim()) {
      throw new BadRequestException('dia_chi_giao_hang la bat buoc');
    }
    const subtotal = items.reduce((sum, item) => sum + Number(item.gia_ban) * Number(item.so_luong), 0);
    let discountAmount = 0;
    let voucherCode: string | null = null;
    if (input.ma_voucher?.trim()) {
      const result = await this.voucherService.kiemTraVoucher(
        input.ma_voucher.trim(), subtotal, userId, items.some((item) => (item.toppings || []).length > 0),
      );
      discountAmount = Number(result.so_tien_giam || 0);
      voucherCode = result.voucher.ma_voucher;
    }
    return {
      items: this.snapshot(items), subtotal, discount_amount: discountAmount,
      final_total: Math.max(0, subtotal - discountAmount), voucher_code: voucherCode,
      branch_code: input.branch_code.trim().toUpperCase(), payment_method: input.phuong_thuc_thanh_toan,
      delivery_mode: input.delivery_mode, delivery_address: input.dia_chi_giao_hang || null,
    };
  }

  async createQuote(userId: string, input: QuoteInput) {
    await this.ensureTables();
    const result = await this.dataSource.transaction(async (manager) => {
      const metadata = await this.lockCart(manager, userId);
      if (input.expected_cart_version !== undefined && Number(input.expected_cart_version) !== Number(metadata.cart_version)) {
        throw new ConflictException('Cart version da thay doi; hay tai bao gia lai');
      }
      const items = await manager.getRepository(CartItem).find({ where: { ma_nguoi_dung: userId } });
      if (!items.length) throw new BadRequestException('Gio hang trong, khong the bao gia');
      const quote = await this.calculateQuote(userId, input, items);
      await this.validateStock(manager, quote.branch_code, items);
      const quoteId = randomUUID();
      const actionId = randomUUID();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      const envelope = { quote_id: quoteId, action_id: actionId, cart_id: metadata.cart_id, cart_version: Number(metadata.cart_version), expires_at: expiresAt.toISOString(), ...quote };
      await manager.query(
        `INSERT INTO "${this.schema()}".checkout_quote
         (quote_id, action_id, user_id, cart_id, cart_version, request, quote, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)`,
        [quoteId, actionId, userId, metadata.cart_id, metadata.cart_version, JSON.stringify(input), JSON.stringify(envelope), expiresAt],
      );
      return envelope;
    });
    return result;
  }

  async confirmQuote(userId: string, input: ConfirmInput, operationId?: string) {
    const normalizedOperationId = String(operationId || '').trim();
    if (!normalizedOperationId || normalizedOperationId.length > 200) throw new BadRequestException('X-Idempotency-Key hop le la bat buoc');
    await this.ensureTables();
    const requestHash = this.hash({ user_id: userId, ...input });
    return this.dataSource.transaction(async (manager) => {
      // Global cart mutation lock order: cart metadata -> operation -> cart rows.
      const metadata = await this.lockCart(manager, userId);
      const schema = this.schema();
      const operationRows = await manager.query(
        `SELECT request_hash, result FROM "${schema}".checkout_operation WHERE operation_id = $1 FOR UPDATE`, [normalizedOperationId],
      );
      if (operationRows[0]) {
        if (operationRows[0].request_hash !== requestHash) throw new ConflictException('Idempotency key da duoc dung cho yeu cau khac');
        if (operationRows[0].result == null) throw new ConflictException('Checkout dang duoc xu ly');
        return { ...(typeof operationRows[0].result === 'string' ? JSON.parse(operationRows[0].result) : operationRows[0].result), already_processed: true };
      }
      await manager.query(
        `INSERT INTO "${schema}".checkout_operation (operation_id, user_id, request_hash)
         VALUES ($1, $2, $3)`, [normalizedOperationId, userId, requestHash],
      );
      const quoteRows = await manager.query(
        `SELECT * FROM "${schema}".checkout_quote WHERE quote_id = $1 FOR UPDATE`, [input.quote_id],
      );
      const quoteRow = quoteRows[0];
      if (!quoteRow || quoteRow.user_id !== userId || quoteRow.action_id !== input.action_id) throw new ConflictException('Bao gia khong thuoc ve yeu cau nay');
      if (quoteRow.consumed_at || new Date(quoteRow.expires_at).getTime() <= Date.now()) throw new ConflictException('Bao gia da het han hoac da duoc su dung');
      if (Number(quoteRow.cart_version) !== Number(input.expected_cart_version) || Number(metadata.cart_version) !== Number(quoteRow.cart_version)) {
        throw new ConflictException('Cart version da thay doi; hay tao bao gia moi');
      }
      const quotedRequest = typeof quoteRow.request === 'string' ? JSON.parse(quoteRow.request) : quoteRow.request;
      for (const key of ['phuong_thuc_thanh_toan', 'delivery_mode', 'dia_chi_giao_hang', 'branch_code', 'ma_voucher']) {
        if (String((input as any)[key] || '') !== String((quotedRequest as any)[key] || '')) {
          throw new ConflictException('Xac nhan khong khop bao gia; hay tao bao gia moi');
        }
      }
      const quoted = typeof quoteRow.quote === 'string' ? JSON.parse(quoteRow.quote) : quoteRow.quote;
      const items = await manager.getRepository(CartItem).find({ where: { ma_nguoi_dung: userId } });
      if (!items.length || this.hash(this.snapshot(items)) !== this.hash(quoted.items)) throw new ConflictException('Gio hang da thay doi; hay tao bao gia moi');
      await this.validateStock(manager, quoted.branch_code, items);
      // Re-evaluate voucher at commit time. External promotion services remain
      // authoritative for their own ledger; local order/cart writes stay atomic.
      if (quoted.voucher_code) {
        // Lock the locally-owned voucher counter before final eligibility is
        // evaluated. Identity-service promotions are rechecked below too, but
        // their remote ledger cannot participate in this PostgreSQL txn.
        const localVoucher = await manager.query(
          `SELECT ma_voucher, luot_da_dung, tong_luot_dung, trang_thai, han_su_dung
             FROM "${schema}".voucher WHERE ma_voucher = $1 FOR UPDATE`,
          [quoted.voucher_code],
        );
        const voucher = localVoucher[0];
        if (voucher && (
          voucher.trang_thai !== 'ACTIVE' ||
          (voucher.han_su_dung && new Date(voucher.han_su_dung).getTime() < Date.now()) ||
          (voucher.tong_luot_dung != null && Number(voucher.luot_da_dung) >= Number(voucher.tong_luot_dung))
        )) throw new ConflictException('Voucher da thay doi; hay tao bao gia moi');
        const refreshed = await this.calculateQuote(userId, { ...input, ma_voucher: quoted.voucher_code, branch_code: quoted.branch_code }, items);
        if (Number(refreshed.final_total) !== Number(quoted.final_total)) throw new ConflictException('Voucher da thay doi; hay tao bao gia moi');
        if (voucher) {
          await manager.query(`UPDATE "${schema}".voucher SET luot_da_dung = luot_da_dung + 1 WHERE ma_voucher = $1`, [quoted.voucher_code]);
        }
      }
      const order = await manager.getRepository(DonHang).save(manager.getRepository(DonHang).create({
        ma_nguoi_dung: userId, co_so_ma: quoted.branch_code, tong_tien: quoted.final_total,
        ma_voucher: quoted.voucher_code, so_tien_giam: quoted.discount_amount,
        dia_chi_giao_hang: quoted.delivery_address || `Nhận tại: ${quoted.branch_code}`,
        ghi_chu: input.ghi_chu || 'AI Chat Order', loai_don_hang: quoted.delivery_mode,
        phuong_thuc_thanh_toan: quoted.payment_method,
        trang_thai_thanh_toan: quoted.payment_method === 'THANH_TOAN_KHI_NHAN_HANG' ? 'CHO_THANH_TOAN_KHI_NHAN_HANG' : 'CHO_XU_LY',
        trang_thai_don_hang: 'MOI_TAO', tien_thoi: 0, lich_su_trang_thai: [],
      }));
      const details = items.map((item) => manager.getRepository(ChiTietDonHang).create({
        ma_don_hang: order.ma_don_hang, ma_san_pham: item.ma_san_pham, ten_san_pham: item.ten_san_pham,
        gia_ban: Number(item.gia_ban), so_luong: item.so_luong, kich_co: item.size || 'Nhỏ', hinh_anh_url: item.hinh_anh_url,
        toppings: item.toppings || [], luong_da: item.luong_da || null, do_ngot: item.do_ngot || null,
        loai_sua: item.loai_sua || null, custom_attributes: item.custom_attributes || {},
      }));
      await manager.getRepository(ChiTietDonHang).save(details);
      await manager.getRepository(GiaoDichThanhToan).save(manager.getRepository(GiaoDichThanhToan).create({
        ma_don_hang: order.ma_don_hang, cong_thanh_toan: quoted.payment_method,
        ma_tham_chieu: `checkout:${input.quote_id}`, so_tien: quoted.final_total,
        trang_thai: quoted.payment_method === 'THANH_TOAN_KHI_NHAN_HANG' ? 'CHO_THU_TIEN' : 'CHO_THANH_TOAN',
      }));
      await manager.delete(CartItem, { ma_nguoi_dung: userId });
      const bumped = await manager.query(
        `UPDATE "${schema}".cart_metadata SET cart_version = cart_version + 1, updated_at = NOW()
         WHERE user_id = $1 RETURNING cart_id, cart_version`, [userId],
      );
      const result = { status: 'success', order_id: order.ma_don_hang, quote_id: input.quote_id, cart_id: bumped[0].cart_id, cart_version: Number(bumped[0].cart_version) };
      await manager.query(`UPDATE "${schema}".checkout_quote SET consumed_at = NOW() WHERE quote_id = $1`, [input.quote_id]);
      await manager.query(`UPDATE "${schema}".checkout_operation SET result = $2::jsonb, updated_at = NOW() WHERE operation_id = $1`, [normalizedOperationId, JSON.stringify(result)]);
      return { ...result, already_processed: false };
    });
  }
}
