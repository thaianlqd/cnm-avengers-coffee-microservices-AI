import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { CustomerWallet } from './entities/customer-wallet.entity';
import { CustomerWalletTransaction } from './entities/customer-wallet-transaction.entity';
import { secretWithDevDefault } from '../../config/runtime-secrets';

import { SmtpService } from '../smtp/smtp.service';

@Injectable()
export class CustomerWalletService {
  private readonly logger = new Logger(CustomerWalletService.name);
  private readonly VNP_TMN_CODE = secretWithDevDefault('VNPAY_TMN_CODE', 'test-vnpay-terminal');
  private readonly VNP_HASH_SECRET = secretWithDevDefault('VNPAY_HASH_SECRET', 'test-only-vnpay-signing-secret');
  private readonly VNP_URL = process.env.VNPAY_URL || process.env.VNP_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
  private readonly VNP_RETURN_BASE_URL = process.env.PAYMENT_RETURN_BASE_URL || process.env.VNP_RETURN_BASE_URL || 'http://localhost:3000';
  private readonly SEPAY_BANK_CODE = process.env.SEPAY_BANK_CODE || 'MBBank';
  private readonly SEPAY_ACCOUNT_NO = process.env.SEPAY_ACCOUNT_NO || '025452790502';

  constructor(
    @InjectRepository(CustomerWallet)
    private readonly walletRepo: Repository<CustomerWallet>,
    @InjectRepository(CustomerWalletTransaction)
    private readonly transactionRepo: Repository<CustomerWalletTransaction>,
    private readonly smtpService: SmtpService,
  ) {
  }

  async getWallet(customerId: string) {
    if (!customerId || customerId === 'anonymous') throw new BadRequestException('Khach hang khong hop le');
    
    let wallet = await this.walletRepo.findOne({ where: { customer_id: customerId } });
    if (!wallet) {
      wallet = this.walletRepo.create({ customer_id: customerId, balance: 0 });
      wallet = await this.walletRepo.save(wallet);
    }
    
    const transactions = await this.transactionRepo.find({
      where: { customer_id: customerId },
      order: { created_at: 'DESC' },
      take: 50,
    });
    
    return { wallet, transactions };
  }

  async topUp(customerId: string, amount: number, ipAddr = '127.0.0.1', paymentMethod = 'VNPAY') {
    if (!Number.isSafeInteger(amount) || amount < 10000 || amount > 5000000) {
      throw new BadRequestException('So tien nap phai tu 10,000 den 5,000,000 VND');
    }

    if (paymentMethod === 'NGAN_HANG_QR' || paymentMethod === 'QR' || paymentMethod === 'BANK_QR') {
      const existingPending = await this.transactionRepo.findOne({
        where: {
          customer_id: customerId,
          type: 'TOP_UP',
          status: 'PENDING',
        },
        order: { created_at: 'DESC' },
      });

      if (existingPending) {
        const createdAtTime = new Date(existingPending.created_at).getTime();
        const expiresAtTime = createdAtTime + 5 * 60 * 1000;
        const now = Date.now();

        if (now >= expiresAtTime) {
          existingPending.status = 'FAILED';
          await this.transactionRepo.save(existingPending);
        } else if (Number(existingPending.amount) === Number(amount)) {
          const txnRef = `WT_${existingPending.id}`;
          const qrUrl = `https://img.vietqr.io/image/${encodeURIComponent(this.SEPAY_BANK_CODE)}-${encodeURIComponent(this.SEPAY_ACCOUNT_NO)}-compact2.png?amount=${Math.round(amount)}&addInfo=${encodeURIComponent(txnRef)}`;
          const sepayQrUrl = `https://qr.sepay.vn/img?bank=${encodeURIComponent(this.SEPAY_BANK_CODE)}&acc=${encodeURIComponent(this.SEPAY_ACCOUNT_NO)}&template=compact&amount=${Math.round(amount)}&des=${encodeURIComponent(txnRef)}`;
          return {
            message: 'Đang tiếp tục giao dịch nạp tiền chờ thanh toán',
            success: true,
            is_resumed: true,
            paymentMethod: 'NGAN_HANG_QR',
            transaction_id: existingPending.id,
            amount: Number(existingPending.amount),
            bank_code: this.SEPAY_BANK_CODE,
            bank_name: 'Ngân hàng Quân Đội (MBBank)',
            account_no: this.SEPAY_ACCOUNT_NO,
            account_name: 'AVENGERS COFFEE',
            transfer_content: txnRef,
            qr_url: qrUrl,
            sepay_qr_url: sepayQrUrl,
            created_at: existingPending.created_at,
            expires_at: new Date(expiresAtTime).toISOString(),
          };
        } else {
          existingPending.status = 'FAILED';
          await this.transactionRepo.save(existingPending);
        }
      }

      const transaction = this.transactionRepo.create({
        customer_id: customerId,
        amount: amount,
        type: 'TOP_UP',
        status: 'PENDING',
      });
      const savedTransaction = await this.transactionRepo.save(transaction);
      const txnRef = `WT_${savedTransaction.id}`;
      const qrUrl = `https://img.vietqr.io/image/${encodeURIComponent(this.SEPAY_BANK_CODE)}-${encodeURIComponent(this.SEPAY_ACCOUNT_NO)}-compact2.png?amount=${Math.round(amount)}&addInfo=${encodeURIComponent(txnRef)}`;
      const sepayQrUrl = `https://qr.sepay.vn/img?bank=${encodeURIComponent(this.SEPAY_BANK_CODE)}&acc=${encodeURIComponent(this.SEPAY_ACCOUNT_NO)}&template=compact&amount=${Math.round(amount)}&des=${encodeURIComponent(txnRef)}`;
      return {
        message: 'Đã khởi tạo mã QR nạp tiền thành công',
        success: true,
        paymentMethod: 'NGAN_HANG_QR',
        transaction_id: savedTransaction.id,
        amount,
        bank_code: this.SEPAY_BANK_CODE,
        bank_name: 'Ngân hàng Quân Đội (MBBank)',
        account_no: this.SEPAY_ACCOUNT_NO,
        account_name: 'AVENGERS COFFEE',
        transfer_content: txnRef,
        qr_url: qrUrl,
        sepay_qr_url: sepayQrUrl,
        created_at: savedTransaction.created_at,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      };
    }

    const transaction = this.transactionRepo.create({
      customer_id: customerId,
      amount: amount,
      type: 'TOP_UP',
      status: 'PENDING',
    });
    const savedTransaction = await this.transactionRepo.save(transaction);
    const txnRef = `WT_${savedTransaction.id}`;

    let finalIpAddr = ipAddr;
    if (finalIpAddr === '::1' || finalIpAddr === '127.0.0.1' || finalIpAddr.startsWith('172.') || finalIpAddr.startsWith('192.168.') || finalIpAddr.startsWith('10.')) {
        finalIpAddr = '113.190.232.222';
    }

    const returnBase = this.VNP_RETURN_BASE_URL.replace(/\/+$/, '');
    const returnUrl = `${returnBase}/customers/${customerId}/thanh-toan/vnpay/ket-qua`;

    const f = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const vnTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    const createDate = `${vnTime.getUTCFullYear()}${f(vnTime.getUTCMonth() + 1)}${f(vnTime.getUTCDate())}${f(vnTime.getUTCHours())}${f(vnTime.getUTCMinutes())}${f(vnTime.getUTCSeconds())}`;
    const expireTime = new Date(now.getTime() + 5 * 60 * 1000 + (7 * 60 * 60 * 1000));
    const expireDate = `${expireTime.getUTCFullYear()}${f(expireTime.getUTCMonth() + 1)}${f(expireTime.getUTCDate())}${f(expireTime.getUTCHours())}${f(expireTime.getUTCMinutes())}${f(expireTime.getUTCSeconds())}`;

    const params: any = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode: this.VNP_TMN_CODE,
        vnp_Amount: String(Math.round(amount) * 100),
        vnp_CreateDate: createDate,
        vnp_CurrCode: 'VND',
        vnp_IpAddr: finalIpAddr,
        vnp_Locale: 'vn',
        vnp_OrderInfo: `Nap tien vao vi ${txnRef}`,
        vnp_OrderType: 'billpayment',
        vnp_ReturnUrl: returnUrl,
        vnp_TxnRef: txnRef,
        vnp_ExpireDate: expireDate,
    };

    const sortedKeys = Object.keys(params).sort();
    const signData = sortedKeys
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key])).replace(/%20/g, '+')}`)
      .join('&');

    const hmac = crypto.createHmac('sha512', this.VNP_HASH_SECRET);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    const urlQuery = sortedKeys
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key])).replace(/%20/g, '+')}`)
      .join('&');
    const redirectUrl = `${this.VNP_URL}?${urlQuery}&vnp_SecureHash=${signed}`;

    return { message: 'Da khoi tao VNPAY', redirect_url: redirectUrl, success: true,
      transaction_id: savedTransaction.id, amount, expires_at: new Date(now.getTime() + 5 * 60 * 1000).toISOString() };
  }

  async getTopUpStatus(customerId: string, transactionId: string) {
    const transaction = await this.transactionRepo.findOne({
      where: { id: transactionId, customer_id: customerId, type: 'TOP_UP' },
    });
    if (!transaction) throw new NotFoundException('Khong tim thay giao dich nap vi');

    // Tự động hủy nếu quá 5 phút mà chưa thanh toán thành công
    if (transaction.status === 'PENDING') {
      const elapsedMs = Date.now() - new Date(transaction.created_at).getTime();
      if (elapsedMs > 5 * 60 * 1000) {
        transaction.status = 'FAILED';
        await this.transactionRepo.save(transaction);
        this.sendTopUpCancelledEmail(customerId, Number(transaction.amount), transaction.id, 'Quá thời hạn 5 phút chờ chuyển khoản').catch(e => {
          this.logger.error(`Error sending topup cancelled email: ${e?.message}`);
        });
      }
    }

    return {
      transaction_id: transaction.id,
      amount: Number(transaction.amount),
      status: transaction.status,
      created_at: transaction.created_at,
      expires_at: new Date(new Date(transaction.created_at).getTime() + 5 * 60 * 1000).toISOString(),
    };
  }

  async getActivePendingTopUp(customerId: string) {
    const existingPending = await this.transactionRepo.findOne({
      where: {
        customer_id: customerId,
        type: 'TOP_UP',
        status: 'PENDING',
      },
      order: { created_at: 'DESC' },
    });

    if (!existingPending) return null;

    const createdAtTime = new Date(existingPending.created_at).getTime();
    const expiresAtTime = createdAtTime + 5 * 60 * 1000;
    const now = Date.now();

    if (now >= expiresAtTime) {
      existingPending.status = 'FAILED';
      await this.transactionRepo.save(existingPending);
      return null;
    }

    const amount = Number(existingPending.amount);
    const txnRef = `WT_${existingPending.id}`;
    const qrUrl = `https://img.vietqr.io/image/${encodeURIComponent(this.SEPAY_BANK_CODE)}-${encodeURIComponent(this.SEPAY_ACCOUNT_NO)}-compact2.png?amount=${Math.round(amount)}&addInfo=${encodeURIComponent(txnRef)}`;
    const sepayQrUrl = `https://qr.sepay.vn/img?bank=${encodeURIComponent(this.SEPAY_BANK_CODE)}&acc=${encodeURIComponent(this.SEPAY_ACCOUNT_NO)}&template=compact&amount=${Math.round(amount)}&des=${encodeURIComponent(txnRef)}`;

    return {
      message: 'Giao dịch nạp tiền đang chờ thanh toán',
      success: true,
      paymentMethod: 'NGAN_HANG_QR',
      transaction_id: existingPending.id,
      amount,
      bank_code: this.SEPAY_BANK_CODE,
      bank_name: 'Ngân hàng Quân Đội (MBBank)',
      account_no: this.SEPAY_ACCOUNT_NO,
      account_name: 'AVENGERS COFFEE',
      transfer_content: txnRef,
      qr_url: qrUrl,
      sepay_qr_url: sepayQrUrl,
      created_at: existingPending.created_at,
      expires_at: new Date(expiresAtTime).toISOString(),
    };
  }

  async cancelTopUp(customerId: string, transactionId: string) {
    const transaction = await this.transactionRepo.findOne({
      where: { id: transactionId, customer_id: customerId, type: 'TOP_UP' },
    });
    if (!transaction) throw new NotFoundException('Khong tim thay giao dich nap vi');
    if (transaction.status === 'PENDING') {
      transaction.status = 'FAILED';
      await this.transactionRepo.save(transaction);
      this.sendTopUpCancelledEmail(customerId, Number(transaction.amount), transaction.id, 'Giao dịch bị hủy do hết thời gian 5 phút hoặc người dùng đã hủy').catch(e => {
        this.logger.error(`Error sending topup cancelled email: ${e?.message}`);
      });
    }
    return { success: true, message: 'Giao dịch đã được hủy', status: transaction.status };
  }

  async confirmTopUp(customerId: string, transactionId: string) {
    const transaction = await this.transactionRepo.findOne({
      where: { id: transactionId, customer_id: customerId, type: 'TOP_UP' },
    });
    if (!transaction) throw new NotFoundException('Khong tim thay giao dich nap vi');
    if (transaction.status === 'SUCCESS') {
      return { success: true, message: 'Nạp tiền vào ví thành công!' };
    }
    return { success: false, message: 'Hệ thống đang chờ ngân hàng xác nhận giao dịch chuyển khoản thực tế.' };
  }


  async processTopUpSuccess(txnRef: string, paidAmount?: number) {
    const txId = txnRef.replace(/^WT[_-]*/i, '');
    try {
      const result = await this.walletRepo.manager.transaction(async manager => {
        const txRepo = manager.getRepository(CustomerWalletTransaction);
        const transaction = await txRepo.findOne({ where: { id: txId }, lock: { mode: 'pessimistic_write' } });
        if (!transaction || transaction.type !== 'TOP_UP') {
          this.logger.error(`Khong tim thay giao dich nap tien ${txnRef}`);
          return null;
        }
        const numPaid = paidAmount !== undefined ? Number(paidAmount) : undefined;
        if (numPaid !== undefined && (!Number.isFinite(numPaid) || Number(transaction.amount) !== numPaid)) {
          this.logger.warn(`Amount mismatch for ${txnRef}: expected ${transaction.amount}, received ${paidAmount}`);
          return null;
        }
        if (transaction.status === 'SUCCESS') return { alreadySuccess: true };

        const schema = process.env.DB_SCHEMA || 'orders';
        await manager.query(
          `INSERT INTO ${schema}.customer_wallet (customer_id, balance)
           VALUES ($1, 0) ON CONFLICT (customer_id) DO NOTHING`,
          [transaction.customer_id],
        );
        const wallet = await manager.getRepository(CustomerWallet).findOne({
          where: { customer_id: transaction.customer_id }, lock: { mode: 'pessimistic_write' },
        });
        if (!wallet) throw new BadRequestException('Khong the khoi tao vi khach hang');
        wallet.balance = Number(wallet.balance) + Number(transaction.amount);
        await manager.save(CustomerWallet, wallet);
        transaction.status = 'SUCCESS';
        await manager.save(CustomerWalletTransaction, transaction);
        return { success: true, customerId: transaction.customer_id, amount: Number(transaction.amount), transactionId: transaction.id, balance: Number(wallet.balance) };
      });

      if (result && result.success && result.customerId) {
        this.sendTopUpSuccessEmail(result.customerId, result.amount, result.transactionId, result.balance).catch(e => {
          this.logger.error(`Error sending topup success email: ${e?.message}`);
        });
        return true;
      }
      return Boolean(result?.alreadySuccess);
    } catch (err) {
      this.logger.error(`Error in processTopUpSuccess for ${txnRef}: ${err?.message}`, err?.stack);
      throw err;
    }
  }

  async processTopUpFailure(txnRef: string, paidAmount: number) {
    return this.walletRepo.manager.transaction(async manager => {
      const repo = manager.getRepository(CustomerWalletTransaction);
      const transaction = await repo.findOne({ where: { id: txnRef.replace(/^WT[_-]*/i, '') }, lock: { mode: 'pessimistic_write' } });
      if (!transaction || transaction.type !== 'TOP_UP' || !Number.isSafeInteger(paidAmount)
          || Number(transaction.amount) !== paidAmount) return false;
      if (transaction.status !== 'SUCCESS') {
        transaction.status = 'FAILED';
        await repo.save(transaction);
        this.sendTopUpCancelledEmail(transaction.customer_id, Number(transaction.amount), transaction.id, 'Giao dịch không thành công').catch(e => {
          this.logger.error(`Error sending topup failure email: ${e?.message}`);
        });
      }
      return true;
    });
  }

  private async findCustomerInfo(customerId: string): Promise<{ email: string; name: string } | null> {
    try {
      const res = await this.walletRepo.manager.query(
        `SELECT email, ho_ten FROM identity.nguoi_dung WHERE ma_nguoi_dung::text = $1 OR ten_dang_nhap = $1 OR email = $1 LIMIT 1`,
        [customerId],
      );
      if (res && res.length > 0 && res[0].email) {
        return { email: String(res[0].email).trim(), name: res[0].ho_ten || 'Quý khách' };
      }
    } catch (e) {
      this.logger.warn(`Could not fetch customer email: ${e?.message}`);
    }
    return null;
  }

  private async sendTopUpSuccessEmail(customerId: string, amount: number, transactionId: string, newBalance: number) {
    try {
      const customer = await this.findCustomerInfo(customerId);
      if (!customer || !customer.email) {
        this.logger.log(`No email found for customer ${customerId}, skipping topup success email.`);
        return;
      }

      const formattedAmount = Number(amount).toLocaleString('vi-VN') + ' đ';
      const formattedBalance = Number(newBalance).toLocaleString('vi-VN') + ' đ';
      const formattedDate = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #f0f0f0; border-radius: 16px; overflow: hidden; background: #ffffff;">
          <div style="background: linear-gradient(135deg, #b22830 0%, #8f1d24 100%); padding: 24px; text-align: center; color: #ffffff;">
            <h2 style="margin: 0; font-size: 20px; font-weight: bold; letter-spacing: 1px;">AVENGERS COFFEE</h2>
            <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Thông báo nạp tiền vào ví điện tử</p>
          </div>
          <div style="padding: 28px 24px;">
            <p style="font-size: 15px; color: #333333; margin-top: 0;">Xin chào <strong>${customer.name}</strong>,</p>
            <p style="font-size: 14px; color: #555555; line-height: 1.6;">Giao dịch nạp tiền vào ví điện tử của Quý khách đã được <strong>xác nhận thành công</strong> từ hệ thống ngân hàng.</p>
            
            <div style="background: #faf8f5; border: 1px solid #ebd8c8; border-radius: 12px; padding: 18px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13.5px;">
                <tr>
                  <td style="padding: 6px 0; color: #666666;">Mã giao dịch:</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #222222; font-family: monospace;">WT_${transactionId.slice(0, 8)}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #666666;">Số tiền nạp:</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #15803d; font-size: 15px;">+${formattedAmount}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #666666;">Số dư ví mới:</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #b22830; font-size: 15px;">${formattedBalance}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #666666;">Phương thức:</td>
                  <td style="padding: 6px 0; text-align: right; color: #444444;">Chuyển khoản QR ngân hàng (VietQR / MBBank)</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #666666;">Thời gian ghi nhận:</td>
                  <td style="padding: 6px 0; text-align: right; color: #444444;">${formattedDate}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #666666;">Trạng thái:</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #15803d;">Thành công</td>
                </tr>
              </table>
            </div>

            <p style="font-size: 13px; color: #777777; line-height: 1.5; margin-bottom: 0;">Số dư đã được cộng trực tiếp vào ví Avengers của Quý khách và có thể dùng để thanh toán các đơn hàng đồ uống ngay bây giờ.</p>
          </div>
          <div style="background: #f8fafc; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9;">
            Avengers Coffee • Hotline hỗ trợ: 1900 1755 • Email: support@avengerscoffee.vn
          </div>
        </div>
      `;

      await this.smtpService.sendMail({
        to: customer.email,
        subject: `[Avengers Coffee] Nạp tiền ví thành công (+${formattedAmount})`,
        html,
      });
      this.logger.log(`TopUp success email sent to ${customer.email} for transaction ${transactionId}`);
    } catch (err) {
      this.logger.error(`Failed to send topup success email: ${err?.message}`);
    }
  }

  private async sendTopUpCancelledEmail(customerId: string, amount: number, transactionId: string, reason = 'Quá thời hạn 5 phút chờ chuyển khoản') {
    try {
      const customer = await this.findCustomerInfo(customerId);
      if (!customer || !customer.email) {
        this.logger.log(`No email found for customer ${customerId}, skipping topup cancellation email.`);
        return;
      }

      const formattedAmount = Number(amount).toLocaleString('vi-VN') + ' đ';
      const formattedDate = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #f0f0f0; border-radius: 16px; overflow: hidden; background: #ffffff;">
          <div style="background: #475569; padding: 22px; text-align: center; color: #ffffff;">
            <h2 style="margin: 0; font-size: 20px; font-weight: bold; letter-spacing: 1px;">AVENGERS COFFEE</h2>
            <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Thông báo hủy giao dịch nạp ví</p>
          </div>
          <div style="padding: 28px 24px;">
            <p style="font-size: 15px; color: #333333; margin-top: 0;">Xin chào <strong>${customer.name}</strong>,</p>
            <p style="font-size: 14px; color: #555555; line-height: 1.6;">Yêu cầu nạp tiền vào ví điện tử của Quý khách đã <strong>bị hủy</strong> do quá thời hạn 5 phút mà hệ thống chưa nhận được tiền chuyển khoản từ ngân hàng.</p>
            
            <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px; padding: 18px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13.5px;">
                <tr>
                  <td style="padding: 6px 0; color: #666666;">Mã giao dịch:</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #222222; font-family: monospace;">WT_${transactionId.slice(0, 8)}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #666666;">Số tiền yêu cầu:</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #444444;">${formattedAmount}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #666666;">Lý do hủy:</td>
                  <td style="padding: 6px 0; text-align: right; color: #c2410c; font-weight: 500;">${reason}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #666666;">Thời gian hủy:</td>
                  <td style="padding: 6px 0; text-align: right; color: #444444;">${formattedDate}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #666666;">Trạng thái:</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #dc2626;">Đã hủy (Chưa thanh toán)</td>
                </tr>
              </table>
            </div>

            <p style="font-size: 13px; color: #777777; line-height: 1.5; margin-bottom: 0;">Nếu Quý khách đã thực hiện chuyển tiền từ tài khoản ngân hàng nhưng nhận được thông báo này, xin đừng lo lắng! Vui lòng liên hệ hotline <strong>1900 1755</strong> để được đội ngũ hỗ trợ kiểm tra và cập nhật tiền vào ví ngay cho Quý khách.</p>
          </div>
          <div style="background: #f8fafc; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9;">
            Avengers Coffee • Hotline hỗ trợ: 1900 1755 • Email: support@avengerscoffee.vn
          </div>
        </div>
      `;

      await this.smtpService.sendMail({
        to: customer.email,
        subject: `[Avengers Coffee] Thông báo hủy giao dịch nạp ví #${transactionId.slice(0, 8)}`,
        html,
      });
      this.logger.log(`TopUp cancellation email sent to ${customer.email} for transaction ${transactionId}`);
    } catch (err) {
      this.logger.error(`Failed to send topup cancellation email: ${err?.message}`);
    }
  }

  async deductBalance(customerId: string, amount: number, referenceId: string, transactionManager?: EntityManager) {
    return this.withWalletPayment(customerId, amount, referenceId, async () => true, true, transactionManager);
  }

  /** Called inside the transaction holding the gift-card row lock. */
  async creditGiftCard(customerId: string, amount: number, code: string, manager: EntityManager) {
    if (!customerId || !Number.isSafeInteger(amount) || amount <= 0 || !code) {
      throw new BadRequestException('Thông tin thẻ quà tặng không hợp lệ');
    }
    const schema = process.env.DB_SCHEMA || 'orders';
    await manager.query(
      `INSERT INTO ${schema}.customer_wallet (customer_id, balance)
       VALUES ($1, 0) ON CONFLICT (customer_id) DO NOTHING`, [customerId],
    );
    const wallet = await manager.getRepository(CustomerWallet).findOne({
      where: { customer_id: customerId }, lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) throw new BadRequestException('Không thể khởi tạo ví khách hàng');
    const transactions = manager.getRepository(CustomerWalletTransaction);
    const previous = await transactions.findOne({ where: { type: 'GIFT_CARD', reference_id: code } });
    if (previous) throw new ConflictException({ code: 'GIFT_CARD_USED', message: 'Thẻ quà tặng đã được sử dụng' });
    wallet.balance = Number(wallet.balance) + amount;
    await manager.save(CustomerWallet, wallet);
    const transaction = await transactions.save(transactions.create({
      customer_id: customerId, amount, type: 'GIFT_CARD', status: 'SUCCESS', reference_id: code,
    }));
    return { wallet_balance: Number(wallet.balance), transaction_id: transaction.id };
  }

  async withWalletPayment<T>(customerId: string, amount: number, referenceId: string,
    writeOrder: (manager: EntityManager, balanceAfter: number) => Promise<T>, allowReplay = false,
    transactionManager?: EntityManager): Promise<T> {
    if (!customerId || !Number.isFinite(amount) || amount < 0 || !referenceId) {
      throw new BadRequestException('Thong tin thanh toan vi khong hop le');
    }
    const pay = async (manager: EntityManager): Promise<T> => {
      const wallet = await manager.getRepository(CustomerWallet).findOne({
        where: { customer_id: customerId }, lock: { mode: 'pessimistic_write' },
      });
      const paymentRepo = manager.getRepository(CustomerWalletTransaction);
      const existing = await paymentRepo.findOne({
        where: { customer_id: customerId, type: 'PAYMENT', reference_id: referenceId },
      });
      if (existing) {
        if (existing.status !== 'SUCCESS' || Number(existing.amount) !== amount) {
          throw new BadRequestException('Ma tham chieu vi da duoc su dung cho giao dich khac');
        }
        if (allowReplay) return true as T;
        // An order writer must never run twice for a consumed reference.
        throw new BadRequestException('Giao dich vi da duoc xu ly; hay truy van don hang cu');
      }
      if (!wallet || Number(wallet.balance) < amount) {
        throw new BadRequestException(`Ví chưa đủ tiền. Bạn cần nạp thêm ${Math.max(0, amount - Number(wallet?.balance || 0)).toLocaleString('vi-VN')}đ rồi xem lại thay đổi trước khi xác nhận.`);
      }
      const balanceAfter = Number(wallet.balance) - amount;
      wallet.balance = balanceAfter;
      await manager.save(CustomerWallet, wallet);
      await paymentRepo.save(paymentRepo.create({
        customer_id: customerId, amount, type: 'PAYMENT', status: 'SUCCESS', reference_id: referenceId,
      }));
      return writeOrder(manager, balanceAfter);
    };
    return transactionManager ? pay(transactionManager) : this.walletRepo.manager.transaction(pay);
  }

  async refundBalance(customerId: string, amount: number, referenceId: string, transactionManager?: any) {
    // referenceId identifies one refund event. Callers issuing separate
    // partial refunds must give each event a distinct reference.
    if (!customerId || !referenceId || !Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Thong tin hoan tien vi khong hop le');
    }
    const refund = async (manager: any) => {
      const schema = process.env.DB_SCHEMA || 'orders';
      const inserted = await manager.query(
        `INSERT INTO ${schema}.customer_wallet_transaction
         (customer_id, amount, type, status, reference_id)
         VALUES ($1, $2, 'REFUND', 'SUCCESS', $3)
         ON CONFLICT (customer_id, reference_id) WHERE type = 'REFUND' AND reference_id IS NOT NULL
         DO NOTHING RETURNING id`,
        [customerId, amount, referenceId],
      );
      if (!inserted.length) {
        const existing = (await manager.query(
          `SELECT amount, status FROM ${schema}.customer_wallet_transaction
           WHERE customer_id = $1 AND reference_id = $2 AND type = 'REFUND' LIMIT 1`,
          [customerId, referenceId],
        )) as Array<{ amount: string | number; status: string }>;
        if (!existing.length || existing[0].status !== 'SUCCESS' || Number(existing[0].amount) !== amount) {
          throw new ConflictException('Ma tham chieu hoan tien da duoc su dung cho giao dich khac');
        }
        return true;
      }
      await manager.query(
        `INSERT INTO ${schema}.customer_wallet (customer_id, balance)
         VALUES ($1, 0) ON CONFLICT (customer_id) DO NOTHING`,
        [customerId],
      );
      const wallet = await manager.getRepository(CustomerWallet).findOne({
        where: { customer_id: customerId }, lock: { mode: 'pessimistic_write' },
      });
      if (!wallet) throw new BadRequestException('Khong the khoi tao vi khach hang');
      wallet.balance = Number(wallet.balance) + amount;
      await manager.save(CustomerWallet, wallet);
      return true;
    };
    return transactionManager ? refund(transactionManager) : this.walletRepo.manager.transaction(refund);
  }
}
