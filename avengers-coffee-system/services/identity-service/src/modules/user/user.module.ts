import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from './branch.entity';
import { DeliveryAddress } from './delivery-address.entity';
import { Promotion } from './promotion.entity';
import { PromotionUsage } from './promotion-usage.entity';
import { User } from './user.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, DeliveryAddress, Branch, Promotion, PromotionUsage])],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService]
})
export class UserModule {}