import { Global, Module } from '@nestjs/common';
import { RealtimeAnalyticsService } from './analytics/realtime-analytics.service';
import { RedisCacheService } from './cache/redis-cache.service';
import { RabbitMqService } from './messaging/rabbitmq.service';

@Global()
@Module({
  providers: [RedisCacheService, RabbitMqService, RealtimeAnalyticsService],
  exports: [RedisCacheService, RabbitMqService, RealtimeAnalyticsService],
})
export class InfrastructureModule {}
