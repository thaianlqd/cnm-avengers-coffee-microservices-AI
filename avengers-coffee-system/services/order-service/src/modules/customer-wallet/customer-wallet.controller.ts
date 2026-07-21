import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CustomerWalletService } from './customer-wallet.service';

@Controller('customers/:customerId/wallet')
export class CustomerWalletController {
  constructor(private readonly walletService: CustomerWalletService) {}

  @Get()
  getWallet(@Param('customerId') customerId: string) {
    return this.walletService.getWallet(customerId);
  }

  @Post('topup')
  topUp(
    @Param('customerId') customerId: string,
    @Body() payload: { amount: number },
    @Req() req: Request,
  ) {
    return this.walletService.topUp(customerId, payload.amount, req.ip || '127.0.0.1');
  }
}
