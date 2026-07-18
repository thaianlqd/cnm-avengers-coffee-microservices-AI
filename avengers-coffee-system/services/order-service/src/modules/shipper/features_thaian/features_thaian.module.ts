import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryTracking } from './delivery-tracking.entity';
import { LalamoveService } from './lalamove.service';
import { LalamoveController } from './lalamove.controller';
import { DeliveryTrackingService } from './delivery-tracking.service';
import { DeliveryTrackingController } from './delivery-tracking.controller';

// Import entities từ modules gốc (cần cho inject repository)
import { ShipperDelivery } from '../entities/shipper-delivery.entity';
import { Shipper } from '../entities/shipper.entity';
import { DonHang } from '../../thanh-toan/entities/don-hang.entity';
import { ChiTietDonHang } from '../../thanh-toan/entities/chi-tiet-don-hang.entity';

/**
 * FeaturesThaianModule — Module chứa tất cả tính năng mới:
 * - Lalamove API integration
 * - Delivery Tracking (unified cho cả Lalamove + internal)
 *
 * Để sử dụng, thêm vào app.module.ts:
 *   imports: [..., FeaturesThaianModule]
 *   entities: [..., DeliveryTracking]
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      DeliveryTracking,
      ShipperDelivery,
      Shipper,
      DonHang,
      ChiTietDonHang,
    ]),
  ],
  controllers: [LalamoveController, DeliveryTrackingController],
  providers: [LalamoveService, DeliveryTrackingService],
  exports: [LalamoveService, DeliveryTrackingService],
})
export class FeaturesThaianModule {}
