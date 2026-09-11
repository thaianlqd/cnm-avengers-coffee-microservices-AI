import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { User } from './user.entity';
import { DeliveryAddress } from './delivery-address.entity';
import { KhuVuc } from './khu-vuc.entity';
import { Promotion } from './promotion.entity';
import { PromotionUsage } from './promotion-usage.entity';
import { MembershipConfig } from './membership-config.entity';
import { WalletTransaction } from './wallet-transaction.entity';
import { Branch } from './branch.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User, 
      DeliveryAddress, 
      KhuVuc, 
      Promotion, 
      PromotionUsage, 
      MembershipConfig,
      WalletTransaction,
      Branch
    ])
  ],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService]
})
export class UserModule {}