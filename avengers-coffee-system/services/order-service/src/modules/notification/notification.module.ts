import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThongBao } from './entities/thong-bao.entity';
import { NotificationGateway } from './notification.gateway';
import { NotificationService } from './notification.service';
import { TrackingStompService } from './tracking-stomp.service';

@Module({
  imports: [TypeOrmModule.forFeature([ThongBao])],
  providers: [NotificationService, NotificationGateway, TrackingStompService],
  exports: [NotificationService, NotificationGateway, TrackingStompService],
})
export class NotificationModule {}
