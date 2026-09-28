import { ThanhToanService } from './thanh-toan.service';
import { createHmac } from 'crypto';

describe('late QR payment voucher settlement', () => {
  function setup(voucherReady: boolean) {
    const transaction = {
      ma_don_hang: 'order-1',
      so_tien: 90000,
      trang_thai: 'KHOI_TAO',
      ma_tham_chieu: 'QRORDER1',
      ma_giao_dich_cong: null as string | null,
      du_lieu_tho: null as string | null,
    };
    const order = {
      ma_don_hang: 'order-1',
      ma_voucher: 'SAVE10',
      ma_nguoi_dung: 'user-1',
    };
    const service = Object.create(
      ThanhToanService.prototype,
    ) as ThanhToanService;
    const statuses: Array<Record<string, string>> = [];
    const markReady = jest.fn().mockResolvedValue(voucherReady);
    const claimWorker = jest.fn().mockResolvedValue(undefined);
    const notify = jest.fn().mockResolvedValue(undefined);
    Object.assign(service, {
      giaoDichRepo: {
        findOne: jest.fn().mockResolvedValue(transaction),
        save: jest.fn().mockResolvedValue(transaction),
      },
      donHangRepo: { findOne: jest.fn().mockResolvedValue(order) },
      walletVoucherClaims: { markReady, processPending: claimWorker },
      notificationService: { taoThongBao: notify },
      capNhatTrangThaiDonHangHeThong: jest.fn(
        (_id: string, patch: Record<string, string>) => {
          statuses.push(patch);
          return Promise.resolve();
        },
      ),
      tichDiemLoyaltyDonHang: jest.fn().mockResolvedValue(undefined),
      VNP_HASH_SECRET: 'test-only-vnpay-signing-secret',
    });
    return { service, transaction, statuses, markReady, claimWorker, notify };
  }

  it('holds a paid discounted order for reconciliation when an expired claim cannot be reacquired', async () => {
    const { service, transaction, statuses, markReady, claimWorker, notify } =
      setup(false);
    const callback = {
      transferType: 'in',
      content: 'QRORDER1',
      transferAmount: 90000,
    };
    expect(await service.xuLyWebhookSepay(callback, {}, '')).toMatchObject({
      success: true,
      reconciliation_required: true,
    });
    expect(transaction.trang_thai).toBe('THANH_CONG');
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toMatchObject({
      trang_thai_thanh_toan: 'CAN_DOI_SOAT',
      trang_thai_don_hang: 'CHO_XU_LY',
    });
    expect(claimWorker).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    await service.xuLyWebhookSepay(callback, {}, '');
    expect(markReady).toHaveBeenCalledTimes(1);
    expect(statuses).toHaveLength(1);
  });

  it('confirms a payment only after the voucher claim is ready', async () => {
    const { service, statuses, markReady, claimWorker } = setup(true);
    await service.xuLyWebhookSepay(
      { transferType: 'in', content: 'QRORDER1', transferAmount: 90000 },
      {},
      '',
    );
    expect(markReady).toHaveBeenCalledTimes(1);
    expect(statuses[0]).toMatchObject({
      trang_thai_thanh_toan: 'DA_THANH_TOAN',
      trang_thai_don_hang: 'DA_XAC_NHAN',
    });
    expect(claimWorker).toHaveBeenCalledTimes(1);
  });

  it('keeps a late VNPAY paid order in reconciliation and deduplicates callback', async () => {
    const { service, statuses, markReady, claimWorker } = setup(false);
    const unsigned = {
      vnp_TxnRef: 'QRORDER1',
      vnp_Amount: '9000000',
      vnp_ResponseCode: '00',
    };
    const signData = Object.keys(unsigned)
      .sort()
      .map(
        (key) =>
          `${encodeURIComponent(key)}=${encodeURIComponent((unsigned as Record<string, string>)[key]).replace(/%20/g, '+')}`,
      )
      .join('&');
    const vnp_SecureHash = createHmac(
      'sha512',
      'test-only-vnpay-signing-secret',
    )
      .update(Buffer.from(signData, 'utf-8'))
      .digest('hex');
    const callback = { ...unsigned, vnp_SecureHash };
    expect(await service.xuLyVnpayIpn(callback)).toMatchObject({
      RspCode: '00',
    });
    expect(statuses[0]).toMatchObject({
      trang_thai_thanh_toan: 'CAN_DOI_SOAT',
    });
    expect(claimWorker).not.toHaveBeenCalled();
    expect(await service.xuLyVnpayIpn(callback)).toMatchObject({
      RspCode: '02',
    });
    expect(markReady).toHaveBeenCalledTimes(1);
    expect(statuses).toHaveLength(1);
  });
});
