import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartController } from './cart.controller';
import { CartItem } from './cart.entity';
import { CartService } from './cart.service';
import { VoucherModule } from '../voucher/voucher.module';
import { ProductConfigurationValidator } from './product-configuration-validator.service';

@Module({
	imports: [TypeOrmModule.forFeature([CartItem]), VoucherModule],
	controllers: [CartController],
	providers: [CartService, ProductConfigurationValidator],
	exports: [CartService, ProductConfigurationValidator],
})
export class CartModule {}
