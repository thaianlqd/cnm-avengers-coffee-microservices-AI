import { Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { VoucherService } from '../voucher/voucher.service';
import { DonHang } from './entities/don-hang.entity';
import { voucherPaymentHoldTtlMinutes } from './voucher-payment-hold';

type Claim = { order_id: string; customer_id: string; voucher_code: string; discount_amount: number };
type StoredClaim = Claim & { attempts: number };

// TypeORM returns UPDATE results as [returningRows, affectedCount] on Postgres.
// Unit fakes may return returningRows directly.
function returnedUpdateRows<T>(result: unknown): T[] {
  if (!Array.isArray(result)) return [];
  if (result.length === 2 && Array.isArray(result[0]) && typeof result[1] === 'number') {
    return result[0] as T[];
  }
  return result as T[];
}

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

  /** Returns false when a late paid order needs manual reconciliation. */
  async markReady(orderId: string): Promise<boolean> {
    try {
      return await this.orders.manager.transaction(async (manager) => {
        const [claim] = await manager.query<
          Array<Claim & { status: string; created_at: Date }>
        >(
          `SELECT order_id, customer_id, voucher_code, discount_amount, status, created_at
           FROM ${this.schema}.wallet_voucher_claim_outbox WHERE order_id = $1 FOR UPDATE`,
          [orderId],
        );
        if (!claim) return false;
        if (claim.status === 'DONE' || claim.status === 'PENDING') return true;
        const fresh =
          claim.status === 'WAITING_PAYMENT' &&
          Date.now() - new Date(claim.created_at).getTime() <
            voucherPaymentHoldTtlMinutes() * 60000;
        if (fresh) {
          await manager.query(
            `UPDATE ${this.schema}.wallet_voucher_claim_outbox
             SET status = 'PENDING', next_attempt_at = now(), updated_at = now()
             WHERE order_id = $1 AND status = 'WAITING_PAYMENT'`,
            [orderId],
          );
          return true;
        }
        if (!['EXPIRED', 'WAITING_PAYMENT'].includes(claim.status))
          return false;
        // The unpaid reservation has elapsed. Check local public capacity and
        // atomically claim Identity before confirming the discounted order.
        const [local] = await manager.query<
          Array<{
            trang_thai: string;
            loai_phan_phoi: string;
            tong_luot_dung: number | null;
            luot_da_dung: number;
            gioi_han_moi_nguoi: number | null;
            han_su_dung: Date | null;
          }>
        >(
          `SELECT trang_thai, loai_phan_phoi, tong_luot_dung, luot_da_dung,
                  gioi_han_moi_nguoi, han_su_dung
           FROM ${this.schema}.voucher WHERE ma_voucher = $1 FOR UPDATE`,
          [claim.voucher_code],
        );
        let available = true;
        if (
          local &&
          (local.loai_phan_phoi === 'PUBLIC' || !local.loai_phan_phoi)
        ) {
          const [usage] = await manager.query<
            Array<{
              uses: string;
              outstanding: string;
              user_outstanding: string;
            }>
          >(
            `SELECT count(*) FILTER (WHERE customer_id = $1 AND status = 'DONE')::text AS uses,
                    count(*) FILTER (WHERE status = 'PENDING' OR
                      (status = 'WAITING_PAYMENT' AND created_at > now() - ($4::integer * interval '1 minute')))::text AS outstanding,
                    count(*) FILTER (WHERE customer_id = $1 AND (status = 'PENDING' OR
                      (status = 'WAITING_PAYMENT' AND created_at > now() - ($4::integer * interval '1 minute'))))::text AS user_outstanding
             FROM ${this.schema}.wallet_voucher_claim_outbox
             WHERE voucher_code = $2 AND order_id <> $3`,
            [
              claim.customer_id,
              claim.voucher_code,
              claim.order_id,
              voucherPaymentHoldTtlMinutes(),
            ],
          );
          available =
            local.trang_thai === 'ACTIVE' &&
            (!local.han_su_dung || new Date(local.han_su_dung) >= new Date()) &&
            (local.tong_luot_dung === null ||
              Number(local.luot_da_dung) + Number(usage?.outstanding || 0) <
                Number(local.tong_luot_dung)) &&
            Number(usage?.uses || 0) + Number(usage?.user_outstanding || 0) <
              Number(local.gioi_han_moi_nguoi || 1);
        }
        if (available) {
          try {
            await this.vouchers.claimIdentityVoucher(
              claim.voucher_code,
              claim.customer_id,
              Number(claim.discount_amount),
              claim.order_id,
            );
          } catch {
            available = false;
            this.logger.warn(
              `Late voucher claim requires reconciliation for order ${orderId}`,
            );
          }
        }
        if (!available) {
          await manager.query(
            `UPDATE ${this.schema}.wallet_voucher_claim_outbox
             SET status = 'NEEDS_RECONCILIATION', last_error = 'Late payment requires voucher reconciliation', updated_at = now()
             WHERE order_id = $1`,
            [orderId],
          );
          return false;
        }
        await manager.query(
          `UPDATE ${this.schema}.wallet_voucher_claim_outbox
           SET status = 'DONE', completed_at = now(), updated_at = now(), last_error = NULL
           WHERE order_id = $1`,
          [orderId],
        );
        if (
          local &&
          (local.loai_phan_phoi === 'PUBLIC' || !local.loai_phan_phoi)
        ) {
          await manager.query(
            `UPDATE ${this.schema}.voucher SET luot_da_dung = luot_da_dung + 1
             WHERE ma_voucher = $1`,
            [claim.voucher_code],
          );
        }
        return true;
      });
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
      await this.orders.manager.query(
        `UPDATE ${this.schema}.wallet_voucher_claim_outbox AS claim
         SET status = 'EXPIRED', last_error = 'Payment hold expired', updated_at = now()
         WHERE claim.status = 'WAITING_PAYMENT'
           AND claim.created_at <= now() - ($1::integer * interval '1 minute')
           AND NOT EXISTS (
             SELECT 1 FROM ${this.schema}.giao_dich_thanh_toan AS payment
             WHERE payment.ma_don_hang = claim.order_id AND payment.trang_thai = 'THANH_CONG'
           )
           AND NOT EXISTS (
             SELECT 1 FROM ${this.schema}.don_hang AS order_row
             WHERE order_row.ma_don_hang = claim.order_id AND order_row.trang_thai_thanh_toan = 'DA_THANH_TOAN'
           )`,
        [voucherPaymentHoldTtlMinutes()],
      );
      const claims = returnedUpdateRows<StoredClaim>(await this.orders.manager.query(
        `UPDATE ${this.schema}.wallet_voucher_claim_outbox SET
           attempts = attempts + 1,
           updated_at = now()
         WHERE order_id IN (
           SELECT order_id FROM ${this.schema}.wallet_voucher_claim_outbox
           WHERE status = 'PENDING' AND next_attempt_at <= now()
           ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 10
         ) RETURNING order_id, customer_id, voucher_code, discount_amount, attempts`,
      ));
      for (const claim of claims) {
        try {
          await this.vouchers.claimIdentityVoucher(claim.voucher_code, claim.customer_id,
            Number(claim.discount_amount), claim.order_id);
          await this.orders.manager.transaction(async manager => {
            const finished = returnedUpdateRows<{ order_id: string }>(await manager.query(
              `UPDATE ${this.schema}.wallet_voucher_claim_outbox
               SET status = 'DONE', completed_at = now(), updated_at = now(), last_error = NULL, error_code = NULL
               WHERE order_id = $1 AND status = 'PENDING' RETURNING order_id`,
              [claim.order_id],
            ));
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
                 next_attempt_at = CASE WHEN $2::varchar = 'PENDING' THEN now() + ($5::integer * interval '1 second') ELSE next_attempt_at END
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
