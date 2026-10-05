import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { CustomerWallet } from './entities/customer-wallet.entity';
import { CustomerWalletTransaction } from './entities/customer-wallet-transaction.entity';
import { secretWithDevDefault } from '../../config/runtime-secrets';

@Injectable()
export class CustomerWalletService {
  private readonly logger = new Logger(CustomerWalletService.name);
  private readonly VNP_TMN_CODE = secretWithDevDefault('VNPAY_TMN_CODE', 'test-vnpay-terminal');
  private readonly VNP_HASH_SECRET = secretWithDevDefault('VNPAY_HASH_SECRET', 'test-only-vnpay-signing-secret');
  private readonly VNP_URL = process.env.VNPAY_URL || process.env.VNP_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
  private readonly VNP_RETURN_BASE_URL = process.env.PAYMENT_RETURN_BASE_URL || process.env.VNP_RETURN_BASE_URL || 'http://localhost:3000';

  constructor(
    @InjectRepository(CustomerWallet)
    private readonly walletRepo: Repository<CustomerWallet>,
    @InjectRepository(CustomerWalletTransaction)
    private readonly transactionRepo: Repository<CustomerWalletTransaction>,
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

  async topUp(customerId: string, amount: number, ipAddr = '127.0.0.1') {
    if (!Number.isSafeInteger(amount) || amount < 10000 || amount > 5000000) {
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

    return { message: 'Da khoi tao VNPAY', redirect_url: redirectUrl, success: true,
      transaction_id: savedTransaction.id, amount, expires_at: new Date(now.getTime() + 20 * 60 * 1000).toISOString() };
  }

  async getTopUpStatus(customerId: string, transactionId: string) {
    const transaction = await this.transactionRepo.findOne({
      where: { id: transactionId, customer_id: customerId, type: 'TOP_UP' },
    });
    if (!transaction) throw new NotFoundException('Khong tim thay giao dich nap vi');
    return { transaction_id: transaction.id, amount: Number(transaction.amount), status: transaction.status };
  }


  async processTopUpSuccess(txnRef: string, paidAmount?: number) {
    const txId = txnRef.replace('WT_', '');
    return this.walletRepo.manager.transaction(async manager => {
      const txRepo = manager.getRepository(CustomerWalletTransaction);
      const transaction = await txRepo.findOne({ where: { id: txId }, lock: { mode: 'pessimistic_write' } });
      if (!transaction || transaction.type !== 'TOP_UP') {
        this.logger.error(`Khong tim thay giao dich nap tien ${txnRef}`);
        return false;
      }
      if (paidAmount !== undefined && (!Number.isSafeInteger(paidAmount) || Number(transaction.amount) !== paidAmount)) return false;
      if (transaction.status === 'SUCCESS') return true;

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
      return true;
    });
  }

  async processTopUpFailure(txnRef: string, paidAmount: number) {
    return this.walletRepo.manager.transaction(async manager => {
      const repo = manager.getRepository(CustomerWalletTransaction);
      const transaction = await repo.findOne({ where: { id: txnRef.replace('WT_', '') }, lock: { mode: 'pessimistic_write' } });
      if (!transaction || transaction.type !== 'TOP_UP' || !Number.isSafeInteger(paidAmount)
          || Number(transaction.amount) !== paidAmount) return false;
      if (transaction.status !== 'SUCCESS') {
        transaction.status = 'FAILED';
        await repo.save(transaction);
      }
      return true;
    });
  }

  async deductBalance(customerId: string, amount: number, referenceId: string, transactionManager?: EntityManager) {
    return this.withWalletPayment(customerId, amount, referenceId, async () => true, true, transactionManager);
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
