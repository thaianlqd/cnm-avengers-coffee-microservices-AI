import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';

export type DomainEvent = {
  routingKey: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly exchangeName = process.env.RABBITMQ_EXCHANGE || 'avengers.domain.events';
  private readonly queueName = process.env.RABBITMQ_QUEUE || 'order-service.domain.events';
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private readonly handlers = new Set<(event: DomainEvent) => Promise<void> | void>();

  async onModuleInit() {
    try {
      this.connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost:5672');
      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange(this.exchangeName, 'topic', { durable: true });
      const assertedQueue = await this.channel.assertQueue(this.queueName, { durable: true });
      await this.channel.bindQueue(assertedQueue.queue, this.exchangeName, 'order.*');
      await this.channel.bindQueue(assertedQueue.queue, this.exchangeName, 'payment.*');
      await this.channel.bindQueue(assertedQueue.queue, this.exchangeName, 'notification.*');

      await this.channel.consume(assertedQueue.queue, async (message) => {
        if (!message) return;

        try {
          const event = JSON.parse(message.content.toString()) as DomainEvent;
          for (const handler of this.handlers) {
            await handler(event);
          }
          this.channel?.ack(message);
        } catch (error) {
          console.warn('[rabbitmq] Khong xu ly duoc domain event', error);
          this.channel?.nack(message, false, false);
        }
      });
    } catch (error) {
      this.connection = null;
      this.channel = null;
      console.warn('[rabbitmq] Khong the ket noi RabbitMQ, he thong se tiep tuc ma khong co event bus.');
    }
  }

  async onModuleDestroy() {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
    this.channel = null;
    this.connection = null;
  }

  subscribe(handler: (event: DomainEvent) => Promise<void> | void) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async publish(routingKey: string, payload: Record<string, unknown>) {
    if (!this.channel) {
      return false;
    }

    const event: DomainEvent = {
      routingKey,
      occurredAt: new Date().toISOString(),
      payload,
    };

    return this.channel.publish(
      this.exchangeName,
      routingKey,
      Buffer.from(JSON.stringify(event)),
      { contentType: 'application/json', persistent: true },
    );
  }
}
