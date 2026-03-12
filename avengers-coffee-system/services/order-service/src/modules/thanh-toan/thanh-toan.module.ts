import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartItem } from '../cart/cart.entity';
import { NotificationModule } from '../notification/notification.module';
import { ChiTietDonHang } from './entities/chi-tiet-don-hang.entity';
import { DonHang } from './entities/don-hang.entity';
import { GiaoDichThanhToan } from './entities/giao-dich-thanh-toan.entity';
import { ThanhToanController, ThanhToanHeThongController } from './thanh-toan.controller';
import { ThanhToanService } from './thanh-toan.service';
import { VoucherModule } from '../voucher/voucher.module';

@Module({
  imports: [TypeOrmModule.forFeature([CartItem, DonHang, ChiTietDonHang, GiaoDichThanhToan]), NotificationModule, VoucherModule],
  controllers: [ThanhToanController, ThanhToanHeThongController],
  providers: [ThanhToanService],
  exports: [ThanhToanService],
})
export class ThanhToanModule {}
