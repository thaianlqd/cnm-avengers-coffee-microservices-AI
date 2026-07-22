import { Controller, Post, Body, Get, Param, UseGuards, Req } from '@nestjs/common';
import { GiftCardService } from './gift-card.service';
import { PurchaseGiftCardDto, RedeemGiftCardDto } from './dto/gift-card.dto';

@Controller('gift-cards')
export class GiftCardController {
  constructor(private readonly giftCardService: GiftCardService) {}

  @Get('themes')
  async getThemes() {
    return this.giftCardService.getThemes();
  }

  @Post('purchase')
  async purchaseGiftCard(@Body() dto: PurchaseGiftCardDto) {
    return this.giftCardService.purchaseGiftCard(dto);
  }

  @Post('redeem')
  async redeemGiftCard(@Body() dto: RedeemGiftCardDto) {
    return this.giftCardService.redeemGiftCard(dto);
  }

  @Get(':code')
  async getGiftCardDetails(@Param('code') code: string) {
    return this.giftCardService.getGiftCardDetails(code);
  }

  @Get('my-cards/:customerId')
  async getMyGiftCards(@Param('customerId') customerId: string) {
    return this.giftCardService.getMyGiftCards(customerId);
  }

  @Post('transfer-balance')
  async transferGiftCardBalance(@Body() dto: { gift_card_id: string; customer_id: string }) {
    return this.giftCardService.transferGiftCardBalance(dto.gift_card_id, dto.customer_id);
  }
}
