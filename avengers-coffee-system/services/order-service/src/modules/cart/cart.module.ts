import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartController } from './cart.controller';
import { CartItem } from './cart.entity';
import { CartService } from './cart.service';
import { VoucherModule } from '../voucher/voucher.module';

@Module({
	imports: [TypeOrmModule.forFeature([CartItem]), VoucherModule],
	controllers: [CartController],
	providers: [CartService],
	exports: [CartService],
})
export class CartModule {}
