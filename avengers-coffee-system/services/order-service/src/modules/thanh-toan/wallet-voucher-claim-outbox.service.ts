import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { VoucherService } from '../voucher/voucher.service';
import { DonHang } from './entities/don-hang.entity';

type Claim = { order_id: string; customer_id: string; voucher_code: string; discount_amount: number };

@Injectable()
export class WalletVoucherClaimOutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WalletVoucherClaimOutboxService.name);
  private readonly schema = process.env.DB_SCHEMA || 'orders';
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    @InjectRepository(DonHang) private readonly orders: Repository<DonHang>,
    private readonly vouchers: VoucherService,
  ) {}

  async schedule(manager: EntityManager, claim: Claim): Promise<void> {
    await manager.query(
      `INSERT INTO ${this.schema}.wallet_voucher_claim_outbox
       (order_id, customer_id, voucher_code, discount_amount)
       VALUES ($1, $2, $3, $4) ON CONFLICT (order_id) DO NOTHING`,
      [claim.order_id, claim.customer_id, claim.voucher_code, claim.discount_amount],
    );
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
      const claims: Claim[] = await this.orders.manager.query(
        `UPDATE ${this.schema}.wallet_voucher_claim_outbox SET
           attempts = attempts + 1,
           next_attempt_at = now() + interval '1 minute'
         WHERE order_id IN (
           SELECT order_id FROM ${this.schema}.wallet_voucher_claim_outbox
           WHERE status = 'PENDING' AND next_attempt_at <= now()
           ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 10
         ) RETURNING order_id, customer_id, voucher_code, discount_amount`,
      );
      for (const claim of claims) {
        try {
          await this.vouchers.claimIdentityVoucher(claim.voucher_code, claim.customer_id,
            Number(claim.discount_amount), claim.order_id);
          await this.orders.manager.transaction(async manager => {
            const finished = await manager.query(
              `UPDATE ${this.schema}.wallet_voucher_claim_outbox
               SET status = 'DONE', completed_at = now()
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
        } catch (error) {
          this.logger.warn(`Voucher claim for order ${claim.order_id} will retry: ${String(error)}`);
        }
      }
    } catch (error) {
      this.logger.error(`Cannot process wallet voucher claims: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
