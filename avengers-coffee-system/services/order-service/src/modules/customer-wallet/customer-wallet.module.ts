import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerWallet } from './entities/customer-wallet.entity';
import { CustomerWalletTransaction } from './entities/customer-wallet-transaction.entity';
import { CustomerWalletController } from './customer-wallet.controller';
import { CustomerWalletService } from './customer-wallet.service';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerWallet, CustomerWalletTransaction])],
  controllers: [CustomerWalletController],
  providers: [CustomerWalletService],
  exports: [CustomerWalletService],
})
export class CustomerWalletModule {}
