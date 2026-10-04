import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { createHmac } from 'crypto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CustomerWalletController } from './customer-wallet.controller';
import { CustomerWalletService } from './customer-wallet.service';
import { CustomerWallet } from './entities/customer-wallet.entity';
import { CustomerWalletTransaction } from './entities/customer-wallet-transaction.entity';
import { ThanhToanService } from '../thanh-toan/thanh-toan.service';

describe('chat wallet top-up recovery without a live payment provider', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  function fixture(status = 'PENDING') {
    const tx: any = { id, customer_id: 'customer', amount: 200000, type: 'TOP_UP', status };
    const wallet: any = { balance: 20000, customer_id: 'customer' };
    const txRepo: any = { findOne: jest.fn(async () => tx), create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, id })) };
    const manager: any = { getRepository: (entity) => entity === CustomerWalletTransaction ? txRepo : { findOne: async () => wallet },
      query: jest.fn(async () => []), save: jest.fn(async () => undefined) };
    const walletRepo: any = { manager: { transaction: (work) => work(manager) } };
    const service = new CustomerWalletService(walletRepo, txRepo);
    return { service, txRepo, manager, tx, wallet };
  }

  it.each([undefined, null, NaN, Infinity, -100, 9999, 5000001, 200000.5, '200000'])('rejects invalid topup amount %s before saving a transaction', async (amount) => {
    const { service, txRepo } = fixture();
    await expect(service.topUp('customer', amount as number)).rejects.toThrow(BadRequestException);
    expect(txRepo.save).not.toHaveBeenCalled();
  });

  it('creates only a pending transaction and returns its ID without crediting the wallet', async () => {
    const { service, txRepo, wallet } = fixture();
    const result = await service.topUp('customer', 200000);
    expect(result).toMatchObject({ success: true, transaction_id: id, amount: 200000 });
    const url = new URL(result.redirect_url);
    expect(url.searchParams.get('vnp_Amount')).toBe('20000000');
    expect(url.searchParams.get('vnp_TxnRef')).toBe(`WT_${id}`);
    expect(txRepo.save).toHaveBeenCalledWith({ customer_id: 'customer', amount: 200000, type: 'TOP_UP', status: 'PENDING' });
    expect(wallet.balance).toBe(20000);
  });

  it('requires authentication and checks ownership before opening or polling a payment', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, CustomerWalletController)).toContain(JwtAuthGuard);
    const service: any = { topUp: jest.fn(), getWallet: jest.fn(), getTopUpStatus: jest.fn() };
    const controller = new CustomerWalletController(service);
    const request: any = { user: { sub: 'someone-else' } };
    expect(() => controller.topUp('customer', { amount: 200000 }, request)).toThrow(ForbiddenException);
    expect(() => controller.topUpStatus('customer', id, request)).toThrow(ForbiddenException);
    expect(() => controller.getWallet('customer', request)).toThrow(ForbiddenException);
    expect(service.topUp).not.toHaveBeenCalled();
    expect(service.getTopUpStatus).not.toHaveBeenCalled();
  });

  it('polls the exact customer-owned TOP_UP rather than inferring payment from balance', async () => {
    const { service, txRepo } = fixture();
    expect(await service.getTopUpStatus('customer', id)).toEqual({ transaction_id: id, amount: 200000, status: 'PENDING' });
    expect(txRepo.findOne).toHaveBeenCalledWith({ where: { id, customer_id: 'customer', type: 'TOP_UP' } });
    txRepo.findOne.mockResolvedValue(null);
    await expect(service.getTopUpStatus('another-customer', id)).rejects.toThrow(NotFoundException);
  });

  it('rejects an amount mismatch before crediting even when the reference exists', async () => {
    const { service, wallet, manager, tx } = fixture();
    expect(await service.processTopUpSuccess(`WT_${id}`, 100000)).toBe(false);
    expect(wallet.balance).toBe(20000); expect(tx.status).toBe('PENDING');
    expect(manager.save).not.toHaveBeenCalled();
    expect(await service.processTopUpSuccess(`WT_${id}`, 200000)).toBe(true);
    expect(wallet.balance).toBe(220000); expect(tx.status).toBe('SUCCESS');
    expect(await service.processTopUpSuccess(`WT_${id}`, 200000)).toBe(true);
    expect(wallet.balance).toBe(220000);
  });

  it('records cancellation without crediting and cannot downgrade a successful topup', async () => {
    const { service, wallet, tx, txRepo } = fixture();
    expect(await service.processTopUpFailure(`WT_${id}`, 200000)).toBe(true);
    expect(tx.status).toBe('FAILED'); expect(wallet.balance).toBe(20000);
    tx.status = 'SUCCESS'; txRepo.save.mockClear();
    expect(await service.processTopUpFailure(`WT_${id}`, 200000)).toBe(true);
    expect(tx.status).toBe('SUCCESS'); expect(txRepo.save).not.toHaveBeenCalled();
  });

  function callbackService() {
    const wallet = { processTopUpSuccess: jest.fn(async () => true), processTopUpFailure: jest.fn(async () => true) };
    const service = Object.assign(Object.create(ThanhToanService.prototype), {
      customerWalletService: wallet, VNP_HASH_SECRET: 'synthetic-signing-key',
    }) as ThanhToanService;
    return { service, wallet };
  }
  function callback(responseCode: string) {
    const values = { vnp_TxnRef: `WT_${id}`, vnp_Amount: '20000000', vnp_ResponseCode: responseCode };
    const payload = Object.keys(values).sort().map(key => `${encodeURIComponent(key)}=${encodeURIComponent(values[key]).replace(/%20/g, '+')}`).join('&');
    return { ...values, vnp_SecureHash: createHmac('sha512', 'synthetic-signing-key').update(payload).digest('hex') };
  }
  it('success return requires both a verified callback and VNPAY success code', async () => {
    const { service, wallet } = callbackService();
    expect((await service.ketQuaVnpayThat('customer', callback('24'))).success).toBe(false);
    expect(wallet.processTopUpFailure).toHaveBeenCalledWith(`WT_${id}`, 200000);
    expect(wallet.processTopUpSuccess).not.toHaveBeenCalled();
    expect((await service.ketQuaVnpayThat('customer', callback('00'))).success).toBe(true);
    expect(wallet.processTopUpSuccess).toHaveBeenCalledWith(`WT_${id}`, 200000);
  });
  it('a forged return URL cannot credit the wallet or mark the payment successful', async () => {
    const { service, wallet } = callbackService();
    expect((await service.ketQuaVnpayThat('customer', { ...callback('00'), vnp_SecureHash: 'forged' })).success).toBe(false);
    expect(wallet.processTopUpSuccess).not.toHaveBeenCalled();
    expect(wallet.processTopUpFailure).not.toHaveBeenCalled();
  });
});
