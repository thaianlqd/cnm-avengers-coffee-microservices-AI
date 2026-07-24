import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GiftCard } from './entities/gift-card.entity';
import { GiftCardTheme } from './entities/gift-card-theme.entity';
import { GiftCardController } from './gift-card.controller';
import { GiftCardService } from './gift-card.service';
import { CustomerWalletModule } from '../customer-wallet/customer-wallet.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GiftCard, GiftCardTheme]),
    CustomerWalletModule
  ],
  controllers: [GiftCardController],
  providers: [GiftCardService],
  exports: [GiftCardService]
})
export class GiftCardModule {}
