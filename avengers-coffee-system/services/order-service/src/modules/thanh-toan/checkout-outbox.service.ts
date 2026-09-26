import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RabbitMqService } from '../../infrastructure/messaging/rabbitmq.service';

/** Delivers post-commit checkout effects. Business writes never wait on it. */
@Injectable()
export class CheckoutOutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CheckoutOutboxService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly dataSource: DataSource,
    private readonly rabbitMqService: RabbitMqService,
  ) {}

  onModuleInit() {
    // Deliberately best-effort scheduling: records remain durable and can be
    // drained by any later service instance after an outage.
    this.timer = setInterval(() => void this.deliverPending(), 5_000);
    this.timer.unref?.();
    void this.deliverPending();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private schema() {
    const schema = process.env.DB_SCHEMA || 'orders';
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) throw new Error('DB_SCHEMA khong hop le');
    return schema;
  }

  async deliverPending(limit = 20) {
    const schema = this.schema();
    await this.dataSource.transaction(async (manager) => {
      const events = await manager.query(
        `SELECT event_id, event_type, payload, attempts
           FROM "${schema}".checkout_outbox
          WHERE delivered_at IS NULL AND available_at <= NOW()
          ORDER BY created_at
          FOR UPDATE SKIP LOCKED
          LIMIT $1`, [limit],
      );
      for (const event of events) {
        try {
          const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
          if (event.event_type === 'ORDER_CREATED') {
            const published = await this.rabbitMqService.publish('order.created', payload);
            if (!published) throw new Error('RabbitMQ unavailable');
          } else if (event.event_type === 'VOUCHER_USAGE_CONFIRM') {
            const response = await fetch(`${process.env.IDENTITY_SERVICE_URL || 'http://identity-service:3001'}/promotions/xac-nhan-su-dung`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-internal-token': process.env.INTERNAL_SERVICE_TOKEN || 'avengers-internal-token',
                'x-idempotency-key': String(event.event_id),
              },
              body: JSON.stringify(payload),
            });
            if (!response.ok) throw new Error(`identity voucher response ${response.status}`);
          } else {
            throw new Error(`Unsupported checkout outbox event ${event.event_type}`);
          }
          await manager.query(
            `UPDATE "${schema}".checkout_outbox
                SET delivered_at = NOW(), updated_at = NOW(), last_error = NULL
              WHERE event_id = $1`, [event.event_id],
          );
        } catch (error) {
          const attempts = Number(event.attempts || 0) + 1;
          // Bounded exponential backoff keeps failures retryable without a
          // tight loop; a checkout retry never creates a second logical row.
          await manager.query(
            `UPDATE "${schema}".checkout_outbox
                SET attempts = $2, available_at = NOW() + ($3 * INTERVAL '1 second'),
                    last_error = $4, updated_at = NOW()
              WHERE event_id = $1`,
            [event.event_id, attempts, Math.min(300, 2 ** Math.min(attempts, 8)), String(error).slice(0, 1000)],
          );
          this.logger.warn(`Checkout outbox ${event.event_id} retry ${attempts}: ${String(error)}`);
        }
      }
    });
  }
}
