import { Controller, Post, Body, Get, Param, UseGuards, Req, ParseUUIDPipe } from '@nestjs/common';
import { GiftCardService } from './gift-card.service';
import { PurchaseGiftCardDto, RedeemGiftCardDto } from './dto/gift-card.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { assertAccountCheckoutOwner } from '../../auth/cart-auth.guard';

@Controller('gift-cards')
export class GiftCardController {
  constructor(private readonly giftCardService: GiftCardService) {}

  @Get('themes')
  getThemes() { return this.giftCardService.getThemes(); }

  @Post('purchase')
  @UseGuards(JwtAuthGuard)
  purchaseGiftCard(@Body() dto: PurchaseGiftCardDto, @Req() req: any) {
    assertAccountCheckoutOwner(req.user, dto.sender_id);
    return this.giftCardService.purchaseGiftCard(dto);
  }

  @Post('validate')
  @UseGuards(JwtAuthGuard)
  validateGiftCard(@Body() dto: RedeemGiftCardDto, @Req() req: any) {
    assertAccountCheckoutOwner(req.user, dto.customer_id);
    return this.giftCardService.validateGiftCard(dto.code, dto.customer_id);
  }

  @Post('redeem')
  @UseGuards(JwtAuthGuard)
  redeemGiftCard(@Body() dto: RedeemGiftCardDto, @Req() req: any) {
    assertAccountCheckoutOwner(req.user, dto.customer_id);
    return this.giftCardService.redeemGiftCard(dto);
  }

  @Get('my-cards/:customerId')
  @UseGuards(JwtAuthGuard)
  getMyGiftCards(@Param('customerId', ParseUUIDPipe) customerId: string, @Req() req: any) {
    assertAccountCheckoutOwner(req.user, customerId);
    return this.giftCardService.getMyGiftCards(customerId);
  }

  @Post('transfer-balance')
  @UseGuards(JwtAuthGuard)
  transferGiftCardBalance(@Body() dto: { gift_card_id: string; customer_id: string }, @Req() req: any) {
    assertAccountCheckoutOwner(req.user, dto.customer_id);
    return this.giftCardService.transferGiftCardBalance(dto.gift_card_id, dto.customer_id);
  }

  @Get(':code')
  @UseGuards(JwtAuthGuard)
  getGiftCardDetails(@Param('code') code: string, @Req() req: any) {
    assertAccountCheckoutOwner(req.user, req.user.sub);
    return this.giftCardService.getGiftCardDetails(code, req.user.sub);
  }
}
