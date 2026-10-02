import { Injectable, OnModuleInit } from '@nestjs/common';
import { RedisCacheService } from '../cache/redis-cache.service';
import { DomainEvent, RabbitMqService } from '../messaging/rabbitmq.service';

@Injectable()
export class RealtimeAnalyticsService implements OnModuleInit {
  constructor(
    private readonly rabbitMqService: RabbitMqService,
    private readonly redisCacheService: RedisCacheService,
  ) {}

  onModuleInit() {
    this.rabbitMqService.subscribe((event) => this.handleEvent(event));
  }

  async getSnapshot(branchCodeRaw?: string) {
    const dateKey = new Date().toISOString().slice(0, 10);
    const branchCode = this.normalizeBranchCode(branchCodeRaw);
    const prefix = this.buildPrefix(dateKey, branchCode);

    const [ordersCreated, ordersCompleted, ordersCancelled, revenueGross, revenueCompleted, paymentsSucceeded, notificationsCreated] = await Promise.all([
      this.redisCacheService.getNumber(`${prefix}:orders_created`),
      this.redisCacheService.getNumber(`${prefix}:orders_completed`),
      this.redisCacheService.getNumber(`${prefix}:orders_cancelled`),
      this.redisCacheService.getNumber(`${prefix}:revenue_gross`),
      this.redisCacheService.getNumber(`${prefix}:revenue_completed`),
      this.redisCacheService.getNumber(`${prefix}:payments_succeeded`),
      this.redisCacheService.getNumber(`${prefix}:notifications_created`),
    ]);

    return {
      branch_code: branchCode,
      date_key: dateKey,
      orders_created: ordersCreated,
      orders_completed: ordersCompleted,
      orders_cancelled: ordersCancelled,
      revenue_gross: revenueGross,
      revenue_completed: revenueCompleted,
      payments_succeeded: paymentsSucceeded,
      notifications_created: notificationsCreated,
      redis_enabled: this.redisCacheService.isAvailable(),
    };
  }

  private async handleEvent(event: DomainEvent) {
    const branchCode = this.normalizeBranchCode(
      String(event.payload.branchCode || event.payload.co_so_ma || 'MAC_DINH_CHI'),
    );
    const dateKey = event.occurredAt.slice(0, 10);
    const prefix = this.buildPrefix(dateKey, branchCode);
    const totalAmount = Number(event.payload.totalAmount || event.payload.tong_tien || 0);
    const status = String(event.payload.status || event.payload.trang_thai_don_hang || '').toUpperCase();

    if (event.routingKey === 'order.created') {
      await Promise.all([
        this.redisCacheService.increment(`${prefix}:orders_created`, 1, 86400),
        this.redisCacheService.increment(`${prefix}:revenue_gross`, totalAmount, 86400),
      ]);
      return;
    }

    if (event.routingKey === 'order.status.changed') {
      if (status === 'HOAN_THANH') {
        await Promise.all([
          this.redisCacheService.increment(`${prefix}:orders_completed`, 1, 86400),
          this.redisCacheService.increment(`${prefix}:revenue_completed`, totalAmount, 86400),
        ]);
      }

      if (status === 'DA_HUY') {
        await this.redisCacheService.increment(`${prefix}:orders_cancelled`, 1, 86400);
      }
      return;
    }

    if (event.routingKey === 'payment.succeeded') {
      await this.redisCacheService.increment(`${prefix}:payments_succeeded`, 1, 86400);
      return;
    }

    if (event.routingKey === 'notification.created') {
      await this.redisCacheService.increment(`${prefix}:notifications_created`, 1, 86400);
    }
  }

  private buildPrefix(dateKey: string, branchCode: string) {
    return `analytics:${dateKey}:${branchCode}`;
  }

  private normalizeBranchCode(branchCodeRaw?: string) {
    return String(branchCodeRaw || 'MAC_DINH_CHI').trim().toUpperCase();
  }
}
