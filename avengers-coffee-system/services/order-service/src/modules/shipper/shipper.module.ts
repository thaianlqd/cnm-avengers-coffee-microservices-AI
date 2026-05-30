import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shipper } from './entities/shipper.entity';
import { ShipperDelivery } from './entities/shipper-delivery.entity';
import { ShipperService } from './shipper.service';
import { ShipperController } from './shipper.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Shipper, ShipperDelivery])],
  providers: [ShipperService],
  controllers: [ShipperController],
  exports: [ShipperService],
})
export class ShipperModule {}
