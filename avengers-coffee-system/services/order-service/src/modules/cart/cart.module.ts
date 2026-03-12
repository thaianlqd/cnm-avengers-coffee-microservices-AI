import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartController } from './cart.controller';
import { CartItem } from './cart.entity';
import { CartService } from './cart.service';

@Module({
	imports: [TypeOrmModule.forFeature([CartItem])],
	controllers: [CartController],
	providers: [CartService],
	exports: [CartService],
})
export class CartModule {}
