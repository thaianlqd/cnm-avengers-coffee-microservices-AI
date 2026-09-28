import { Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { VoucherService } from '../voucher/voucher.service';
import { DonHang } from './entities/don-hang.entity';

type Claim = { order_id: string; customer_id: string; voucher_code: string; discount_amount: number };
type StoredClaim = Claim & { attempts: number };

@Injectable()
export class WalletVoucherClaimOutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WalletVoucherClaimOutboxService.name);
  private readonly schema = process.env.DB_SCHEMA || 'orders';
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly maxAttempts = Math.max(1, Number(process.env.VOUCHER_CLAIM_MAX_ATTEMPTS || 8));

  constructor(
    @InjectRepository(DonHang) private readonly orders: Repository<DonHang>,
    private readonly vouchers: VoucherService,
  ) {}

  private unavailable(error: any): never {
    if (['42P01', '42703'].includes(error?.code) || /wallet_voucher_claim_outbox/i.test(String(error?.message || error))) {
      throw new ServiceUnavailableException({
        code: 'VOUCHER_CLAIM_OUTBOX_NOT_READY',
        message: 'Voucher checkout is temporarily unavailable until the required database migration is applied.',
      });
    }
    throw error;
  }

  async assertReady(manager: EntityManager = this.orders.manager): Promise<void> {
    try {
      await manager.query(
        `SELECT last_error, error_code, updated_at, dead_at
         FROM ${this.schema}.wallet_voucher_claim_outbox LIMIT 0`,
      );
    } catch (error) {
      this.unavailable(error);
    }
  }

  async schedule(manager: EntityManager, claim: Claim, ready = true): Promise<void> {
    try {
      await manager.query(
        `INSERT INTO ${this.schema}.wallet_voucher_claim_outbox
         (order_id, customer_id, voucher_code, discount_amount, status)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (order_id) DO NOTHING`,
        [claim.order_id, claim.customer_id, claim.voucher_code, claim.discount_amount,
          ready ? 'PENDING' : 'WAITING_PAYMENT'],
      );
    } catch (error) {
      this.unavailable(error);
    }
  }

  async markReady(orderId: string): Promise<void> {
    try {
      await this.orders.manager.query(
        `UPDATE ${this.schema}.wallet_voucher_claim_outbox
         SET status = 'PENDING', next_attempt_at = now(), updated_at = now()
         WHERE order_id = $1 AND status = 'WAITING_PAYMENT'`,
        [orderId],
      );
    } catch (error) {
      this.unavailable(error);
    }
  }

  async cancelWaiting(orderId: string, reason: string): Promise<void> {
    try {
      await this.orders.manager.query(
        `UPDATE ${this.schema}.wallet_voucher_claim_outbox
         SET status = 'CANCELLED', last_error = $2, updated_at = now()
         WHERE order_id = $1 AND status = 'WAITING_PAYMENT'`,
        [orderId, String(reason || 'payment cancelled').slice(0, 1000)],
      );
    } catch (error) {
      this.unavailable(error);
    }
  }

  onModuleInit() {
    this.timer = setInterval(() => { void this.processPending(); }, 30000);
    this.timer.unref?.();
    void this.processPending();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async processPending(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const claims: StoredClaim[] = await this.orders.manager.query(
        `UPDATE ${this.schema}.wallet_voucher_claim_outbox SET
           attempts = attempts + 1,
           updated_at = now()
         WHERE order_id IN (
           SELECT order_id FROM ${this.schema}.wallet_voucher_claim_outbox
           WHERE status = 'PENDING' AND next_attempt_at <= now()
           ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 10
         ) RETURNING order_id, customer_id, voucher_code, discount_amount, attempts`,
      );
      for (const claim of claims) {
        try {
          await this.vouchers.claimIdentityVoucher(claim.voucher_code, claim.customer_id,
            Number(claim.discount_amount), claim.order_id);
          await this.orders.manager.transaction(async manager => {
            const finished = await manager.query(
              `UPDATE ${this.schema}.wallet_voucher_claim_outbox
               SET status = 'DONE', completed_at = now(), updated_at = now(), last_error = NULL, error_code = NULL
               WHERE order_id = $1 AND status = 'PENDING' RETURNING order_id`,
              [claim.order_id],
            );
            if (finished.length) {
              await manager.query(
                `UPDATE ${this.schema}.voucher SET luot_da_dung = luot_da_dung + 1
                 WHERE ma_voucher = $1 AND (loai_phan_phoi = 'PUBLIC' OR loai_phan_phoi IS NULL)`,
                [claim.voucher_code],
              );
            }
          });
        } catch (error: any) {
          const httpStatus = Number(error?.response?.status || error?.status || 0);
          const permanent = httpStatus >= 400 && httpStatus < 500 && httpStatus !== 429;
          const exhausted = claim.attempts >= this.maxAttempts;
          const status = permanent || exhausted ? 'DEAD' : 'PENDING';
          const delaySeconds = Math.min(3600, 30 * (2 ** Math.max(0, claim.attempts - 1)));
          const safeMessage = String(error?.response?.data?.message || error?.message || 'voucher claim failed').slice(0, 1000);
          await this.orders.manager.query(
            `UPDATE ${this.schema}.wallet_voucher_claim_outbox
             SET status = $2::varchar, last_error = $3, error_code = $4, updated_at = now(),
                 dead_at = CASE WHEN $2::varchar = 'DEAD' THEN now() ELSE dead_at END,
                 next_attempt_at = CASE WHEN $2::varchar = 'PENDING' THEN now() + ($5 * interval '1 second') ELSE next_attempt_at END
             WHERE order_id = $1`,
            [claim.order_id, status, safeMessage, httpStatus ? String(httpStatus) : 'NETWORK', delaySeconds],
          );
          this.logger.warn(`Voucher claim for order ${claim.order_id} moved to ${status} after attempt ${claim.attempts}`);
        }
      }
    } catch (error: any) {
      if (error?.code === '42P01') {
        this.logger.warn('Voucher claim worker is idle because the outbox migration is not ready.');
      } else {
        this.logger.error(`Cannot process voucher claims: ${String(error?.message || error)}`);
      }
    } finally {
      this.running = false;
    }
  }
}
