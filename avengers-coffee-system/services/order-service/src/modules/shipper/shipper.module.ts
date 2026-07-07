import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shipper } from './entities/shipper.entity';
import { ShipperDelivery } from './entities/shipper-delivery.entity';
import { ShipperWallet } from './entities/shipper-wallet.entity';
import { ShipperSchedule } from './entities/shipper-schedule.entity';
import { ShipperException } from './entities/shipper-exception.entity';
import { ShipperService } from './shipper.service';
import { ShipperController } from './shipper.controller';
import { DonHang } from '../thanh-toan/entities/don-hang.entity';
import { ChiTietDonHang } from '../thanh-toan/entities/chi-tiet-don-hang.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Shipper, ShipperDelivery, ShipperWallet, ShipperSchedule, ShipperException, DonHang, ChiTietDonHang])],
  providers: [ShipperService],
  controllers: [ShipperController],
  exports: [ShipperService],
})
export class ShipperModule {}
