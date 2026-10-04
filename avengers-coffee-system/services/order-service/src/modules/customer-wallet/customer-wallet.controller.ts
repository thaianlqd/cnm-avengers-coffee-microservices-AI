import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CustomerWalletService } from './customer-wallet.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { assertAccountCheckoutOwner } from '../../auth/cart-auth.guard';

@Controller('customers/:customerId/wallet')
@UseGuards(JwtAuthGuard)
export class CustomerWalletController {
  constructor(private readonly walletService: CustomerWalletService) {}

  @Get()
  getWallet(@Param('customerId') customerId: string, @Req() req: Request) {
    assertAccountCheckoutOwner((req as any).user, customerId);
    return this.walletService.getWallet(customerId);
  }

  @Get('topup/:transactionId')
  topUpStatus(@Param('customerId') customerId: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string, @Req() req: Request) {
    assertAccountCheckoutOwner((req as any).user, customerId);
    return this.walletService.getTopUpStatus(customerId, transactionId);
  }

  @Post('topup')
  topUp(
    @Param('customerId') customerId: string,
    @Body() payload: { amount: number },
    @Req() req: Request,
  ) {
    assertAccountCheckoutOwner((req as any).user, customerId);
    return this.walletService.topUp(customerId, payload.amount, req.ip || '127.0.0.1');
  }
}
