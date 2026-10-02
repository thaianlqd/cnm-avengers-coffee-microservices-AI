import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SmtpConfig } from './smtp-config.entity';
import { SmtpService } from './smtp.service';
import { SmtpController } from './smtp.controller';
import { DeliveryTracking } from '../shipper/features_thaian/delivery-tracking.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SmtpConfig, DeliveryTracking])],
  controllers: [SmtpController],
  providers: [SmtpService],
  exports: [SmtpService],
})
export class SmtpModule {}
