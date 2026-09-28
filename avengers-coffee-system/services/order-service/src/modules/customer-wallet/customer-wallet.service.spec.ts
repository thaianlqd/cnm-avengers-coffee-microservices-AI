import { BadRequestException } from '@nestjs/common';
import { CustomerWalletService } from './customer-wallet.service';
import { CustomerWallet } from './entities/customer-wallet.entity';
import { CustomerWalletTransaction } from './entities/customer-wallet-transaction.entity';

describe('wallet PAYMENT atomicity and idempotency', () => {
  function fixture(initialBalance = 2063000) {
    let balance = initialBalance;
    let ledger: any[] = [];
    let queue = Promise.resolve();
    const manager: any = {
      getRepository: (entity: any) => entity === CustomerWallet ? {
        findOne: jest.fn(async () => ({ customer_id: 'customer', balance })),
      } : {
        findOne: jest.fn(async ({ where }: any) => ledger.find(row => row.customer_id === where.customer_id && row.type === where.type && row.reference_id === where.reference_id) || null),
        create: (row: any) => row,
        save: jest.fn(async (row: any) => { ledger.push(row); return row; }),
      },
      save: jest.fn(async (entity: any, row: any) => {
        if (entity === CustomerWallet) balance = Number(row.balance);
        return row;
      }),
    };
    const walletRepo: any = { manager: { transaction: (work: any) => {
      const run = queue.then(async () => {
        const previousBalance = balance;
        const previousLedger = ledger.slice();
        try { return await work(manager); }
        catch (error) { balance = previousBalance; ledger = previousLedger; throw error; }
      });
      queue = run.then(() => undefined, () => undefined);
      return run;
    } } };
    const service = new CustomerWalletService(walletRepo, {} as any);
    return { service, manager, getBalance: () => balance, getLedger: () => ledger };
  }

  it('debits once, returns the balance, and accepts the same standalone reference on retry', async () => {
    const { service, getBalance, getLedger } = fixture();
    const first = await service.withWalletPayment('customer', 269600, 'WALLET-order-1', async (_manager, after) => after);
    expect(first).toBe(1793400);
    expect(await service.deductBalance('customer', 269600, 'WALLET-order-1')).toBe(true);
    expect(getBalance()).toBe(1793400);
    expect(getLedger()).toHaveLength(1);
    expect(getLedger()[0]).toMatchObject({ type: 'PAYMENT', status: 'SUCCESS', reference_id: 'WALLET-order-1' });
  });

  it('rejects insufficient funds before any order writer or cart mutation', async () => {
    const { service, getBalance, getLedger } = fixture(100);
    const writer = jest.fn();
    await expect(service.withWalletPayment('customer', 269600, 'WALLET-order-2', writer)).rejects.toThrow(BadRequestException);
    expect(writer).not.toHaveBeenCalled();
    expect(getBalance()).toBe(100);
    expect(getLedger()).toHaveLength(0);
  });

  it('rolls back debit and ledger if the order writer fails', async () => {
    const { service, getBalance, getLedger } = fixture();
    await expect(service.withWalletPayment('customer', 269600, 'WALLET-order-3', async () => {
      throw new Error('order write failed');
    })).rejects.toThrow('order write failed');
    expect(getBalance()).toBe(2063000);
    expect(getLedger()).toHaveLength(0);
  });

  it('serializes two concurrent confirmations for the same payment reference', async () => {
    const { service, getBalance, getLedger } = fixture();
    const writer = jest.fn(async () => 'saved');
    const results = await Promise.allSettled([
      service.withWalletPayment('customer', 269600, 'WALLET-order-4', writer),
      service.withWalletPayment('customer', 269600, 'WALLET-order-4', writer),
    ]);
    expect(results.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(writer).toHaveBeenCalledTimes(1);
    expect(getBalance()).toBe(1793400);
    expect(getLedger()).toHaveLength(1);
  });

  it('credits one top-up once across concurrent success callbacks', async () => {
    const topup: any = { id: 'topup-1', customer_id: 'customer', amount: 50000, type: 'TOP_UP', status: 'PENDING' };
    const wallet: any = { customer_id: 'customer', balance: 100000 };
    let queue = Promise.resolve();
    const manager: any = {
      query: jest.fn(async () => []),
      getRepository: (entity: any) => entity === CustomerWalletTransaction
        ? { findOne: jest.fn(async () => topup) }
        : { findOne: jest.fn(async () => wallet) },
      save: jest.fn(async (_entity: any, row: any) => row),
    };
    const walletRepo: any = { manager: { transaction: (work: any) => {
      const run = queue.then(() => work(manager));
      queue = run.then(() => undefined, () => undefined);
      return run;
    } } };
    const service = new CustomerWalletService(walletRepo, {} as any);
    const results = await Promise.all([
      service.processTopUpSuccess('WT_topup-1'),
      service.processTopUpSuccess('WT_topup-1'),
    ]);
    expect(results).toEqual([true, true]);
    expect(wallet.balance).toBe(150000);
    expect(topup.status).toBe('SUCCESS');
  });

  it('credits one refund once for a repeated reference', async () => {
    const wallet: any = { customer_id: 'customer', balance: 100000 };
    const refunds = new Map<string, number>();
    const manager: any = {
      query: jest.fn(async (sql: string, params: any[]) => {
        if (sql.includes('INSERT INTO') && sql.includes('customer_wallet_transaction')) {
          if (refunds.has(params[2])) return [];
          refunds.set(params[2], params[1]);
          return [{ id: `refund-${refunds.size}` }];
        }
        if (sql.includes('SELECT amount, status')) return refunds.has(params[1])
          ? [{ amount: refunds.get(params[1]), status: 'SUCCESS' }] : [];
        return [];
      }),
      getRepository: () => ({ findOne: jest.fn(async () => wallet) }),
      save: jest.fn(async (_entity: any, row: any) => row),
    };
    const walletRepo: any = { manager: { transaction: (work: any) => work(manager) } };
    const service = new CustomerWalletService(walletRepo, {} as any);
    await service.refundBalance('customer', 25000, 'ORDER-1');
    await service.refundBalance('customer', 25000, 'ORDER-1');
    expect(wallet.balance).toBe(125000);
    await expect(service.refundBalance('customer', 5000, 'ORDER-1')).rejects.toThrow('Ma tham chieu hoan tien');
    await service.refundBalance('customer', 5000, 'ORDER-1-PARTIAL-2');
    expect(wallet.balance).toBe(130000);
    expect(refunds.size).toBe(2);
  });
});
