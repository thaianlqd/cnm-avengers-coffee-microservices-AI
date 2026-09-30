import { WalletVoucherClaimOutboxService } from './wallet-voucher-claim-outbox.service';

describe('durable wallet voucher claim delivery', () => {
  it('records the claim in the payment transaction and retries an Identity failure once', async () => {
    const claim = { order_id: 'order-1', customer_id: 'user-1', voucher_code: 'SAVE20', discount_amount: 62600 };
    let scheduled: typeof claim | null = null;
    let done = false;
    let localUses = 0;
    const manager: any = {
      query: jest.fn(async (sql: string, params?: any[]) => {
        if (sql.includes('INSERT INTO')) { scheduled = claim; return []; }
        if (sql.includes('attempts = attempts')) return scheduled && !done
          ? [[{ ...scheduled, attempts: voucher.claimIdentityVoucher.mock.calls.length + 1 }], 1]
          : [[], 0];
        if (sql.includes("status = 'DONE'")) { if (done) return [[], 0]; done = true; return [[{ order_id: claim.order_id }], 1]; }
        if (sql.includes('UPDATE orders.voucher')) { localUses++; return []; }
        return [];
      }),
      transaction: async (write: any) => write(manager),
    };
    const voucher: any = { claimIdentityVoucher: jest.fn()
      .mockRejectedValueOnce(new Error('Identity unavailable')).mockResolvedValue(undefined) };
    const service = new WalletVoucherClaimOutboxService({ manager } as any, voucher);
    await service.schedule(manager, claim);
    expect(scheduled).toEqual(claim);
    await service.processPending();
    expect(done).toBe(false);
    await service.processPending();
    await service.processPending();
    expect(done).toBe(true);
    expect(localUses).toBe(1);
    expect(voucher.claimIdentityVoucher).toHaveBeenCalledTimes(2);
    expect(voucher.claimIdentityVoucher).toHaveBeenCalledWith('SAVE20', 'user-1', 62600, 'order-1');
  });

  it('marks a permanent Identity 4xx as DEAD without retrying forever', async () => {
    const updates: any[] = [];
    const manager: any = {
      query: jest.fn(async (sql: string, params?: any[]) => {
        if (sql.includes('attempts = attempts')) return [{
          order_id: 'order-2', customer_id: 'user-2', voucher_code: 'BAD', discount_amount: 1, attempts: 1,
        }];
        if (sql.includes('SET status = $2::varchar')) updates.push(params);
        return [];
      }),
      transaction: async (write: any) => write(manager),
    };
    const error: any = new Error('invalid voucher');
    error.status = 422;
    const voucher: any = { claimIdentityVoucher: jest.fn().mockRejectedValue(error) };
    const service = new WalletVoucherClaimOutboxService({ manager } as any, voucher);
    await service.processPending();
    expect(updates[0][1]).toBe('DEAD');
    expect(updates[0][3]).toBe('422');
  });

  it('returns a controlled readiness error when the outbox table is missing', async () => {
    const missing: any = new Error('relation does not exist');
    missing.code = '42P01';
    const manager: any = { query: jest.fn().mockRejectedValue(missing) };
    const service = new WalletVoucherClaimOutboxService({ manager } as any, {} as any);
    await expect(service.assertReady()).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'VOUCHER_CLAIM_OUTBOX_NOT_READY' }),
    });
  });

  it('does not invent a claim from TypeORM empty UPDATE metadata', async () => {
    const manager = { query: jest.fn(() => Promise.resolve([[], 0])) };
    const voucher = { claimIdentityVoucher: jest.fn() };
    const service = new WalletVoucherClaimOutboxService(
      { manager } as unknown as ConstructorParameters<
        typeof WalletVoucherClaimOutboxService
      >[0],
      voucher as unknown as ConstructorParameters<
        typeof WalletVoucherClaimOutboxService
      >[1],
    );
    await service.processPending();
    expect(voucher.claimIdentityVoucher).not.toHaveBeenCalled();
    expect(manager.query).toHaveBeenCalledTimes(2);
  });

  it('expires an unpaid hold without changing a paid claim and never blindly revives expiry', async () => {
    const sql: string[] = [];
    const query = jest.fn((statement: string) => {
      sql.push(statement);
      if (statement.includes('FROM orders.voucher'))
        return Promise.resolve([
          {
            trang_thai: 'ACTIVE',
            loai_phan_phoi: 'PUBLIC',
            tong_luot_dung: 1,
            luot_da_dung: 1,
            gioi_han_moi_nguoi: 1,
            han_su_dung: null,
          },
        ]);
      if (
        statement.includes(
          'FROM orders.wallet_voucher_claim_outbox WHERE order_id = $1 FOR UPDATE',
        )
      )
        return Promise.resolve([
          {
            order_id: 'order-1',
            customer_id: 'user-1',
            voucher_code: 'SAVE20',
            discount_amount: 10000,
            status: 'EXPIRED',
            created_at: new Date(0),
          },
        ]);
      return Promise.resolve([[], 0] as [unknown[], number]);
    });
    const manager = {
      query,
      transaction: async (
        work: (manager: { query: typeof query }) => Promise<boolean>,
      ) => work(manager),
    };
    const service = new WalletVoucherClaimOutboxService(
      { manager } as unknown as ConstructorParameters<
        typeof WalletVoucherClaimOutboxService
      >[0],
      {} as ConstructorParameters<typeof WalletVoucherClaimOutboxService>[1],
    );
    await service.processPending();
    expect(sql[0]).toContain("status = 'EXPIRED'");
    expect(sql[0]).toContain("payment.trang_thai = 'THANH_CONG'");
    expect(sql[0]).toContain(
      "order_row.trang_thai_thanh_toan = 'DA_THANH_TOAN'",
    );
    const markReadyStart = sql.length;
    expect(await service.markReady('order-1')).toBe(false);
    expect(
      sql
        .slice(markReadyStart)
        .some((statement) => statement.includes("SET status = 'PENDING'")),
    ).toBe(false);
    expect(
      sql
        .slice(markReadyStart)
        .some((statement) => statement.includes('NEEDS_RECONCILIATION')),
    ).toBe(true);
  });
});
