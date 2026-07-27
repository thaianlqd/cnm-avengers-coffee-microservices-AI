import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { CustomerWallet } from './entities/customer-wallet.entity';
import { CustomerWalletTransaction } from './entities/customer-wallet-transaction.entity';

@Injectable()
export class CustomerWalletService {
  private readonly logger = new Logger(CustomerWalletService.name);
  private readonly VNP_TMN_CODE = process.env.VNPAY_TMN_CODE || process.env.VNP_TMN_CODE || 'MEBLXEDU';
  private readonly VNP_HASH_SECRET = process.env.VNPAY_HASH_SECRET || process.env.VNP_HASH_SECRET || 'T718SPDGIGQSKGM98VCSNAF70M9X93MC';
  private readonly VNP_URL = process.env.VNPAY_URL || process.env.VNP_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
  private readonly VNP_RETURN_BASE_URL = process.env.PAYMENT_RETURN_BASE_URL || process.env.VNP_RETURN_BASE_URL || 'http://localhost:3000';

  constructor(
    @InjectRepository(CustomerWallet)
    private readonly walletRepo: Repository<CustomerWallet>,
    @InjectRepository(CustomerWalletTransaction)
    private readonly transactionRepo: Repository<CustomerWalletTransaction>,
  ) {}

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

  async topUp(customerId: string, amount: number, ipAddr = '127.0.0.1') {
    if (amount < 10000 || amount > 5000000) {
      throw new BadRequestException('So tien nap phai tu 10,000 den 5,000,000 VND');
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
    const expireTime = new Date(now.getTime() + 20 * 60 * 1000 + (7 * 60 * 60 * 1000));
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

    return { message: 'Da khoi tao VNPAY', redirect_url: redirectUrl, success: true };
  }



  async processTopUpSuccess(txnRef: string) {
    const txId = txnRef.replace('WT_', '');
    const transaction = await this.transactionRepo.findOne({ where: { id: txId } });
    if (!transaction) {
      this.logger.error(`Khong tim thay giao dich nap tien ${txnRef}`);
      return false;
    }

    if (transaction.status === 'SUCCESS') {
      return true; // Already processed
    }

    transaction.status = 'SUCCESS';
    await this.transactionRepo.save(transaction);

    let wallet = await this.walletRepo.findOne({ where: { customer_id: transaction.customer_id } });
    if (!wallet) {
      wallet = this.walletRepo.create({ customer_id: transaction.customer_id, balance: 0 });
    }
    wallet.balance = Number(wallet.balance) + Number(transaction.amount);
    await this.walletRepo.save(wallet);
    return true;
  }

  async deductBalance(customerId: string, amount: number, referenceId: string) {
    const wallet = await this.walletRepo.findOne({ where: { customer_id: customerId } });
    if (!wallet || Number(wallet.balance) < amount) {
      throw new BadRequestException('So du vi dien tu khong du de thanh toan');
    }

    wallet.balance = Number(wallet.balance) - amount;
    await this.walletRepo.save(wallet);

    const transaction = this.transactionRepo.create({
      customer_id: customerId,
      amount: amount,
      type: 'PAYMENT',
      status: 'SUCCESS',
      reference_id: referenceId,
    });
    await this.transactionRepo.save(transaction);

    return true;
  }

  async refundBalance(customerId: string, amount: number, referenceId: string) {
    let wallet = await this.walletRepo.findOne({ where: { customer_id: customerId } });
    if (!wallet) {
      wallet = this.walletRepo.create({ customer_id: customerId, balance: 0 });
    }

    wallet.balance = Number(wallet.balance) + amount;
    await this.walletRepo.save(wallet);

    const transaction = this.transactionRepo.create({
      customer_id: customerId,
      amount: amount,
      type: 'REFUND',
      status: 'SUCCESS',
      reference_id: referenceId,
    });
    await this.transactionRepo.save(transaction);

    return true;
  }
}
