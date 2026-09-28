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
        if (sql.includes('attempts = attempts')) return scheduled && !done ? [scheduled] : [];
        if (sql.includes("status = 'DONE'")) { if (done) return []; done = true; return [{ order_id: claim.order_id }]; }
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
});
