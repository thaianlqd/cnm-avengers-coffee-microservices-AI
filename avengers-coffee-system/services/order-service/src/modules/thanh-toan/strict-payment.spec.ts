import { CustomerWalletService } from '../customer-wallet/customer-wallet.service';
import { CustomerWalletTransaction } from '../customer-wallet/entities/customer-wallet-transaction.entity';
import { ThanhToanService } from './thanh-toan.service';

describe('strict checkout payment parity', () => {
  const payment = Object.create(ThanhToanService.prototype) as ThanhToanService;

  it('COD has no external payment presentation', () => {
    expect(payment.buildStrictPaymentPresentation({
      method: 'THANH_TOAN_KHI_NHAN_HANG', userId: 'u1', orderId: 'o1', amount: 49000, reference: 'COD-q1',
    })).toEqual({ redirect_url: null, payment_details: null });
  });

  it('VNPAY returns a redirect tied to the stable transaction reference', () => {
    (payment as any).taoUrlVnpayThat = jest.fn((_user: string, _order: string, _amount: number, ref: string) => `https://vnpay.test/pay?ref=${ref}`);
    const result = payment.buildStrictPaymentPresentation({
      method: 'VNPAY', userId: 'u1', orderId: 'o1', amount: 49000, reference: 'q1_AI',
    });
    expect(result.redirect_url).toContain('q1_AI');
    expect(result.payment_details).toBeNull();
  });

  it('bank QR exposes existing payment detail fields with the stable reference', () => {
    (payment as any).taoQrNganHang = jest.fn((_amount: number, ref: string) => `qr:${ref}`);
    (payment as any).taoQrNganHangDuPhong = jest.fn((_amount: number, ref: string) => `fallback:${ref}`);
    const result = payment.buildStrictPaymentPresentation({
      method: 'NGAN_HANG_QR', userId: 'u1', orderId: 'o1', amount: 49000, reference: 'QR-q1',
    });
    expect(result).toEqual({
      redirect_url: null,
      payment_details: {
        ma_don_hang: 'o1', so_tien: 49000, ma_tham_chieu: 'QR-q1',
        qr_img_url: 'qr:QR-q1', qr_fallback_url: 'fallback:QR-q1',
      },
    });
  });

  it('wallet insufficient balance does not write a transaction', async () => {
    const wallet = Object.create(CustomerWalletService.prototype) as CustomerWalletService;
    const manager: any = {
      query: jest.fn(async () => []),
      getRepository: jest.fn(() => ({ save: jest.fn() })),
    };
    await expect(wallet.deductBalanceInTransaction(manager, 'u1', 49000, 'WALLET-q1'))
      .rejects.toThrow('So du vi dien tu khong du');
    expect(manager.getRepository).not.toHaveBeenCalled();
  });

  it('wallet debit and ledger write use the same transaction manager', async () => {
    const wallet = Object.create(CustomerWalletService.prototype) as CustomerWalletService;
    const repository = { create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    const manager: any = {
      query: jest.fn(async () => [{ customer_id: 'u1' }]),
      getRepository: jest.fn((entity) => entity === CustomerWalletTransaction ? repository : null),
    };
    await wallet.deductBalanceInTransaction(manager, 'u1', 49000, 'WALLET-q1');
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('balance >= $2'), ['u1', 49000]);
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
      customer_id: 'u1', amount: 49000, reference_id: 'WALLET-q1', type: 'PAYMENT', status: 'SUCCESS',
    }));
  });
});
